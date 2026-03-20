"""Qwen3-TTS CustomVoice sidecar service."""

from __future__ import annotations

import gc
import io
import logging
import os
import struct
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger("qwen-tts-sidecar")
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

SERVICE_NAME = "qwen-tts-sidecar"
MAX_TEXT_LENGTH = 5000
QWEN_MODE = "custom_voice"
QWEN_SPEAKERS = [
    "Vivian",
    "Serena",
    "Uncle_Fu",
    "Dylan",
    "Eric",
    "Ryan",
    "Aiden",
    "Ono_Anna",
    "Sohee",
]
QWEN_LANGS = [
    "Auto",
    "Chinese",
    "English",
    "Japanese",
    "Korean",
    "German",
    "French",
    "Russian",
    "Portuguese",
    "Spanish",
    "Italian",
]


def _wav_from_pcm(pcm_int16: bytes, sample_rate: int) -> bytes:
    buf = io.BytesIO()
    channels, sampwidth = 1, 2
    data_size = len(pcm_int16)
    buf.write(b"RIFF")
    buf.write(struct.pack("<I", 36 + data_size))
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
    buf.write(struct.pack("<I", data_size))
    buf.write(pcm_int16)
    return buf.getvalue()


def _float_wav_to_bytes(waveform: Any, sample_rate: int) -> bytes:
    arr = np.asarray(waveform, dtype=np.float32).squeeze()
    if arr.ndim != 1:
        raise ValueError("Qwen returned an unexpected waveform shape")
    pcm = (np.clip(arr, -1.0, 1.0) * 32767).astype(np.int16)
    return _wav_from_pcm(pcm.tobytes(), sample_rate)


@dataclass(frozen=True)
class AppConfig:
    host: str
    port: int
    require_gpu: bool
    custom_voice_model: str
    use_flash_attn: bool
    attn_implementation: str
    dtype: str
    hsa_override_gfx_version: Optional[str]

    @classmethod
    def from_env(cls) -> "AppConfig":
        return cls(
            host=os.getenv("QWEN_TTS_HOST", "0.0.0.0"),
            port=int(os.getenv("QWEN_TTS_PORT", "8300")),
            require_gpu=os.getenv("QWEN_TTS_REQUIRE_GPU", "true").lower()
            in {"1", "true", "yes", "on"},
            custom_voice_model=os.getenv(
                "QWEN_TTS_CUSTOMVOICE_MODEL",
                "Qwen/Qwen3-TTS-12Hz-1.7B-CustomVoice",
            ),
            use_flash_attn=os.getenv("QWEN_TTS_USE_FLASH_ATTN", "false").lower()
            in {"1", "true", "yes", "on"},
            attn_implementation=os.getenv("QWEN_TTS_ATTN_IMPLEMENTATION", "eager").strip().lower(),
            dtype=os.getenv("QWEN_TTS_DTYPE", "auto").lower(),
            hsa_override_gfx_version=(
                os.getenv("QWEN_TTS_HSA_OVERRIDE_GFX_VERSION", "").strip() or None
            ),
        )


class TtsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    text: str = Field(min_length=1, max_length=MAX_TEXT_LENGTH)
    qwen_mode: str = Field(default=QWEN_MODE, alias="qwenMode")
    lang: str = Field(default="English")
    speaker: Optional[str] = None
    instruct: Optional[str] = None


class QwenEngine:
    def __init__(self, config: AppConfig) -> None:
        self._config = config
        self._model: Optional[Any] = None
        self._device_name: Optional[str] = None
        self._languages: list[str] = list(QWEN_LANGS)
        self._speakers: list[str] = list(QWEN_SPEAKERS)
        self._startup_error: Optional[str] = None

    @property
    def ready(self) -> bool:
        return self._model is not None and self._startup_error is None

    @property
    def device_kind(self) -> Optional[str]:
        if self._device_name is None:
            return None
        if self._device_name.startswith(("cuda", "hip")):
            return "gpu"
        return "cpu"

    @property
    def startup_error(self) -> Optional[str]:
        return self._startup_error

    @property
    def speakers(self) -> list[str]:
        return self._speakers

    @property
    def languages(self) -> list[str]:
        return self._languages

    def start(self) -> None:
        try:
            self._load_models()
        except Exception as exc:
            self._startup_error = str(exc)
            logger.exception("Qwen TTS startup failed")
            raise

    def set_startup_error(self, error: str) -> None:
        self._startup_error = error

    def _load_models(self) -> None:
        self._apply_runtime_overrides()
        import torch
        from qwen_tts import Qwen3TTSModel

        if not torch.cuda.is_available():
            raise RuntimeError("Qwen TTS requires a GPU, but torch.cuda.is_available() is false")

        dtype_candidates = self._resolve_dtypes(torch)
        attn_implementation = self._resolve_attn_implementation()
        last_error: Optional[Exception] = None

        for dtype_name, dtype_value in dtype_candidates:
            try:
                logger.info("Qwen TTS: loading models with dtype=%s", dtype_name)
                common_kwargs: dict[str, Any] = {
                    "device_map": "cuda:0",
                    "dtype": dtype_value,
                }
                if attn_implementation is not None:
                    common_kwargs["attn_implementation"] = attn_implementation

                self._model = Qwen3TTSModel.from_pretrained(
                    self._config.custom_voice_model,
                    **common_kwargs,
                )
                self._device_name = self._detect_device(self._model) or "cuda:0"
                self._languages = self._resolve_languages(self._model)
                self._speakers = self._resolve_speakers(self._model)
                self._startup_error = None
                logger.info(
                    "Qwen TTS ready. device=%s custom_voice_model=%s",
                    self._device_name,
                    self._config.custom_voice_model,
                )
                return
            except Exception as exc:
                last_error = exc
                logger.warning("Qwen TTS load failed with dtype=%s: %s", dtype_name, exc)
                self._model = None
                gc.collect()
                if torch.cuda.is_available():
                    torch.cuda.empty_cache()

        raise RuntimeError(f"Could not load Qwen CustomVoice model on GPU: {last_error}")

    def _apply_runtime_overrides(self) -> None:
        if self._config.hsa_override_gfx_version:
            os.environ.setdefault(
                "HSA_OVERRIDE_GFX_VERSION",
                self._config.hsa_override_gfx_version,
            )

    def _resolve_attn_implementation(self) -> Optional[str]:
        if self._config.use_flash_attn:
            return "flash_attention_2"
        if self._config.attn_implementation in {"", "auto", "default", "none"}:
            return None
        return self._config.attn_implementation

    def _resolve_dtypes(self, torch: Any) -> list[tuple[str, Any]]:
        if self._config.dtype == "bfloat16":
            return [("bfloat16", torch.bfloat16)]
        if self._config.dtype == "float16":
            return [("float16", torch.float16)]

        candidates: list[tuple[str, Any]] = []
        is_bf16_supported = getattr(torch.cuda, "is_bf16_supported", None)
        if callable(is_bf16_supported):
            try:
                if is_bf16_supported():
                    candidates.append(("bfloat16", torch.bfloat16))
            except Exception:
                pass
        if not candidates:
            candidates.append(("bfloat16", torch.bfloat16))
        candidates.append(("float16", torch.float16))
        return candidates

    def _detect_device(self, model: Any) -> Optional[str]:
        candidates = [
            getattr(model, "device", None),
            getattr(getattr(model, "model", None), "device", None),
        ]
        for candidate in candidates:
            if candidate is not None:
                return str(candidate)

        inner_model = getattr(model, "model", None)
        if inner_model is not None and hasattr(inner_model, "parameters"):
            try:
                return str(next(inner_model.parameters()).device)
            except Exception:
                return None

        return None

    def _resolve_languages(self, model: Any) -> list[str]:
        getter = getattr(model, "get_supported_languages", None)
        if callable(getter):
            try:
                langs = getter()
                if langs:
                    return list(langs)
            except Exception:
                logger.warning("Qwen TTS: failed to read supported languages", exc_info=True)
        return list(QWEN_LANGS)

    def _resolve_speakers(self, model: Any) -> list[str]:
        getter = getattr(model, "get_supported_speakers", None)
        if callable(getter):
            try:
                speakers = getter()
                if speakers:
                    return list(speakers)
            except Exception:
                logger.warning("Qwen TTS: failed to read supported speakers", exc_info=True)
        return list(QWEN_SPEAKERS)

    def synthesize(self, req: TtsRequest) -> bytes:
        if not self.ready:
            raise HTTPException(
                status_code=503,
                detail=self._startup_error or "Qwen TTS models are not loaded",
            )
        if self.device_kind != "gpu" and self._config.require_gpu:
            raise HTTPException(status_code=503, detail="Qwen TTS is not running on GPU")

        qwen_mode = req.qwen_mode.strip().lower()
        if qwen_mode == "voice_design":
            raise HTTPException(
                status_code=400,
                detail="qwenMode=voice_design is no longer supported; use custom_voice",
            )
        if qwen_mode != QWEN_MODE:
            raise HTTPException(status_code=400, detail=f"Unsupported qwenMode: {req.qwen_mode}")

        language = req.lang.strip() if req.lang.strip() else "English"
        instruct = req.instruct.strip() if req.instruct else None

        try:
            speaker = req.speaker if req.speaker in self._speakers else self._speakers[0]
            wavs, sample_rate = self._model.generate_custom_voice(
                text=req.text,
                language=language,
                speaker=speaker,
                instruct=instruct or "",
            )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Qwen synthesis failed: {exc}") from exc

        if not wavs:
            raise HTTPException(status_code=500, detail="Qwen synthesis returned no audio")
        return _float_wav_to_bytes(wavs[0], sample_rate)


class TtsService:
    def __init__(self, config: AppConfig) -> None:
        self._engine = QwenEngine(config)

    def start(self) -> None:
        self._engine.start()

    def set_startup_error(self, error: str) -> None:
        self._engine.set_startup_error(error)

    def synthesize(self, req: TtsRequest) -> bytes:
        return self._engine.synthesize(req)

    @property
    def engine(self) -> QwenEngine:
        return self._engine


def get_tts_service(request: Request) -> TtsService:
    service = getattr(request.app.state, "tts_service", None)
    if not isinstance(service, TtsService):
        raise HTTPException(status_code=503, detail="Qwen TTS service not available")
    return service


def create_app(config: Optional[AppConfig] = None) -> FastAPI:
    config = config or AppConfig.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        service = TtsService(config)
        try:
            service.start()
        except Exception as exc:
            service.set_startup_error(str(exc))
        app.state.config = config
        app.state.tts_service = service
        yield

    app = FastAPI(
        title="Qwen TTS Sidecar",
        description="Text-to-speech with Qwen3-TTS 1.7B CustomVoice",
        version="1.0.0",
        lifespan=lifespan,
    )

    @app.get("/health")
    async def health_check(request: Request) -> dict[str, Any]:
        svc = get_tts_service(request)
        engine = svc.engine
        return {
            "status": "healthy" if engine.ready else "unhealthy",
            "service": SERVICE_NAME,
            "ready": engine.ready,
            "device": engine.device_kind,
            "require_gpu": config.require_gpu,
            "startup_error": engine.startup_error,
            "model": config.custom_voice_model,
            "custom_voice": {
                "speakers": engine.speakers,
                "languages": engine.languages,
            },
        }

    @app.post("/api/tts")
    async def text_to_speech(body: TtsRequest, request: Request) -> Response:
        svc = get_tts_service(request)
        wav_bytes = svc.synthesize(body)
        return Response(
            content=wav_bytes,
            media_type="audio/wav",
            headers={
                "Content-Disposition": "attachment; filename=qwen_custom_voice.wav",
            },
        )

    return app


app = create_app()


if __name__ == "__main__":
    import uvicorn

    runtime_config = AppConfig.from_env()
    uvicorn.run("main:app", host=runtime_config.host, port=runtime_config.port)
