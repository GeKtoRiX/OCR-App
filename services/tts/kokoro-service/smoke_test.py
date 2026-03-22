"""Smoke test for the Kokoro TTS sidecar service."""

from __future__ import annotations

import os
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent
SERVICES_DIR = ROOT_DIR.parents[1]
sys.path.insert(0, str(SERVICES_DIR))

from smoke_utils import (
    assert_wav_payload,
    check,
    encode_json,
    find_free_port,
    prepend_torch_lib_path,
    request_bytes,
    start_uvicorn_process,
    terminate_process,
    wait_for_json,
)


STARTUP_TIMEOUT_SECONDS = int(os.getenv("KOKORO_SMOKE_TIMEOUT", "300"))


def main() -> int:
    port = find_free_port()
    base_url = f"http://127.0.0.1:{port}"
    env = os.environ.copy()
    env["KOKORO_HOST"] = "127.0.0.1"
    env["KOKORO_PORT"] = str(port)
    prepend_torch_lib_path(env)

    print("=== Kokoro TTS Sidecar Smoke Test ===\n")
    print(f"Starting Kokoro sidecar on port {port}")
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
            ready_check=lambda body: body.get("ready") is True,
        )
        check(health.get("status") == "healthy", "Health reports healthy")
        check(health.get("ready") is True, "Kokoro model ready")
        check(
            health.get("provider") in {"CPUExecutionProvider", "ROCMExecutionProvider", "CUDAExecutionProvider"},
            "Kokoro reports ONNX Runtime provider",
        )
        check("af_heart" in health.get("voices_us", []), "Default US voice available")
        check("en-us" in health.get("languages", []), "English supported")
        print(f"  -> provider={health.get('provider')} device={health.get('device')}")

        headers, payload = encode_json(
            {
                "text": "Hello from the Kokoro smoke test.",
                "voice": "af_heart",
                "lang": "en-us",
                "speed": 1.0,
            },
        )
        response_headers, wav_bytes = request_bytes(
            f"{base_url}/tts",
            method="POST",
            data=payload,
            headers=headers,
            timeout=120,
        )
        check(
            "audio/wav" in response_headers.get("Content-Type", ""),
            "Synthesis returns audio/wav",
        )
        wav_info = assert_wav_payload(
            wav_bytes,
            label="Kokoro synthesis",
            expected_sample_rate=24_000,
            expected_channels=1,
            min_duration_seconds=0.2,
        )
        print(
            "  -> sample_rate=%(sample_rate)s duration=%(duration_seconds).2fs"
            % wav_info,
        )

        print("\nSmoke test passed.")
        return 0
    except Exception as exc:
        print(f"Smoke test failed: {exc}", file=sys.stderr)
        return 1
    finally:
        terminate_process(process)


if __name__ == "__main__":
    raise SystemExit(main())
