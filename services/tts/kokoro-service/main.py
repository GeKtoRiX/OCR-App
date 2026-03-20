"""Kokoro TTS sidecar — PyTorch backend (hexgrad/kokoro) with ROCm GPU support."""

from __future__ import annotations

import os

# RDNA3 GPUs (gfx1100/1101/1102, e.g. RX 7600 XT) need this before torch import
if "HSA_OVERRIDE_GFX_VERSION" not in os.environ:
    os.environ["HSA_OVERRIDE_GFX_VERSION"] = "11.0.0"

import io
import logging
import struct
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any, Optional

import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger("kokoro-sidecar")
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

SERVICE_NAME = "kokoro-sidecar"
MAX_TEXT_LENGTH = 5000
SAMPLE_RATE = 24000

# Language code → KPipeline lang_code
LANG_CODES = {
    "en-us": "a",  # American English
    "en-gb": "b",  # British English
    "es": "e",     # Spanish
    "fr": "f",     # French
    "hi": "h",     # Hindi
    "it": "i",     # Italian
    "ja": "j",     # Japanese
    "pt": "p",     # Brazilian Portuguese
    "zh": "z",     # Mandarin Chinese
}

# American English voices (af_ = female, am_ = male)
VOICES_US = [
    "af_heart", "af_alloy", "af_aoede", "af_bella", "af_jessica",
    "af_kore",  "af_nicole", "af_nova",  "af_river", "af_sarah", "af_sky",
    "am_adam",  "am_echo",  "am_eric",  "am_fenrir", "am_liam",
    "am_michael", "am_onyx", "am_puck", "am_santa",
]

# British English voices (bf_ = female, bm_ = male)
VOICES_GB = [
    "bf_alice", "bf_emma", "bf_isabella", "bf_lily",
    "bm_daniel", "bm_fable", "bm_george", "bm_lewis",
]

ALL_VOICES = set(VOICES_US + VOICES_GB)


# ─── helpers ───────────────────────────────────────────────────────────────────

def _wav_from_samples(samples: np.ndarray, sample_rate: int) -> bytes:
    pcm = (np.clip(samples.flatten(), -1.0, 1.0) * 32767).astype(np.int16)
    data = pcm.tobytes()
    channels, sampwidth = 1, 2
    buf = io.BytesIO()
    buf.write(b"RIFF")
    buf.write(struct.pack("<I", 36 + len(data)))
    buf.write(b"WAVE")
    buf.write(b"fmt ")
    buf.write(struct.pack(
        "<IHHIIHH", 16, 1, channels,
        sample_rate, sample_rate * channels * sampwidth,
        channels * sampwidth, sampwidth * 8,
    ))
    buf.write(b"data")
    buf.write(struct.pack("<I", len(data)))
    buf.write(data)
    return buf.getvalue()


# ─── AppConfig ─────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class AppConfig:
    host: str
    port: int
    use_gpu: bool

    @classmethod
    def from_env(cls) -> "AppConfig":
        return cls(
            host=os.getenv("KOKORO_HOST", "0.0.0.0"),
            port=int(os.getenv("KOKORO_PORT", "8200")),
            use_gpu=os.getenv("KOKORO_USE_GPU", "true").lower() in {"1", "true", "yes", "on"},
        )


# ─── Request model ─────────────────────────────────────────────────────────────

class TtsRequest(BaseModel):
    model_config = ConfigDict(extra="ignore")

    text:  str   = Field(min_length=1, max_length=MAX_TEXT_LENGTH)
    voice: str   = Field(default="af_heart")
    lang:  str   = Field(default="en-us")
    speed: float = Field(default=1.0, ge=0.5, le=2.0)


# ─── KokoroEngine ──────────────────────────────────────────────────────────────

class KokoroEngine:
    def __init__(self, config: AppConfig) -> None:
        self._config = config
        self._pipelines: dict[str, Any] = {}  # lang_code → KPipeline
        self._device = "cpu"

    @property
    def ready(self) -> bool:
        return len(self._pipelines) > 0

    @property
    def device_name(self) -> str:
        if self._device == "cuda":
            return "gpu (ROCm/CUDA)"
        return "cpu"

    def start(self) -> None:
        import torch
        from kokoro import KPipeline

        # Determine device
        if self._config.use_gpu and torch.cuda.is_available():
            self._device = "cuda"
            gpu_name = torch.cuda.get_device_name(0)
            logger.info("Kokoro: GPU detected — %s", gpu_name)
        else:
            self._device = "cpu"
            if self._config.use_gpu:
                logger.warning("Kokoro: GPU requested but not available, using CPU")

        # Pre-load American English pipeline (most common)
        logger.info("Kokoro: loading pipeline (lang=a, device=%s)...", self._device)
        pipeline = KPipeline(lang_code="a", device=self._device)
        self._pipelines["a"] = pipeline

        # Probe: run a tiny synthesis to verify everything works
        logger.info("Kokoro: running probe synthesis...")
        for _, _, audio in pipeline("test", voice="af_heart", speed=1.0):
            break  # just need one chunk
        logger.info("Kokoro ready. device=%s, voices=%d",
                    self.device_name, len(VOICES_US) + len(VOICES_GB))

    def _get_pipeline(self, lang_code: str) -> Any:
        if lang_code in self._pipelines:
            return self._pipelines[lang_code]

        from kokoro import KPipeline
        logger.info("Kokoro: lazy-loading pipeline for lang=%s", lang_code)
        pipeline = KPipeline(lang_code=lang_code, device=self._device)
        self._pipelines[lang_code] = pipeline
        return pipeline

    def synthesize(self, req: TtsRequest) -> bytes:
        if not self.ready:
            raise HTTPException(status_code=503, detail="Kokoro not loaded")

        voice = req.voice if req.voice in ALL_VOICES else "af_heart"

        # Determine language from voice prefix or request
        if voice.startswith(("bf_", "bm_")):
            lang_code = "b"  # British English
        else:
            lang_code = LANG_CODES.get(req.lang, "a")

        pipeline = self._get_pipeline(lang_code)

        try:
            # Collect all audio chunks from the generator
            audio_chunks = []
            for _, _, audio in pipeline(req.text, voice=voice, speed=req.speed):
                if audio is not None:
                    audio_chunks.append(np.asarray(audio, dtype=np.float32))

            if not audio_chunks:
                raise HTTPException(status_code=500, detail="Kokoro produced no audio")

            full_audio = np.concatenate(audio_chunks)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Kokoro synthesis error: {exc}") from exc

        return _wav_from_samples(full_audio, SAMPLE_RATE)


# ─── DI helper ─────────────────────────────────────────────────────────────────

def get_engine(request: Request) -> KokoroEngine:
    engine = getattr(request.app.state, "kokoro", None)
    if not isinstance(engine, KokoroEngine):
        raise HTTPException(status_code=503, detail="Kokoro engine not available")
    return engine


# ─── App factory ───────────────────────────────────────────────────────────────

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
        description="Kokoro TTS (PyTorch) — ROCm/CUDA/CPU — en-US, en-GB + more",
        version="3.0.0",
        lifespan=lifespan,
    )

    @app.get("/health")
    async def health_check(request: Request) -> dict[str, Any]:
        engine = get_engine(request)
        return {
            "status": "healthy" if engine.ready else "loading",
            "service": SERVICE_NAME,
            "device": engine.device_name,
            "voices_us": VOICES_US,
            "voices_gb": VOICES_GB,
            "languages": list(LANG_CODES.keys()),
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
