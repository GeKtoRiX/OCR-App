"""F5-TTS sidecar service."""

from __future__ import annotations

import io
import gc
import hashlib
import logging
import os
import tempfile
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

# Redirect Hugging Face cache to a local directory before lazy imports.
_SERVICE_DIR = Path(__file__).resolve().parent
os.environ.setdefault("HF_HOME", str(_SERVICE_DIR / "models" / "hub"))

import soundfile as sf
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.responses import Response

logger = logging.getLogger("f5-tts-sidecar")
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

SERVICE_NAME = "f5-tts-sidecar"
MAX_TEXT_LENGTH = 5000
MAX_REF_AUDIO_SIZE = 20 * 1024 * 1024
MAX_RECOMMENDED_REF_DURATION_MS = 12_000
ASR_MODEL_NAME = "openai/whisper-large-v3-turbo"
DEFAULT_VOCAB_URL = (
    "https://raw.githubusercontent.com/SWivid/F5-TTS/main/"
    "src/f5_tts/infer/examples/vocab.txt"
)
ALLOWED_AUDIO_MIME_TYPES = {
    "audio/wav",
    "audio/x-wav",
    "audio/mpeg",
    "audio/flac",
    "audio/ogg",
}
ALLOWED_AUDIO_EXTENSIONS = {
    ".wav",
    ".mp3",
    ".flac",
    ".ogg",
}


def _parse_bool(value: str | bool | None, *, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _guess_device_kind() -> Optional[str]:
    try:
        import torch

        if torch.cuda.is_available():
            return "gpu"
    except Exception:
        logger.exception("Torch device probe failed")
    return None


def _detect_audio_duration_ms(payload: bytes, suffix: str) -> Optional[int]:
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix or ".wav") as tmp:
            tmp.write(payload)
            tmp_path = tmp.name

        metadata = sf.info(tmp_path)
        if metadata.samplerate <= 0:
            return None
        return int((metadata.frames / metadata.samplerate) * 1000)
    except Exception:
        logger.warning("Could not determine reference audio duration", exc_info=True)
        return None
    finally:
        if "tmp_path" in locals():
            try:
                os.unlink(tmp_path)
            except FileNotFoundError:
                pass


def _normalize_reference_audio_to_wav(payload: bytes, suffix: str) -> bytes:
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix or ".wav") as src:
            src.write(payload)
            src_path = src.name

        waveform, sample_rate = sf.read(src_path, dtype="float32", always_2d=True)
        buf = io.BytesIO()
        sf.write(buf, waveform, sample_rate, format="WAV", subtype="PCM_16")
        return buf.getvalue()
    finally:
        if "src_path" in locals():
            try:
                os.unlink(src_path)
            except FileNotFoundError:
                pass


def _wav_bytes(wav: object, sample_rate: int) -> bytes:
    buf = io.BytesIO()
    sf.write(buf, wav, sample_rate, format="WAV", subtype="PCM_16")
    return buf.getvalue()


def _soundfile_torchaudio_load_compat(audio_path: str):
    import torch

    waveform, sample_rate = sf.read(audio_path, dtype="float32", always_2d=True)
    return torch.from_numpy(waveform.T.copy()), sample_rate


def _patch_f5_audio_loader() -> None:
    import f5_tts.infer.utils_infer as utils_infer

    if getattr(utils_infer, "_codex_soundfile_load_patched", False):
        return

    utils_infer.torchaudio.load = _soundfile_torchaudio_load_compat
    utils_infer._codex_soundfile_load_patched = True


def _ensure_tool_wrapper(tool_name: str, target: str) -> Optional[str]:
    tool_dir = _SERVICE_DIR / ".tools"
    tool_dir.mkdir(parents=True, exist_ok=True)
    wrapper_path = tool_dir / tool_name
    try:
        if wrapper_path.exists():
            return str(wrapper_path)
        wrapper_path.symlink_to(target)
        return str(wrapper_path)
    except OSError:
        logger.warning("Could not create %s wrapper for %s", tool_name, target, exc_info=True)
        return None


def _ensure_ffmpeg_binaries_on_path() -> tuple[str, Optional[str]]:
    import imageio_ffmpeg

    ffmpeg_exe = imageio_ffmpeg.get_ffmpeg_exe()
    ffmpeg_wrapper = _ensure_tool_wrapper("ffmpeg", ffmpeg_exe)
    ffprobe_exe = Path(ffmpeg_exe).with_name("ffprobe-linux-x86_64-v7.0.2")
    ffprobe_wrapper = None
    if ffprobe_exe.exists():
        ffprobe_wrapper = _ensure_tool_wrapper("ffprobe", str(ffprobe_exe))

    tool_dir = str(_SERVICE_DIR / ".tools")
    current_path = os.environ.get("PATH", "")
    path_parts = current_path.split(os.pathsep) if current_path else []
    if tool_dir not in path_parts:
        os.environ["PATH"] = os.pathsep.join([tool_dir, *path_parts]) if path_parts else tool_dir

    return ffmpeg_wrapper or ffmpeg_exe, ffprobe_wrapper


def _ensure_vocab_file(cache_dir: str) -> str:
    target = Path(cache_dir) / "vocab.txt"
    if target.is_file():
        return str(target)

    target.parent.mkdir(parents=True, exist_ok=True)
    logger.info("Downloading F5-TTS vocab file to %s", target)
    try:
        import urllib.request

        with urllib.request.urlopen(DEFAULT_VOCAB_URL) as response:
            target.write_bytes(response.read())
    except Exception as exc:
        raise RuntimeError(f"Could not download F5-TTS vocab file: {exc}") from exc

    return str(target)


@dataclass(frozen=True)
class AppConfig:
    host: str
    port: int
    require_gpu: bool
    model_name: str
    cache_dir: str
    keep_asr_loaded: bool

    @classmethod
    def from_env(cls) -> "AppConfig":
        return cls(
            host=os.getenv("F5_TTS_HOST", "0.0.0.0"),
            port=int(os.getenv("F5_TTS_PORT", "8300")),
            require_gpu=os.getenv("F5_TTS_REQUIRE_GPU", "true").lower() in {"1", "true", "yes", "on"},
            model_name=os.getenv("F5_TTS_MODEL", "F5TTS_v1_Base"),
            cache_dir=os.getenv("F5_TTS_CACHE_DIR", str(_SERVICE_DIR / "models")),
            keep_asr_loaded=os.getenv("F5_TTS_KEEP_ASR_LOADED", "false").lower()
            in {"1", "true", "yes", "on"},
        )


class F5Engine:
    def __init__(self, config: AppConfig) -> None:
        self._config = config
        self._tts = None
        self._asr_pipe = None
        self._asr_cache: dict[str, str] = {}
        self._startup_error: Optional[str] = None
        self._device_kind: Optional[str] = _guess_device_kind()

    @property
    def ready(self) -> bool:
        return self._tts is not None and self._startup_error is None

    @property
    def device_kind(self) -> Optional[str]:
        return self._device_kind

    @property
    def startup_error(self) -> Optional[str]:
        return self._startup_error

    def ensure_loaded(self) -> None:
        if self._tts is not None:
            return

        try:
            self._load_model()
            self._startup_error = None
        except Exception as exc:
            self._tts = None
            self._startup_error = str(exc)
            logger.exception("F5-TTS startup failed")
            raise

    def _load_model(self) -> None:
        import torch
        from pydub import AudioSegment
        from f5_tts.api import F5TTS

        if self._config.require_gpu and not torch.cuda.is_available():
            raise RuntimeError("F5-TTS requires a GPU, but torch.cuda.is_available() is false")

        ffmpeg_exe, ffprobe_exe = _ensure_ffmpeg_binaries_on_path()
        AudioSegment.converter = ffmpeg_exe
        if ffprobe_exe:
            os.environ.setdefault("FFPROBE_BINARY", ffprobe_exe)
        os.environ.setdefault("FFMPEG_BINARY", ffmpeg_exe)

        device = "cuda" if torch.cuda.is_available() else "cpu"
        self._device_kind = "gpu" if device == "cuda" else "cpu"
        logger.info(
            "Loading F5-TTS model '%s' on %s with cache_dir=%s",
            self._config.model_name,
            device,
            self._config.cache_dir,
        )
        _patch_f5_audio_loader()
        vocab_file = _ensure_vocab_file(self._config.cache_dir)
        self._tts = F5TTS(
            model=self._config.model_name,
            vocab_file=vocab_file,
            device=device,
            hf_cache_dir=self._config.cache_dir,
        )
        logger.info("F5-TTS ready. device=%s model=%s", self._device_kind, self._config.model_name)

    def synthesize(self, ref_audio_path: str, ref_text: str, text: str, remove_silence: bool) -> bytes:
        self.ensure_loaded()
        assert self._tts is not None

        wav, sample_rate, _ = self._tts.infer(
            ref_file=ref_audio_path,
            ref_text=ref_text,
            gen_text=text,
            remove_silence=remove_silence,
            show_info=lambda *_args, **_kwargs: None,
        )
        return _wav_bytes(wav, sample_rate)

    def prepare_reference_audio(self, normalized_wav: bytes) -> bytes:
        self.ensure_loaded()

        from f5_tts.infer.utils_infer import preprocess_ref_audio_text

        source_path = None
        try:
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as src:
                src.write(normalized_wav)
                source_path = src.name

            prepared_path, _ = preprocess_ref_audio_text(
                source_path,
                "Reference audio.",
                show_info=lambda *_args, **_kwargs: None,
            )
            return Path(prepared_path).read_bytes()
        finally:
            if source_path:
                try:
                    os.unlink(source_path)
                except FileNotFoundError:
                    pass

    def transcribe_reference(self, normalized_wav: bytes) -> str:
        self.ensure_loaded()
        audio_hash = hashlib.md5(normalized_wav).hexdigest()
        cached = self._asr_cache.get(audio_hash)
        if cached:
            return cached

        import numpy as np
        import torch
        import transformers.pipelines.automatic_speech_recognition as asr_pipeline_module
        import transformers.utils.import_utils as import_utils
        from transformers import pipeline

        import_utils._torchcodec_available = False
        asr_pipeline_module.is_torchcodec_available = lambda: False

        if self._asr_pipe is None:
            device = "cuda" if torch.cuda.is_available() else "cpu"
            dtype = torch.float16 if device == "cuda" else torch.float32
            logger.info("Loading reference ASR model '%s' on %s", ASR_MODEL_NAME, device)
            self._asr_pipe = pipeline(
                "automatic-speech-recognition",
                model=ASR_MODEL_NAME,
                dtype=dtype,
                device=device,
            )

        waveform, sample_rate = sf.read(io.BytesIO(normalized_wav), dtype="float32", always_2d=True)
        mono_waveform = np.mean(waveform, axis=1)
        transcript = self._asr_pipe(
            {"array": mono_waveform, "sampling_rate": sample_rate},
            chunk_length_s=30,
            batch_size=16,
            generate_kwargs={"task": "transcribe"},
            return_timestamps=False,
        )["text"].strip()
        if not transcript:
            raise RuntimeError("Automatic reference transcription returned empty text")

        self._asr_cache[audio_hash] = transcript
        return transcript

    def release_request_resources(self, *, unload_asr: bool) -> None:
        if unload_asr and self._asr_pipe is not None and not self._config.keep_asr_loaded:
            logger.info("Releasing reference ASR model after synthesis request")
            self._asr_pipe = None
        self._trim_runtime_caches()

    def _trim_runtime_caches(self) -> None:
        gc.collect()

        try:
            import torch

            if torch.cuda.is_available():
                torch.cuda.empty_cache()
                ipc_collect = getattr(torch.cuda, "ipc_collect", None)
                if callable(ipc_collect):
                    ipc_collect()
        except Exception:
            logger.warning("Runtime cache cleanup failed", exc_info=True)


class TtsService:
    def __init__(self, config: AppConfig) -> None:
        self._engine = F5Engine(config)

    @property
    def engine(self) -> F5Engine:
        return self._engine


def get_tts_service(request: Request) -> TtsService:
    service = getattr(request.app.state, "tts_service", None)
    if not isinstance(service, TtsService):
        raise RuntimeError("TTS service not initialized")
    return service


def create_app() -> FastAPI:
    config = AppConfig.from_env()
    tts_service = TtsService(config)

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        app.state.config = config
        app.state.tts_service = tts_service

        try:
          logger.info("Preloading F5-TTS engine during startup...")
          tts_service.engine.ensure_loaded()
        except Exception:
          logger.exception("F5-TTS engine preload failed during startup")
          if config.require_gpu:
              raise

        yield

    app = FastAPI(title=SERVICE_NAME, lifespan=lifespan)

    @app.get("/health")
    async def health(request: Request) -> dict[str, object]:
        engine = get_tts_service(request).engine
        return {
            "status": "healthy" if engine.ready else "loading",
            "service": SERVICE_NAME,
            "ready": engine.ready,
            "device": engine.device_kind,
            "model": "f5",
            "startupError": engine.startup_error,
        }

    @app.post("/api/tts")
    async def synthesize(
        request: Request,
        text: str = Form(...),
        refText: str = Form(default=""),
        autoTranscribe: str | bool | None = Form(default=False),
        removeSilence: str | bool | None = Form(default=False),
        refAudio: UploadFile = File(...),
    ) -> Response:
        if not text or not text.strip():
            raise HTTPException(status_code=400, detail="text is required")
        if len(text) > MAX_TEXT_LENGTH:
            raise HTTPException(
                status_code=400,
                detail=f"text exceeds maximum length of {MAX_TEXT_LENGTH} characters",
            )
        auto_transcribe_value = _parse_bool(autoTranscribe, default=False)
        if not auto_transcribe_value and not refText.strip():
            raise HTTPException(status_code=400, detail="refText is required")
        if refAudio is None:
            raise HTTPException(status_code=400, detail="refAudio is required")

        filename = refAudio.filename or "reference.wav"
        suffix = Path(filename).suffix.lower()
        mime = (refAudio.content_type or "").lower()
        if mime not in ALLOWED_AUDIO_MIME_TYPES and suffix not in ALLOWED_AUDIO_EXTENSIONS:
            raise HTTPException(
                status_code=400,
                detail=(
                    f"Unsupported reference audio type: {mime or suffix or 'unknown'}. "
                    f"Allowed mime types: {', '.join(sorted(ALLOWED_AUDIO_MIME_TYPES))}"
                ),
            )

        payload = await refAudio.read()
        if not payload:
            raise HTTPException(status_code=400, detail="refAudio is empty")
        if len(payload) > MAX_REF_AUDIO_SIZE:
            raise HTTPException(
                status_code=400,
                detail=f"refAudio exceeds maximum size of {MAX_REF_AUDIO_SIZE // (1024 * 1024)}MB",
            )

        duration_ms = _detect_audio_duration_ms(payload, suffix)
        if duration_ms is not None and duration_ms > MAX_RECOMMENDED_REF_DURATION_MS:
            logger.warning(
                "Reference audio %s is %dms; F5 preprocessing may clip inputs longer than %dms",
                filename,
                duration_ms,
                MAX_RECOMMENDED_REF_DURATION_MS,
            )

        remove_silence_value = _parse_bool(removeSilence, default=False)
        tmp_path = None
        used_auto_transcribe = False
        try:
            normalized_wav = _normalize_reference_audio_to_wav(payload, suffix)
            prepared_wav = get_tts_service(request).engine.prepare_reference_audio(normalized_wav)
            ref_text_value = refText.strip()
            if auto_transcribe_value and not ref_text_value:
                used_auto_transcribe = True
                logger.info("Auto-transcribing reference audio for %s", filename)
                ref_text_value = get_tts_service(request).engine.transcribe_reference(prepared_wav)
                logger.info("Reference transcription complete (%d chars)", len(ref_text_value))
            with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
                tmp.write(prepared_wav)
                tmp_path = tmp.name

            wav = get_tts_service(request).engine.synthesize(
                ref_audio_path=tmp_path,
                ref_text=ref_text_value,
                text=text,
                remove_silence=remove_silence_value,
            )
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"F5-TTS synthesis failed: {exc}") from exc
        finally:
            if tmp_path:
                try:
                    os.unlink(tmp_path)
                except FileNotFoundError:
                    pass
            get_tts_service(request).engine.release_request_resources(
                unload_asr=used_auto_transcribe,
            )

        return Response(
            content=wav,
            media_type="audio/wav",
            headers={"Content-Disposition": 'attachment; filename="f5_reference_voice.wav"'},
        )

    return app


app = create_app()
