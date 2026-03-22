"""Kokoro TTS sidecar — kokoro-onnx backend with ROCm/CPU support."""

from __future__ import annotations

import io
import logging
import os
import re
import shutil
import struct
import urllib.request
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field

# RDNA3 GPUs (gfx1100/1101/1102, e.g. RX 7600 XT) may need this for ROCm stacks.
if "HSA_OVERRIDE_GFX_VERSION" not in os.environ:
    os.environ["HSA_OVERRIDE_GFX_VERSION"] = "11.0.0"

logger = logging.getLogger("kokoro-sidecar")
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

SERVICE_NAME = "kokoro-sidecar"
SERVICE_DIR = Path(__file__).resolve().parent
MODELS_DIR = SERVICE_DIR / "models"
MAX_TEXT_LENGTH = 5000
SAMPLE_RATE = 24000

SUPPORTED_LANGUAGES = [
    "en-us",
    "en-gb",
    "es",
    "fr",
    "hi",
    "it",
    "ja",
    "pt",
    "zh",
]

VOICES_US = [
    "af_heart",
    "af_bella",
    "af_nicole",
    "am_fenrir",
    "am_michael",
]

VOICES_GB = [
    "bf_emma",
    "bm_fable",
]

ALL_VOICES = set(VOICES_US + VOICES_GB)
CYRILLIC_RE = re.compile(r"[\u0400-\u04FF]")
DEFAULT_MODEL_URL = (
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/"
    "model-files-v1.0/kokoro-v1.0.onnx"
)
DEFAULT_VOICES_URL = (
    "https://github.com/thewh1teagle/kokoro-onnx/releases/download/"
    "model-files-v1.0/voices-v1.0.bin"
)


def _wav_from_samples(samples: np.ndarray, sample_rate: int) -> bytes:
    pcm = (np.clip(samples.flatten(), -1.0, 1.0) * 32767).astype(np.int16)
    data = pcm.tobytes()
    channels, sampwidth = 1, 2
    buf = io.BytesIO()
    buf.write(b"RIFF")
    buf.write(struct.pack("<I", 36 + len(data)))
    buf.write(b"WAVE")
    buf.write(b"fmt ")
    buf.write(
        struct.pack(
            "<IHHIIHH",
            16,
            1,
            channels,
            sample_rate,
            sample_rate * channels * sampwidth,
            channels * sampwidth,
            sampwidth * 8,
        )
    )
    buf.write(b"data")
    buf.write(struct.pack("<I", len(data)))
    buf.write(data)
    return buf.getvalue()


def _download_file(url: str, destination: Path) -> None:
    destination.parent.mkdir(parents=True, exist_ok=True)
    tmp_path = destination.with_suffix(destination.suffix + ".tmp")
    logger.info("Kokoro ONNX: downloading %s -> %s", url, destination)
    with urllib.request.urlopen(url) as response, tmp_path.open("wb") as target:
        shutil.copyfileobj(response, target)
    tmp_path.replace(destination)


@dataclass(frozen=True)
class AppConfig:
    host: str
    port: int
    use_gpu: bool
    model_path: Path
    voices_path: Path
    model_url: str
    voices_url: str

    @classmethod
    def from_env(cls) -> "AppConfig":
        return cls(
            host=os.getenv("KOKORO_HOST", "0.0.0.0"),
            port=int(os.getenv("KOKORO_PORT", "8200")),
            use_gpu=os.getenv("KOKORO_USE_GPU", "true").lower()
            in {"1", "true", "yes", "on"},
            model_path=Path(
                os.getenv(
                    "KOKORO_ONNX_MODEL_PATH",
                    str(MODELS_DIR / "kokoro-v1.0.onnx"),
                )
            ),
            voices_path=Path(
                os.getenv(
                    "KOKORO_ONNX_VOICES_PATH",
                    str(MODELS_DIR / "voices-v1.0.bin"),
                )
            ),
            model_url=os.getenv("KOKORO_ONNX_MODEL_URL", DEFAULT_MODEL_URL),
            voices_url=os.getenv("KOKORO_ONNX_VOICES_URL", DEFAULT_VOICES_URL),
        )


class TtsRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text: str = Field(min_length=1, max_length=MAX_TEXT_LENGTH)
    voice: str = Field(default="af_heart")
    lang: str = Field(default="en-us")
    speed: float = Field(default=1.0, ge=0.5, le=2.0)


class KokoroEngine:
    def __init__(self, config: AppConfig) -> None:
        self._config = config
        self._engine: Any = None
        self._provider = "CPUExecutionProvider"

    @property
    def ready(self) -> bool:
        return self._engine is not None

    @property
    def device_name(self) -> str:
        return "cpu" if self._provider == "CPUExecutionProvider" else "gpu (ROCm/CUDA)"

    def _ensure_assets(self) -> None:
        if not self._config.model_path.exists():
            _download_file(self._config.model_url, self._config.model_path)
        if not self._config.voices_path.exists():
            _download_file(self._config.voices_url, self._config.voices_path)

    def _select_providers(self, available: list[str]) -> list[str]:
        env_provider = os.getenv("ONNX_PROVIDER")
        if env_provider:
            requested = [env_provider]
        elif self._config.use_gpu:
            requested = [
                "ROCMExecutionProvider",
                "CUDAExecutionProvider",
            ]
        else:
            requested = []

        providers = [provider for provider in requested if provider in available]
        if "CPUExecutionProvider" not in providers:
            providers.append("CPUExecutionProvider")
        return providers

    def start(self) -> None:
        import onnxruntime as ort
        from kokoro_onnx import Kokoro

        self._ensure_assets()
        available = ort.get_available_providers()
        providers = self._select_providers(available)
        logger.info("Kokoro ONNX: available providers=%s", available)
        attempt_lists = [providers]
        if providers != ["CPUExecutionProvider"]:
            attempt_lists.append(["CPUExecutionProvider"])

        last_error: Exception | None = None
        for attempt in attempt_lists:
            try:
                logger.info("Kokoro ONNX: selected providers=%s", attempt)
                session = ort.InferenceSession(str(self._config.model_path), providers=attempt)
                provider = session.get_providers()[0]
                engine = Kokoro.from_session(
                    session,
                    voices_path=str(self._config.voices_path),
                )
                logger.info("Kokoro ONNX: running probe synthesis...")
                engine.create("test", voice="af_heart", speed=1.0, lang="en-us")
                self._provider = provider
                self._engine = engine
                logger.info(
                    "Kokoro ready. device=%s, provider=%s, voices=%d",
                    self.device_name,
                    self._provider,
                    len(VOICES_US) + len(VOICES_GB),
                )
                return
            except Exception as exc:
                last_error = exc
                logger.warning(
                    "Kokoro ONNX provider attempt failed for %s: %s",
                    attempt,
                    exc,
                )

        raise RuntimeError(f"Failed to initialize Kokoro ONNX: {last_error}") from last_error

    def synthesize(self, req: TtsRequest) -> bytes:
        if not self.ready:
            raise HTTPException(status_code=503, detail="Kokoro not loaded")

        voice = req.voice if req.voice in ALL_VOICES else "af_heart"
        lang = req.lang if req.lang in SUPPORTED_LANGUAGES else "en-us"

        if voice.startswith(("bf_", "bm_")) and req.lang == "en-us":
            lang = "en-gb"

        if lang in {"en-us", "en-gb"} and CYRILLIC_RE.search(req.text):
            raise HTTPException(
                status_code=400,
                detail=(
                    "Kokoro in this stack supports English voices only. "
                    "Cyrillic text should use another TTS engine."
                ),
            )

        try:
            audio, sample_rate = self._engine.create(
                req.text,
                voice=voice,
                speed=req.speed,
                lang=lang,
            )
            audio = np.asarray(audio, dtype=np.float32)
            if audio.size == 0:
                raise HTTPException(status_code=500, detail="Kokoro produced no audio")
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Kokoro synthesis error: {exc}",
            ) from exc

        return _wav_from_samples(audio, sample_rate or SAMPLE_RATE)


def get_engine(request: Request) -> KokoroEngine:
    engine = getattr(request.app.state, "kokoro", None)
    if not isinstance(engine, KokoroEngine):
        raise HTTPException(status_code=503, detail="Kokoro engine not available")
    return engine


def create_app(config: Optional[AppConfig] = None) -> FastAPI:
    config = config or AppConfig.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        engine = KokoroEngine(config)
        engine.start()
        app.state.kokoro = engine
        app.state.config = config
        yield

    app = FastAPI(
        title="Kokoro TTS Sidecar",
        description="Kokoro TTS (ONNX Runtime) — ROCm/CUDA/CPU — en-US, en-GB + more",
        version="3.0.0",
        lifespan=lifespan,
    )

    @app.get("/health")
    async def health_check(request: Request) -> dict[str, Any]:
        engine = get_engine(request)
        return {
            "status": "healthy" if engine.ready else "loading",
            "service": SERVICE_NAME,
            "ready": engine.ready,
            "device": engine.device_name,
            "provider": engine._provider,
            "voices_us": VOICES_US,
            "voices_gb": VOICES_GB,
            "languages": SUPPORTED_LANGUAGES,
        }

    @app.post("/tts")
    async def text_to_speech(body: TtsRequest, request: Request) -> Response:
        engine = get_engine(request)
        try:
            wav_bytes = engine.synthesize(body)
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("Kokoro synthesis failed")
            raise HTTPException(status_code=500, detail=f"TTS error: {exc}") from exc

        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={"Content-Disposition": "attachment; filename=speech.wav"},
        )

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    runtime_config = AppConfig.from_env()
    uvicorn.run("main:app", host=runtime_config.host, port=runtime_config.port)
