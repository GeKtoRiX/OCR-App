"""Voxtral sidecar service.

This service owns the local Voxtral runtime for the project:
- exposes the app-facing `/health` and `/api/tts` adapter
- builds and runs a project-local ROCm Docker runtime when needed
- keeps Hugging Face / vLLM caches inside `services/tts/voxtral-service/models`
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shlex
import shutil
import subprocess
import time
from contextlib import asynccontextmanager
from dataclasses import dataclass
from pathlib import Path
from typing import Literal

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field

logger = logging.getLogger("voxtral-sidecar")
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO").upper(),
    format="%(asctime)s %(levelname)s %(name)s: %(message)s",
)

SERVICE_NAME = "voxtral-sidecar"
DEFAULT_MODEL_NAME = "mistralai/Voxtral-4B-TTS-2603"
DEFAULT_IMAGE_NAME = "ocr-app/voxtral-rocm:local"
DEFAULT_CONTAINER_NAME = "ocr-app-voxtral-rocm"
DEFAULT_UPSTREAM_CONTAINER_PORT = 8401
SUPPORTED_FORMATS = {"wav"}
MAX_TEXT_LENGTH = 5_000
DEFAULT_VOICES = ("casual_female", "casual_male")
SERVICE_DIR = Path(__file__).resolve().parent
MODELS_DIR = SERVICE_DIR / "models"
HF_CACHE_DIR = MODELS_DIR / "hub"
VLLM_CACHE_DIR = MODELS_DIR / "vllm-cache"
DOCKERFILE_PATH = SERVICE_DIR / "Dockerfile"


def _parse_bool(value: str | bool | None, *, default: bool = False) -> bool:
    if isinstance(value, bool):
        return value
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _tail_text(text: str | None, *, limit: int = 4_000) -> str:
    if not text:
        return ""
    return text[-limit:]


def _combine_subprocess_output(result: subprocess.CompletedProcess[str]) -> str:
    output = "\n".join(part for part in (result.stdout, result.stderr) if part)
    return _tail_text(output)


def _guess_device_kind() -> Literal["gpu", "cpu"] | None:
    try:
        import torch

        if torch.cuda.is_available():
            return "gpu"
        return "cpu"
    except Exception:
        logger.debug("Torch device probe failed", exc_info=True)
    return None


@dataclass(frozen=True)
class AppConfig:
    host: str
    port: int
    model_name: str
    sidecar_timeout_s: int
    upstream_timeout_s: int
    upstream_host: str
    upstream_port: int
    auto_start: bool
    api_key: str | None
    runtime: Literal["docker", "process"]
    server_command: str | None
    docker_image: str
    docker_container_name: str
    docker_build: bool
    docker_keep_container: bool
    dockerfile_path: Path
    hf_cache_dir: Path
    vllm_cache_dir: Path

    @property
    def upstream_root_url(self) -> str:
        return f"http://{self.upstream_host}:{self.upstream_port}"

    @property
    def upstream_v1_url(self) -> str:
        return f"{self.upstream_root_url}/v1"

    @classmethod
    def from_env(cls) -> "AppConfig":
        api_key = os.getenv("VOXTRAL_API_KEY")
        server_command = os.getenv("VOXTRAL_SERVER_COMMAND")
        runtime = os.getenv("VOXTRAL_RUNTIME", "docker").strip().lower()
        if server_command:
            runtime = "process"
        if runtime not in {"docker", "process"}:
            runtime = "docker"

        return cls(
            host=os.getenv("VOXTRAL_HOST", "0.0.0.0"),
            port=int(os.getenv("VOXTRAL_PORT", "8400")),
            model_name=os.getenv("VOXTRAL_MODEL", DEFAULT_MODEL_NAME),
            sidecar_timeout_s=int(os.getenv("VOXTRAL_STARTUP_TIMEOUT", "900")),
            upstream_timeout_s=int(os.getenv("VOXTRAL_UPSTREAM_TIMEOUT", "300")),
            upstream_host=os.getenv("VOXTRAL_UPSTREAM_HOST", "127.0.0.1"),
            upstream_port=int(os.getenv("VOXTRAL_UPSTREAM_PORT", "8401")),
            auto_start=_parse_bool(os.getenv("VOXTRAL_AUTO_START"), default=True),
            api_key=api_key.strip() if api_key and api_key.strip() else None,
            runtime=runtime,
            server_command=server_command,
            docker_image=os.getenv("VOXTRAL_DOCKER_IMAGE", DEFAULT_IMAGE_NAME),
            docker_container_name=os.getenv(
                "VOXTRAL_DOCKER_CONTAINER_NAME",
                DEFAULT_CONTAINER_NAME,
            ),
            docker_build=_parse_bool(
                os.getenv("VOXTRAL_DOCKER_BUILD"),
                default=True,
            ),
            docker_keep_container=_parse_bool(
                os.getenv("VOXTRAL_DOCKER_KEEP_CONTAINER"),
                default=False,
            ),
            dockerfile_path=Path(
                os.getenv("VOXTRAL_DOCKERFILE", str(DOCKERFILE_PATH)),
            ),
            hf_cache_dir=Path(
                os.getenv("VOXTRAL_HF_CACHE_DIR", str(HF_CACHE_DIR)),
            ),
            vllm_cache_dir=Path(
                os.getenv("VOXTRAL_VLLM_CACHE_DIR", str(VLLM_CACHE_DIR)),
            ),
        )


class VoxtralSynthesisRequest(BaseModel):
    text: str = Field(..., min_length=1, max_length=MAX_TEXT_LENGTH)
    voice: str = Field(default=DEFAULT_VOICES[0], min_length=1)
    format: str = Field(default="wav")


class VoxtralBackend:
    def __init__(self, config: AppConfig) -> None:
        self._config = config
        self._process: subprocess.Popen[str] | None = None
        self._ready = False
        self._startup_error: str | None = None
        self._device_kind = _guess_device_kind()
        self._startup_lock = asyncio.Lock()
        self._startup_task: asyncio.Task[None] | None = None
        self._managed_runtime: Literal["docker", "process"] | None = None
        self._managed_container_started = False

    @property
    def ready(self) -> bool:
        return self._ready

    @property
    def startup_error(self) -> str | None:
        return self._startup_error

    @property
    def device_kind(self) -> Literal["gpu", "cpu"] | None:
        return self._device_kind

    def ensure_background_startup(self) -> None:
        if not self._config.auto_start:
            return
        if self._startup_task is not None and not self._startup_task.done():
            return
        self._startup_task = asyncio.create_task(self._run_startup_task())

    async def _run_startup_task(self) -> None:
        try:
            await self.startup()
        except Exception as exc:
            logger.exception("Background Voxtral startup failed")
            self._startup_error = str(exc)

    async def startup(self) -> None:
        async with self._startup_lock:
            await self._refresh_state()
            if self._ready:
                return
            if not self._config.auto_start:
                self._startup_error = "VOXTRAL_AUTO_START is disabled"
                return
            await self._start_backend()
            await self._wait_until_ready()

    async def shutdown(self) -> None:
        if self._startup_task is not None and not self._startup_task.done():
            self._startup_task.cancel()
            try:
                await self._startup_task
            except asyncio.CancelledError:
                pass
        self._startup_task = None

        if self._process is not None and self._process.poll() is None:
            self._process.terminate()
            try:
                self._process.wait(timeout=15)
            except subprocess.TimeoutExpired:
                self._process.kill()
                self._process.wait(timeout=5)
        self._process = None

        if (
            self._managed_runtime == "docker"
            and self._managed_container_started
            and not self._config.docker_keep_container
        ):
            self._docker_remove_container(force=True)
        self._managed_runtime = None
        self._managed_container_started = False

    async def synthesize(self, payload: VoxtralSynthesisRequest) -> bytes:
        await self._refresh_state()
        if not self._ready:
            await self.startup()

        if not self._ready:
            raise RuntimeError(self._startup_error or "Voxtral backend is not ready")

        headers = {"Content-Type": "application/json", **self._auth_headers()}
        async with httpx.AsyncClient(timeout=self._config.upstream_timeout_s) as client:
            response = await client.post(
                f"{self._config.upstream_v1_url}/audio/speech",
                json={
                    "input": payload.text,
                    "model": self._config.model_name,
                    "response_format": payload.format,
                    "voice": payload.voice,
                },
                headers=headers,
            )

        if response.status_code >= 400:
            raise RuntimeError(
                f"upstream returned {response.status_code}: {response.text[:500]}",
            )
        return response.content

    async def _refresh_state(self) -> None:
        if self._process is not None and self._process.poll() is not None:
            exit_code = self._process.returncode
            self._process = None
            self._ready = False
            self._startup_error = f"Voxtral process exited with code {exit_code}"

        probe_error = await self._probe_upstream()
        if probe_error is None:
            self._ready = True
            self._startup_error = None
            if self._managed_runtime == "docker":
                self._device_kind = "gpu"
            elif self._device_kind is None:
                self._device_kind = _guess_device_kind()
            return

        self._ready = False
        if self._managed_runtime == "docker":
            docker_error = self._docker_runtime_error()
            if docker_error:
                self._startup_error = docker_error
                return
        if self._process is None and self._startup_error is None:
            self._startup_error = probe_error

    async def _probe_upstream(self) -> str | None:
        endpoints = (
            f"{self._config.upstream_root_url}/health",
            f"{self._config.upstream_v1_url}/health",
            f"{self._config.upstream_v1_url}/models",
        )
        headers = self._auth_headers()
        last_error = "upstream not reachable"

        async with httpx.AsyncClient(timeout=3) as client:
            for endpoint in endpoints:
                try:
                    response = await client.get(endpoint, headers=headers)
                    if response.status_code == 200:
                        return None
                    last_error = f"{endpoint} returned {response.status_code}"
                except Exception as exc:
                    last_error = f"{endpoint}: {exc}"
        return last_error

    async def _start_backend(self) -> None:
        if self._config.runtime == "process":
            self._start_process_backend()
            return
        await asyncio.to_thread(self._start_docker_backend)

    def _start_process_backend(self) -> None:
        if self._process is not None and self._process.poll() is None:
            self._managed_runtime = "process"
            return

        cmd = self._build_server_command()
        logger.info("Starting Voxtral backend process: %s", " ".join(cmd))
        child_env = os.environ.copy()
        child_env.setdefault("HF_HOME", str(self._config.hf_cache_dir))
        child_env.setdefault("VLLM_CACHE_ROOT", str(self._config.vllm_cache_dir))
        child_env.setdefault("PYTHONUNBUFFERED", "1")
        self._ensure_runtime_directories()

        self._process = subprocess.Popen(
            cmd,
            cwd=str(SERVICE_DIR),
            env=child_env,
            stdout=None,
            stderr=None,
            text=True,
        )
        self._managed_runtime = "process"
        self._startup_error = None

    def _build_server_command(self) -> list[str]:
        if self._config.server_command:
            return shlex.split(self._config.server_command)

        if shutil.which("vllm") is None:
            raise RuntimeError(
                "vllm executable not found in PATH. Set VOXTRAL_SERVER_COMMAND or use docker runtime.",
            )

        command = [
            "vllm",
            "serve",
            self._config.model_name,
            "--host",
            self._config.upstream_host,
            "--port",
            str(self._config.upstream_port),
            "--omni",
        ]
        if self._config.api_key:
            command.extend(["--api-key", self._config.api_key])
        return command

    def _start_docker_backend(self) -> None:
        self._ensure_runtime_directories()
        self._docker_ensure_image()

        if self._docker_is_container_running():
            logger.info(
                "Using existing Voxtral container %s",
                self._config.docker_container_name,
            )
            self._managed_runtime = "docker"
            self._managed_container_started = False
            self._startup_error = None
            return

        self._docker_remove_container(force=True)

        publish = (
            f"{self._config.upstream_host}:{self._config.upstream_port}:"
            f"{DEFAULT_UPSTREAM_CONTAINER_PORT}"
        )
        cmd = [
            self._docker_bin(),
            "run",
            "--detach",
            "--name",
            self._config.docker_container_name,
            "--device",
            "/dev/kfd",
            "--device",
            "/dev/dri",
            "--group-add",
            "video",
            "--cap-add",
            "SYS_PTRACE",
            "--security-opt",
            "seccomp=unconfined",
            "--security-opt",
            "label=disable",
            "--ipc",
            "host",
            "-e",
            "HSA_OVERRIDE_GFX_VERSION=11.0.0",
            "-e",
            "HF_HOME=/root/.cache/huggingface",
            "-e",
            "VLLM_CACHE_ROOT=/root/.cache/vllm",
            "-v",
            f"{self._config.hf_cache_dir.resolve()}:/root/.cache/huggingface",
            "-v",
            f"{self._config.vllm_cache_dir.resolve()}:/root/.cache/vllm",
            "-p",
            publish,
        ]
        if self._config.api_key:
            cmd.extend(["-e", f"VLLM_API_KEY={self._config.api_key}"])
        hf_token = os.getenv("HF_TOKEN") or os.getenv("HUGGING_FACE_HUB_TOKEN")
        if hf_token:
            cmd.extend(["-e", f"HF_TOKEN={hf_token}"])
        cmd.append(self._config.docker_image)

        result = subprocess.run(
            cmd,
            cwd=str(SERVICE_DIR),
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError(
                "Failed to start Voxtral Docker runtime:\n"
                f"{_combine_subprocess_output(result)}",
            )

        container_id = result.stdout.strip()
        logger.info(
            "Started Voxtral Docker runtime %s (%s)",
            self._config.docker_container_name,
            container_id[:12],
        )
        self._managed_runtime = "docker"
        self._managed_container_started = True
        self._startup_error = None
        self._device_kind = "gpu"

    async def _wait_until_ready(self) -> None:
        deadline = time.monotonic() + self._config.sidecar_timeout_s
        last_error = "upstream did not become ready"

        while time.monotonic() < deadline:
            await self._refresh_state()
            if self._ready:
                return
            if self._startup_error:
                last_error = self._startup_error
            await asyncio.sleep(2)

        self._startup_error = f"Failed to start Voxtral backend: {last_error}"

    def _ensure_runtime_directories(self) -> None:
        self._config.hf_cache_dir.mkdir(parents=True, exist_ok=True)
        self._config.vllm_cache_dir.mkdir(parents=True, exist_ok=True)

    def _docker_bin(self) -> str:
        docker_bin = shutil.which("docker")
        if docker_bin is None:
            raise RuntimeError("Docker executable not found in PATH")
        return docker_bin

    def _docker_ensure_image(self) -> None:
        if self._docker_image_exists():
            return
        if not self._config.docker_build:
            raise RuntimeError(
                f"Docker image {self._config.docker_image} is missing and VOXTRAL_DOCKER_BUILD=false",
            )
        if not self._config.dockerfile_path.is_file():
            raise RuntimeError(
                f"Dockerfile not found: {self._config.dockerfile_path}",
            )

        logger.info(
            "Building Voxtral Docker image %s from %s",
            self._config.docker_image,
            self._config.dockerfile_path,
        )
        cmd = [
            self._docker_bin(),
            "build",
            "--tag",
            self._config.docker_image,
            "--file",
            str(self._config.dockerfile_path),
            str(SERVICE_DIR),
        ]
        result = subprocess.run(
            cmd,
            cwd=str(SERVICE_DIR),
            capture_output=True,
            text=True,
            check=False,
        )
        if result.returncode != 0:
            raise RuntimeError(
                "Failed to build Voxtral Docker image:\n"
                f"{_combine_subprocess_output(result)}",
            )

    def _docker_image_exists(self) -> bool:
        result = subprocess.run(
            [self._docker_bin(), "image", "inspect", self._config.docker_image],
            cwd=str(SERVICE_DIR),
            capture_output=True,
            text=True,
            check=False,
        )
        return result.returncode == 0

    def _docker_is_container_running(self) -> bool:
        result = subprocess.run(
            [
                self._docker_bin(),
                "inspect",
                "--format",
                "{{.State.Running}}",
                self._config.docker_container_name,
            ],
            cwd=str(SERVICE_DIR),
            capture_output=True,
            text=True,
            check=False,
        )
        return result.returncode == 0 and result.stdout.strip() == "true"

    def _docker_remove_container(self, *, force: bool) -> None:
        rm_args = [self._docker_bin(), "rm"]
        if force:
            rm_args.append("-f")
        rm_args.append(self._config.docker_container_name)
        subprocess.run(
            rm_args,
            cwd=str(SERVICE_DIR),
            capture_output=True,
            text=True,
            check=False,
        )

    def _docker_runtime_error(self) -> str | None:
        inspect = subprocess.run(
            [
                self._docker_bin(),
                "inspect",
                "--format",
                "{{json .State}}",
                self._config.docker_container_name,
            ],
            cwd=str(SERVICE_DIR),
            capture_output=True,
            text=True,
            check=False,
        )
        if inspect.returncode != 0:
            return None

        try:
            state = json.loads(inspect.stdout.strip())
        except json.JSONDecodeError:
            return f"Unable to parse docker state: {_tail_text(inspect.stdout)}"

        if state.get("Running"):
            return None

        status = state.get("Status", "unknown")
        exit_code = state.get("ExitCode")
        error = state.get("Error") or ""
        logs = subprocess.run(
            [
                self._docker_bin(),
                "logs",
                "--tail",
                "40",
                self._config.docker_container_name,
            ],
            cwd=str(SERVICE_DIR),
            capture_output=True,
            text=True,
            check=False,
        )
        log_tail = _tail_text(logs.stdout or logs.stderr)
        return (
            f"Docker runtime status={status} exitCode={exit_code} error={error}\n"
            f"{log_tail}".strip()
        )

    def _auth_headers(self) -> dict[str, str]:
        if not self._config.api_key:
            return {}
        return {"Authorization": f"Bearer {self._config.api_key}"}


class TtsService:
    def __init__(self, config: AppConfig) -> None:
        self.backend = VoxtralBackend(config)


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
        logger.info("Scheduling Voxtral background startup...")
        tts_service.backend.ensure_background_startup()
        yield
        await tts_service.backend.shutdown()

    app = FastAPI(title=SERVICE_NAME, lifespan=lifespan)

    @app.get("/health")
    async def health(request: Request) -> dict[str, object]:
        backend = get_tts_service(request).backend
        await backend._refresh_state()
        return {
            "status": "healthy" if backend.ready else "loading",
            "service": SERVICE_NAME,
            "ready": backend.ready,
            "device": backend.device_kind,
            "model": "voxtral",
            "startupError": backend.startup_error,
        }

    @app.post("/api/tts")
    async def synthesize(
        payload: VoxtralSynthesisRequest,
        request: Request,
    ) -> Response:
        if payload.format not in SUPPORTED_FORMATS:
            raise HTTPException(
                status_code=400,
                detail=f"Unsupported format: {payload.format}. Supported formats: wav",
            )

        try:
            wav = await get_tts_service(request).backend.synthesize(payload)
        except RuntimeError as exc:
            raise HTTPException(
                status_code=503,
                detail=f"Voxtral synthesis unavailable: {exc}",
            ) from exc
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Voxtral synthesis failed: {exc}",
            ) from exc

        return Response(
            content=wav,
            media_type="audio/wav",
            headers={"Content-Disposition": 'attachment; filename="voxtral.wav"'},
        )

    return app


app = create_app()
