"""Smoke-test for launching the PaddleOCR sidecar and waiting for /health."""

from __future__ import annotations

import os
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent
HEALTH_PATH = "/health"
STARTUP_TIMEOUT_SECONDS = int(os.getenv("PADDLEOCR_SMOKE_TIMEOUT", "180"))


def find_free_port() -> int:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
        sock.bind(("127.0.0.1", 0))
        return int(sock.getsockname()[1])


def wait_for_health(url: str, timeout_seconds: int) -> str:
    deadline = time.time() + timeout_seconds
    last_error = "unknown error"

    while time.time() < deadline:
        try:
            with urllib.request.urlopen(url, timeout=5) as response:
                return response.read().decode("utf-8")
        except (urllib.error.URLError, TimeoutError) as exc:
            last_error = str(exc)
            time.sleep(2)

    raise TimeoutError(
        f"Timed out waiting for {url} after {timeout_seconds}s. Last error: {last_error}"
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


def main() -> int:
    python_executable = sys.executable
    port = find_free_port()
    health_url = f"http://127.0.0.1:{port}{HEALTH_PATH}"

    env = os.environ.copy()
    env["PADDLEOCR_HOST"] = "127.0.0.1"
    env["PADDLEOCR_PORT"] = str(port)
    env.setdefault("PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK", "True")

    command = [
        python_executable,
        "-m",
        "uvicorn",
        "--app-dir",
        str(ROOT_DIR),
        "main:app",
        "--host",
        "127.0.0.1",
        "--port",
        str(port),
    ]

    print(f"Starting PaddleOCR sidecar on port {port}")
    process = subprocess.Popen(
        command,
        cwd=str(ROOT_DIR),
        env=env,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )

    try:
        body = wait_for_health(health_url, STARTUP_TIMEOUT_SECONDS)
        print("Health response:", body)
        return 0
    except Exception as exc:
        print(f"Smoke test failed: {exc}", file=sys.stderr)
        return 1
    finally:
        terminate_process(process)


if __name__ == "__main__":
    raise SystemExit(main())
