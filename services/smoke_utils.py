"""Shared helpers for sidecar smoke tests."""

from __future__ import annotations

import io
import json
import math
import os
import socket
import subprocess
import time
import urllib.error
import urllib.request
import wave
from email.message import Message
from pathlib import Path
from typing import Any, Callable, Mapping


def check(condition: bool, message: str) -> None:
    status = "OK" if condition else "FAIL"
    print(f"[{status}] {message}")
    if not condition:
        raise SystemExit(1)


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def prepend_path(env: dict[str, str], key: str, value: str) -> None:
    current = env.get(key, "")
    parts = [part for part in current.split(os.pathsep) if part]
    if value in parts:
        return
    env[key] = os.pathsep.join([value, *parts]) if parts else value


def prepend_torch_lib_path(env: dict[str, str]) -> None:
    try:
        import torch

        lib_dir = Path(torch.__file__).resolve().parent / "lib"
        if lib_dir.is_dir():
            prepend_path(env, "LD_LIBRARY_PATH", str(lib_dir))
    except Exception:
        pass


def start_uvicorn_process(
    *,
    python_executable: str,
    service_dir: Path,
    port: int,
    env: Mapping[str, str] | None = None,
) -> subprocess.Popen[str]:
    child_env = os.environ.copy()
    if env:
        child_env.update(env)

    return subprocess.Popen(
        [
            python_executable,
            "-m",
            "uvicorn",
            "--app-dir",
            str(service_dir),
            "main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
        ],
        cwd=str(service_dir),
        env=child_env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        text=True,
    )


def terminate_process(process: subprocess.Popen[str]) -> None:
    if process.poll() is not None:
        return

    process.terminate()
    try:
        process.wait(timeout=15)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def _request(
    url: str,
    *,
    method: str = "GET",
    data: bytes | None = None,
    headers: Mapping[str, str] | None = None,
    timeout: float = 30,
) -> tuple[int, Message, bytes]:
    request = urllib.request.Request(url, data=data, method=method)
    for key, value in (headers or {}).items():
      request.add_header(key, value)

    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.status, response.headers, response.read()


def request_json(
    url: str,
    *,
    method: str = "GET",
    data: bytes | None = None,
    headers: Mapping[str, str] | None = None,
    timeout: float = 30,
) -> dict[str, Any]:
    _status, _headers, payload = _request(
        url,
        method=method,
        data=data,
        headers=headers,
        timeout=timeout,
    )
    return json.loads(payload.decode("utf-8"))


def request_bytes(
    url: str,
    *,
    method: str = "GET",
    data: bytes | None = None,
    headers: Mapping[str, str] | None = None,
    timeout: float = 30,
) -> tuple[Message, bytes]:
    _status, response_headers, payload = _request(
        url,
        method=method,
        data=data,
        headers=headers,
        timeout=timeout,
    )
    return response_headers, payload


def wait_for_json(
    url: str,
    *,
    timeout_seconds: int,
    ready_check: Callable[[dict[str, Any]], bool] | None = None,
    poll_interval_seconds: float = 2.0,
) -> dict[str, Any]:
    deadline = time.time() + timeout_seconds
    last_error = "unknown error"

    while time.time() < deadline:
        try:
            body = request_json(url, timeout=10)
            if ready_check is None or ready_check(body):
                return body
            last_error = f"service not ready yet: {body}"
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as exc:
            last_error = str(exc)
        time.sleep(poll_interval_seconds)

    raise TimeoutError(
        f"Timed out waiting for {url} after {timeout_seconds}s. Last error: {last_error}",
    )


def encode_json(payload: Mapping[str, Any]) -> tuple[dict[str, str], bytes]:
    return {"Content-Type": "application/json"}, json.dumps(payload).encode("utf-8")


def encode_multipart_formdata(
    *,
    fields: Mapping[str, str] | None = None,
    files: list[tuple[str, str, str, bytes]] | None = None,
) -> tuple[dict[str, str], bytes]:
    boundary = f"codex-smoke-{int(time.time() * 1000)}"
    body = bytearray()

    for name, value in (fields or {}).items():
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(
            f'Content-Disposition: form-data; name="{name}"\r\n\r\n'.encode("utf-8"),
        )
        body.extend(value.encode("utf-8"))
        body.extend(b"\r\n")

    for field_name, filename, content_type, payload in files or []:
        body.extend(f"--{boundary}\r\n".encode("utf-8"))
        body.extend(
            (
                f'Content-Disposition: form-data; name="{field_name}"; '
                f'filename="{filename}"\r\n'
            ).encode("utf-8"),
        )
        body.extend(f"Content-Type: {content_type}\r\n\r\n".encode("utf-8"))
        body.extend(payload)
        body.extend(b"\r\n")

    body.extend(f"--{boundary}--\r\n".encode("utf-8"))
    return {"Content-Type": f"multipart/form-data; boundary={boundary}"}, bytes(body)


def assert_wav_payload(
    payload: bytes,
    *,
    label: str,
    expected_sample_rate: int | None = None,
    expected_channels: int = 1,
    min_duration_seconds: float = 0.2,
) -> dict[str, float | int]:
    check(len(payload) > 128, f"{label}: audio payload is non-empty ({len(payload)} bytes)")
    check(payload[:4] == b"RIFF", f"{label}: payload is WAV")

    with wave.open(io.BytesIO(payload), "rb") as wav_file:
        sample_rate = wav_file.getframerate()
        channels = wav_file.getnchannels()
        duration_seconds = wav_file.getnframes() / sample_rate

    if expected_sample_rate is not None:
        check(
            sample_rate == expected_sample_rate,
            f"{label}: sample rate is {expected_sample_rate} Hz (got {sample_rate})",
        )
    check(channels == expected_channels, f"{label}: channels = {expected_channels}")
    check(
        duration_seconds >= min_duration_seconds,
        f"{label}: duration >= {min_duration_seconds:.2f}s (got {duration_seconds:.2f}s)",
    )
    return {
        "sample_rate": sample_rate,
        "channels": channels,
        "duration_seconds": duration_seconds,
    }


def build_reference_wav(
    *,
    seconds: float = 1.0,
    sample_rate: int = 24_000,
    amplitude: int = 10_000,
    frequency: float = 440.0,
) -> bytes:
    frame_count = int(seconds * sample_rate)
    pcm_buffer = io.BytesIO()

    with wave.open(pcm_buffer, "wb") as wav_file:
        wav_file.setnchannels(1)
        wav_file.setsampwidth(2)
        wav_file.setframerate(sample_rate)
        for index in range(frame_count):
            sample = int(
                amplitude * math.sin(2 * math.pi * frequency * index / sample_rate),
            )
            wav_file.writeframesraw(sample.to_bytes(2, byteorder="little", signed=True))

    return pcm_buffer.getvalue()
