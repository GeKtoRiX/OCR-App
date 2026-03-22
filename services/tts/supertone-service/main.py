"""Supertone TTS sidecar service — Supertonic + Piper TTS engines."""

from __future__ import annotations

import io
import logging
import os
import struct
import threading
import wave
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional

# Redirect model caches to project-local models/ directory.
# These must be set before supertonic/piper/huggingface_hub are imported (all lazy).
_SERVICE_DIR = os.path.dirname(os.path.abspath(__file__))
os.environ.setdefault("SUPERTONIC_CACHE_DIR", os.path.join(_SERVICE_DIR, "models", "supertonic2"))
os.environ.setdefault("PIPER_CACHE_DIR", os.path.join(_SERVICE_DIR, "models", "piper-voices"))

import numpy as np
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, ConfigDict, Field

logger = logging.getLogger("supertone-sidecar")
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

SERVICE_NAME = "supertone-sidecar"
MAX_TEXT_LENGTH = 5000
GPU_RUNTIME_ERROR_PATTERNS = (
    "hiperrorinvaliddevicefunction",
    "invalid device function",
    "onnxruntimeerror",
    "rocmexecutionprovider",
    "cudaexecutionprovider",
    "non-zero status code returned while running",
)

SUPERTONE_VOICES = ["M1", "F1", "M2", "F2", "M3", "F3", "M4", "F4", "M5", "F5"]
SUPERTONE_LANGS  = ["en", "ko", "es", "pt", "fr"]

# Curated Piper voices — downloaded on first use from HuggingFace rhasspy/piper-voices
PIPER_VOICE_IDS = [
    "en_US-hfc_female-medium",
    "en_US-lessac-high",
    "en_US-ryan-high",
    "en_US-ljspeech-high",
    "en_US-amy-medium",
]

PIPER_CACHE_DIR = Path(os.environ["PIPER_CACHE_DIR"])  # set at module top via setdefault


# ─── helpers ───────────────────────────────────────────────────────────────────

def _wav_from_pcm(pcm_int16: bytes, sample_rate: int) -> bytes:
    """Build a WAV file from raw int16 PCM bytes."""
    buf = io.BytesIO()
    channels, sampwidth = 1, 2
    data_size = len(pcm_int16)
    buf.write(b"RIFF")
    buf.write(struct.pack("<I", 36 + data_size))
    buf.write(b"WAVE")
    buf.write(b"fmt ")
    buf.write(struct.pack(
        "<IHHIIHH", 16, 1, channels,
        sample_rate, sample_rate * channels * sampwidth,
        channels * sampwidth, sampwidth * 8,
    ))
    buf.write(b"data")
    buf.write(struct.pack("<I", data_size))
    buf.write(pcm_int16)
    return buf.getvalue()


def _piper_voice_to_hf_path(voice_id: str) -> tuple[str, str]:
    """Return (hf_onnx_path, hf_json_path) for a piper voice ID.

    Voice ID format: {lang_full}-{voice_name}-{quality}
    e.g. en_US-amy-medium → en/en_US/amy/medium/en_US-amy-medium.onnx
    """
    parts = voice_id.split("-")
    if len(parts) < 3:
        raise ValueError(f"Invalid piper voice ID: {voice_id!r}")
    lang_full = parts[0]            # e.g. en_US
    quality   = parts[-1]           # e.g. medium
    voice_name = "-".join(parts[1:-1])  # e.g. amy  (handles jenny_diphone etc.)
    lang_family = lang_full.split("_")[0].lower()  # e.g. en

    base = f"{lang_family}/{lang_full}/{voice_name}/{quality}/{voice_id}"
    return f"{base}.onnx", f"{base}.onnx.json"


# ─── AppConfig ─────────────────────────────────────────────────────────────────

@dataclass(frozen=True)
class AppConfig:
    host: str
    port: int
    model_name: str
    use_gpu: bool

    @classmethod
    def from_env(cls) -> "AppConfig":
        return cls(
            host=os.getenv("SUPERTONE_HOST", "0.0.0.0"),
            port=int(os.getenv("SUPERTONE_PORT", "8100")),
            model_name=os.getenv("SUPERTONE_MODEL", "supertonic-2"),
            use_gpu=os.getenv("SUPERTONE_USE_GPU", "true").lower() in {"1", "true", "yes", "on"},
        )


# ─── Request / Response models ─────────────────────────────────────────────────

class TtsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    text:        str   = Field(min_length=1, max_length=MAX_TEXT_LENGTH)
    engine:      str   = Field(default="supertone")   # "supertone" | "piper"
    voice:       str   = Field(default="M1")
    lang:        str   = Field(default="en")
    speed:       float = Field(default=1.05, ge=0.5, le=2.0)
    total_steps: int   = Field(default=5,    ge=1,   le=100)


# ─── SupertoneEngine ───────────────────────────────────────────────────────────

class SupertoneEngine:
    def __init__(self, config: AppConfig) -> None:
        self._config = config
        self._tts: Optional[Any] = None
        self._voice_names: list[str] = []
        self._lock = threading.Lock()
        self._actual_provider = "CPUExecutionProvider"
        self._gpu_provider: Optional[str] = None

    @property
    def ready(self) -> bool:
        return self._tts is not None

    @property
    def device_name(self) -> str:
        if "ROCM" in self._actual_provider:
            return "gpu (ROCm)"
        if "CUDA" in self._actual_provider:
            return "gpu (CUDA)"
        return "cpu"

    def _configure_providers(self, provider: Optional[str]) -> None:
        import supertonic.config as _cfg

        providers = [provider, "CPUExecutionProvider"] if provider else ["CPUExecutionProvider"]
        _cfg.DEFAULT_ONNX_PROVIDERS.clear()
        _cfg.DEFAULT_ONNX_PROVIDERS.extend(providers)
        self._actual_provider = provider or "CPUExecutionProvider"
        if provider:
            logger.info("Supertone: GPU mode requested: %s", provider)
        else:
            logger.info("Supertone: CPU mode requested")

    def _resolve_gpu_provider(self) -> Optional[str]:
        if not self._config.use_gpu:
            return None

        try:
            import onnxruntime as ort

            available = ort.get_available_providers()
            logger.info("Supertone: available ONNX providers: %s", available)
            if "CUDAExecutionProvider" in available:
                return "CUDAExecutionProvider"
            if "ROCMExecutionProvider" in available:
                return "ROCMExecutionProvider"
        except Exception as exc:
            logger.warning("Supertone: could not inspect ONNX providers: %s", exc)

        logger.warning("Supertone: no GPU ONNX provider found — using CPU")
        return None

    def _load_tts(self) -> None:
        from supertonic import TTS
        logger.info("Supertone: loading model '%s'...", self._config.model_name)
        self._tts = TTS(model=self._config.model_name, auto_download=True)
        self._voice_names = self._tts.voice_style_names

        try:
            dp = self._tts.model._dp_ort  # type: ignore[attr-defined]
            providers_used = dp.get_providers()
            self._actual_provider = providers_used[0]
            logger.info("Supertone: actual ONNX provider: %s", providers_used)
        except Exception:
            pass

        logger.info(
            "Supertone ready. sample_rate=%d, device=%s, voices=%s",
            self._tts.sample_rate, self.device_name, self._voice_names,
        )

    def _synthesis_inputs(self, req: TtsRequest) -> tuple[str, Any]:
        if not self.ready or self._tts is None:
            raise HTTPException(status_code=503, detail="Supertone model not loaded")

        voice_name = req.voice if req.voice in self._voice_names else self._voice_names[0]
        lang = req.lang if req.lang in SUPERTONE_LANGS else "en"
        return lang, self._tts.get_voice_style(voice_name)

    def _run_synthesis(self, req: TtsRequest) -> Any:
        lang, style = self._synthesis_inputs(req)
        if self._tts is None:
            raise HTTPException(status_code=503, detail="Supertone model not loaded")
        return self._tts.synthesize(
            text=req.text,
            voice_style=style,
            speed=req.speed,
            total_steps=req.total_steps,
            lang=lang,
        )

    def _is_gpu_runtime_error(self, exc: Exception) -> bool:
        text = str(exc).lower()
        return any(pattern in text for pattern in GPU_RUNTIME_ERROR_PATTERNS)

    def _fallback_to_cpu(self, *, reason: Exception) -> None:
        with self._lock:
            if self._actual_provider == "CPUExecutionProvider":
                return

            logger.warning(
                "Supertone: GPU inference failed with '%s'. Falling back to CPU.",
                reason,
            )
            self._tts = None
            self._voice_names = []
            self._gpu_provider = None
            self._configure_providers(None)
            self._load_tts()

    def _probe_gpu_runtime(self) -> None:
        if self._actual_provider == "CPUExecutionProvider":
            return

        probe_req = TtsRequest(
            text="GPU probe.",
            engine="supertone",
            voice=self._voice_names[0] if self._voice_names else "M1",
            lang="en",
            speed=1.0,
            total_steps=1,
        )
        try:
            self._run_synthesis(probe_req)
        except ValueError as exc:
            logger.warning("Supertone: startup probe validation failed: %s", exc)
        except Exception as exc:
            if self._is_gpu_runtime_error(exc):
                self._fallback_to_cpu(reason=exc)
                return
            raise

    def start(self) -> None:
        self._gpu_provider = self._resolve_gpu_provider()
        self._configure_providers(self._gpu_provider)
        self._load_tts()
        self._probe_gpu_runtime()

    def synthesize(self, req: TtsRequest) -> bytes:
        try:
            wav, _ = self._run_synthesis(req)
        except ValueError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        except Exception as exc:
            if self._actual_provider != "CPUExecutionProvider" and self._is_gpu_runtime_error(exc):
                self._fallback_to_cpu(reason=exc)
                try:
                    wav, _ = self._run_synthesis(req)
                except ValueError as retry_exc:
                    raise HTTPException(status_code=400, detail=str(retry_exc)) from retry_exc
                except Exception as retry_exc:
                    raise HTTPException(
                        status_code=500,
                        detail=f"TTS error after CPU fallback: {retry_exc}",
                    ) from retry_exc
            else:
                raise

        waveform = wav.squeeze()
        pcm = (np.clip(waveform, -1.0, 1.0) * 32767).astype(np.int16)
        return _wav_from_pcm(pcm.tobytes(), self._tts.sample_rate)

    @property
    def voices(self) -> list[str]:
        return self._voice_names


# ─── PiperEngine ───────────────────────────────────────────────────────────────

class PiperEngine:
    def __init__(self) -> None:
        self._cache: dict[str, Any] = {}  # voice_id → PiperVoice
        PIPER_CACHE_DIR.mkdir(parents=True, exist_ok=True)

    @property
    def ready(self) -> bool:
        return True  # Piper is always ready — voices load on demand

    def _load_voice(self, voice_id: str) -> Any:
        if voice_id in self._cache:
            return self._cache[voice_id]

        onnx_rel, json_rel = _piper_voice_to_hf_path(voice_id)
        onnx_path = PIPER_CACHE_DIR / onnx_rel
        json_path = PIPER_CACHE_DIR / json_rel

        if not onnx_path.exists() or not json_path.exists():
            logger.info("Piper: downloading voice '%s' from HuggingFace...", voice_id)
            try:
                from huggingface_hub import hf_hub_download
                hf_hub_download(
                    repo_id="rhasspy/piper-voices",
                    filename=onnx_rel,
                    local_dir=str(PIPER_CACHE_DIR),
                )
                hf_hub_download(
                    repo_id="rhasspy/piper-voices",
                    filename=json_rel,
                    local_dir=str(PIPER_CACHE_DIR),
                )
                logger.info("Piper: downloaded '%s'", voice_id)
            except Exception as e:
                raise HTTPException(
                    status_code=503,
                    detail=f"Piper: could not download voice '{voice_id}': {e}",
                ) from e

        logger.info("Piper: loading voice '%s'...", voice_id)
        try:
            from piper.voice import PiperVoice
            voice = PiperVoice.load(str(onnx_path), str(json_path), use_cuda=False)
            self._cache[voice_id] = voice
            logger.info("Piper: voice '%s' loaded (sample_rate=%d)", voice_id, voice.config.sample_rate)
            return voice
        except Exception as e:
            raise HTTPException(
                status_code=503,
                detail=f"Piper: failed to load voice '{voice_id}': {e}",
            ) from e

    def synthesize(self, req: TtsRequest) -> bytes:
        voice = self._load_voice(req.voice)

        # speed → length_scale: higher speed = shorter phoneme duration
        length_scale = 1.0 / max(req.speed, 0.1)

        try:
            from piper.voice import SynthesisConfig
            syn_cfg = SynthesisConfig(length_scale=length_scale)
            pcm = b""
            for chunk in voice.synthesize(req.text, syn_cfg):
                pcm += chunk.audio_int16_bytes
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Piper synthesis failed: {e}") from e

        return _wav_from_pcm(pcm, voice.config.sample_rate)

    @property
    def cached_voices(self) -> list[str]:
        return list(self._cache.keys())


# ─── TtsService (router) ───────────────────────────────────────────────────────

class TtsService:
    def __init__(self, config: AppConfig) -> None:
        self._supertone = SupertoneEngine(config)
        self._piper = PiperEngine()

    def start(self) -> None:
        self._supertone.start()

    def synthesize(self, req: TtsRequest) -> bytes:
        if req.engine == "piper":
            return self._piper.synthesize(req)
        return self._supertone.synthesize(req)

    @property
    def supertone(self) -> SupertoneEngine:
        return self._supertone

    @property
    def piper(self) -> PiperEngine:
        return self._piper


# ─── DI helper ─────────────────────────────────────────────────────────────────

def get_tts_service(request: Request) -> TtsService:
    service = getattr(request.app.state, "tts_service", None)
    if not isinstance(service, TtsService):
        raise HTTPException(status_code=503, detail="TTS service not available")
    return service


# ─── App factory ───────────────────────────────────────────────────────────────

def create_app(config: Optional[AppConfig] = None) -> FastAPI:
    config = config or AppConfig.from_env()

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        service = TtsService(config)
        service.start()
        app.state.config = config
        app.state.tts_service = service
        yield

    app = FastAPI(
        title="Supertone TTS Sidecar",
        description="Text-to-speech: Supertonic + Piper engines",
        version="2.0.0",
        lifespan=lifespan,
    )

    @app.get("/health")
    async def health_check(request: Request) -> dict[str, Any]:
        svc = get_tts_service(request)
        st = svc.supertone
        return {
            "status": "healthy" if st.ready else "loading",
            "service": SERVICE_NAME,
            "ready": st.ready,
            "device": st.device_name,
            "supertone": {
                "ready": st.ready,
                "model": config.model_name,
                "device": st.device_name,
                "voices": st.voices,
                "languages": SUPERTONE_LANGS,
            },
            "piper": {
                "ready": svc.piper.ready,
                "available_voices": PIPER_VOICE_IDS,
                "cached_voices": svc.piper.cached_voices,
            },
        }

    @app.post("/api/tts")
    async def text_to_speech(body: TtsRequest, request: Request) -> Response:
        svc = get_tts_service(request)
        try:
            wav_bytes = svc.synthesize(body)
        except HTTPException:
            raise
        except Exception as exc:
            logger.exception("TTS synthesis failed")
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
