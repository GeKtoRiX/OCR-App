"""Smoke test for the F5-TTS sidecar service."""

from __future__ import annotations

import os
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent
SERVICES_DIR = ROOT_DIR.parents[1]
sys.path.insert(0, str(SERVICES_DIR))

from smoke_utils import (
    assert_wav_payload,
    build_reference_wav,
    check,
    encode_multipart_formdata,
    find_free_port,
    prepend_torch_lib_path,
    request_bytes,
    request_json,
    start_uvicorn_process,
    terminate_process,
    wait_for_json,
)


STARTUP_TIMEOUT_SECONDS = int(os.getenv("F5_TTS_SMOKE_TIMEOUT", "300"))


def main() -> int:
    port = find_free_port()
    base_url = f"http://127.0.0.1:{port}"
    env = os.environ.copy()
    env["F5_TTS_HOST"] = "127.0.0.1"
    env["F5_TTS_PORT"] = str(port)
    env.setdefault("F5_TTS_REQUIRE_GPU", os.getenv("F5_TTS_REQUIRE_GPU", "true"))
    env.setdefault("HSA_OVERRIDE_GFX_VERSION", os.getenv("HSA_OVERRIDE_GFX_VERSION", "11.0.0"))
    prepend_torch_lib_path(env)

    print("=== F5-TTS Sidecar Smoke Test ===\n")
    print(f"Starting F5 sidecar on port {port}")
    process = start_uvicorn_process(
        python_executable=sys.executable,
        service_dir=ROOT_DIR,
        port=port,
        env=env,
    )

    try:
        initial_health = wait_for_json(
            f"{base_url}/health",
            timeout_seconds=STARTUP_TIMEOUT_SECONDS,
            ready_check=lambda body: body.get("model") == "f5",
        )
        check(initial_health.get("model") == "f5", "Health endpoint identifies F5")

        headers, payload = encode_multipart_formdata(
            fields={
                "text": "F5 local speech synthesis is working.",
                "refText": "This is a short reference clip.",
                "removeSilence": "false",
            },
            files=[
                (
                    "refAudio",
                    "reference.wav",
                    "audio/wav",
                    build_reference_wav(),
                ),
            ],
        )
        response_headers, wav_bytes = request_bytes(
            f"{base_url}/api/tts",
            method="POST",
            data=payload,
            headers=headers,
            timeout=300,
        )
        check(
            "audio/wav" in response_headers.get("Content-Type", ""),
            "Synthesis returns audio/wav",
        )
        assert_wav_payload(
            wav_bytes,
            label="F5 synthesis",
            expected_channels=1,
            min_duration_seconds=0.2,
        )

        final_health = request_json(f"{base_url}/health", timeout=30)
        check(final_health.get("ready") is True, "Service ready after inference")

        print("\nSmoke test passed.")
        return 0
    except Exception as exc:
        print(f"Smoke test failed: {exc}", file=sys.stderr)
        return 1
    finally:
        terminate_process(process)


if __name__ == "__main__":
    raise SystemExit(main())
