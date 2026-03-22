"""Smoke test for the PaddleOCR sidecar service."""

from __future__ import annotations

import os
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent
SERVICES_DIR = ROOT_DIR.parents[1]
REPO_DIR = ROOT_DIR.parents[2]
sys.path.insert(0, str(SERVICES_DIR))

from smoke_utils import (
    check,
    encode_multipart_formdata,
    find_free_port,
    request_json,
    start_uvicorn_process,
    terminate_process,
    wait_for_json,
)


STARTUP_TIMEOUT_SECONDS = int(os.getenv("PADDLEOCR_SMOKE_TIMEOUT", "240"))


def main() -> int:
    port = find_free_port()
    base_url = f"http://127.0.0.1:{port}"
    image_path = REPO_DIR / "image_test.jpg"

    env = {
        "PADDLEOCR_HOST": "127.0.0.1",
        "PADDLEOCR_PORT": str(port),
        "PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK": os.getenv(
            "PADDLE_PDX_DISABLE_MODEL_SOURCE_CHECK",
            "True",
        ),
    }

    print("=== PaddleOCR Sidecar Smoke Test ===\n")
    print(f"Starting PaddleOCR sidecar on port {port}")
    process = start_uvicorn_process(
        python_executable=sys.executable,
        service_dir=ROOT_DIR,
        port=port,
        env=env,
    )

    try:
        health = wait_for_json(
            f"{base_url}/health",
            timeout_seconds=STARTUP_TIMEOUT_SECONDS,
            ready_check=lambda body: body.get("model_loaded") is True,
        )
        check(health.get("status") == "healthy", "Health reports healthy")
        check(health.get("model_loaded") is True, "OCR model loaded")

        models = request_json(f"{base_url}/models", timeout=30)
        check("models" in models, "Model metadata endpoint responds")
        check(bool(models["models"].get("recognizer")), "Recognizer metadata present")

        check(image_path.is_file(), f"Test image exists at {image_path}")
        headers, body = encode_multipart_formdata(
            files=[
                (
                    "image",
                    image_path.name,
                    "image/jpeg",
                    image_path.read_bytes(),
                ),
            ],
        )
        extract = request_json(
            f"{base_url}/api/extract/upload",
            method="POST",
            data=body,
            headers=headers,
            timeout=180,
        )
        text = str(extract.get("text", "")).strip()
        check(len(text) > 20, f"OCR extracted non-trivial text ({len(text)} chars)")
        check(int(extract.get("size_bytes", 0)) > 0, "OCR response includes input size")

        print("\nSmoke test passed.")
        return 0
    except Exception as exc:
        print(f"Smoke test failed: {exc}", file=sys.stderr)
        return 1
    finally:
        terminate_process(process)


if __name__ == "__main__":
    raise SystemExit(main())
