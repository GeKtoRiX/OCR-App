"""Production-oriented PaddleOCR sidecar service."""

from __future__ import annotations

import base64
import binascii
import io
import logging
import os
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Request
from PIL import Image, UnidentifiedImageError
from pydantic import BaseModel, ConfigDict, Field
from paddleocr import PaddleOCR


logger = logging.getLogger("paddleocr-sidecar")
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

SERVICE_NAME = "paddleocr-sidecar"
MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024


@dataclass(frozen=True)
class AppConfig:
    """Runtime configuration for the sidecar process."""

    host: str
    port: int
    lang: str
    use_angle_cls: bool
    use_gpu: bool

    @classmethod
    def from_env(cls) -> "AppConfig":
        return cls(
            host=os.getenv("PADDLEOCR_HOST", "0.0.0.0"),
            port=int(os.getenv("PADDLEOCR_PORT", "8000")),
            lang=os.getenv("PADDLEOCR_LANG", "en"),
            use_angle_cls=os.getenv("PADDLEOCR_USE_ANGLE_CLS", "true").lower()
            in {"1", "true", "yes", "on"},
            use_gpu=os.getenv("PADDLEOCR_USE_GPU", "true").lower()
            in {"1", "true", "yes", "on"},
        )


class Base64ImageRequest(BaseModel):
    """Incoming payload for the base64 extraction endpoint."""

    model_config = ConfigDict(extra="forbid")

    image_b64: str = Field(min_length=1)


class OCRService:
    """Thin wrapper around the PaddleOCR engine."""

    def __init__(self, config: AppConfig) -> None:
        self._config = config
        self._engine: Optional[PaddleOCR] = None

    @property
    def ready(self) -> bool:
        return self._engine is not None

    def start(self) -> None:
        logger.info("Loading PaddleOCR engine (use_gpu=%s)", self._config.use_gpu)
        self._engine = PaddleOCR(
            lang=self._config.lang,
            use_angle_cls=self._config.use_angle_cls,
            use_gpu=self._config.use_gpu,
        )
        logger.info("PaddleOCR engine loaded successfully")

    def extract_text(self, image_bytes: bytes) -> str:
        if not self._engine:
            raise HTTPException(status_code=503, detail="OCR engine not available")

        if len(image_bytes) > MAX_IMAGE_SIZE_BYTES:
            raise HTTPException(
                status_code=400,
                detail="Image too large. Max size: 10MB",
            )

        image_array = decode_image_bytes(image_bytes)
        result = self._engine.ocr(image_array)
        return extract_text_from_ocr_result(result)


def extract_text_from_ocr_result(result: Any) -> str:
    """Convert the PaddleOCR result structure into plain text.

    Supports both PaddleOCR 2.x (list of lists) and 3.x (list of dicts with rec_texts).
    """
    if not result:
        return ""

    lines: list[str] = []
    for page in result:
        if not page:
            continue
        # PaddleOCR 3.x: page is a dict with 'rec_texts' key
        if isinstance(page, dict):
            for text in page.get("rec_texts", []):
                if text:
                    lines.append(text)
        else:
            # PaddleOCR 2.x: page is a list of [bbox, (text, confidence)]
            for line in page:
                if line and len(line) >= 2:
                    text, _confidence = line[1]
                    lines.append(text)

    return "\n".join(lines)


def decode_base64_payload(image_b64: str) -> bytes:
    """Decode either raw base64 or a data URL into image bytes."""
    payload = image_b64.split(",", 1)[1] if "," in image_b64 else image_b64
    try:
        return base64.b64decode(payload, validate=True)
    except binascii.Error as exc:
        raise HTTPException(status_code=400, detail="Invalid base64 image payload") from exc


def decode_image_bytes(image_bytes: bytes) -> np.ndarray[Any, Any]:
    """Load image bytes and normalize the mode for OCR input."""
    try:
        image = Image.open(io.BytesIO(image_bytes))
    except UnidentifiedImageError as exc:
        raise HTTPException(status_code=400, detail="Invalid image format") from exc

    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")

    return np.array(image)


def get_ocr_service(request: Request) -> OCRService:
    service = getattr(request.app.state, "ocr_service", None)
    if not isinstance(service, OCRService):
        raise HTTPException(status_code=503, detail="OCR engine not available")
    return service


def build_model_metadata(config: AppConfig) -> dict[str, str]:
    """Expose the currently configured OCR stack in a stable shape."""
    return {
        "detector": "ch_PP-OCRv4_det",
        "recognizer": f"{config.lang}_PP-OCRv4_rec",
        "classifier": "ch_ppocr_mobile_v2.0_cls" if config.use_angle_cls else "disabled",
    }


def create_app(config: Optional[AppConfig] = None) -> FastAPI:
    config = config or AppConfig.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        service = OCRService(config)
        service.start()
        app.state.config = config
        app.state.ocr_service = service
        yield

    app = FastAPI(
        title="PaddleOCR Sidecar Service",
        description="OCR service using PaddleOCR engine for text extraction from images",
        version="1.0.0",
        lifespan=lifespan,
    )

    @app.get("/health")
    async def health_check(request: Request) -> dict[str, Any]:
        service = get_ocr_service(request)
        return {
            "status": "healthy" if service.ready else "unhealthy",
            "service": SERVICE_NAME,
            "model_loaded": service.ready,
            "device": "gpu" if service._config.use_gpu else "cpu",
        }

    @app.post("/api/extract/base64")
    async def extract_text_from_base64(
        body: Base64ImageRequest,
        request: Request,
    ) -> dict[str, Any]:
        service = get_ocr_service(request)
        image_bytes = decode_base64_payload(body.image_b64)

        try:
            extracted_text = service.extract_text(image_bytes)
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("OCR processing failed")
            raise HTTPException(
                status_code=500,
                detail=f"OCR processing error: {exc}",
            ) from exc

        return {
            "text": extracted_text,
            "size_bytes": len(image_bytes),
        }

    @app.get("/models")
    async def list_models(request: Request) -> dict[str, Any]:
        service = get_ocr_service(request)
        app_config = request.app.state.config
        return {
            "status": "healthy" if service.ready else "unhealthy",
            "service": SERVICE_NAME,
            "models": build_model_metadata(app_config),
        }

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    runtime_config = AppConfig.from_env()
    uvicorn.run(
        "main:app",
        host=runtime_config.host,
        port=runtime_config.port,
        factory=False,
    )
