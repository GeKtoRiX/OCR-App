"""Smoke test for the Voxtral sidecar service.

Default behavior verifies the adapter boots and surfaces a clear go/no-go state.
Set VOXTRAL_EXPECT_READY=true to require successful synthesis.
"""

from __future__ import annotations

import os
import sys
from pathlib import Path


ROOT_DIR = Path(__file__).resolve().parent
SERVICES_DIR = ROOT_DIR.parents[1]
sys.path.insert(0, str(SERVICES_DIR))

from smoke_utils import (  # noqa: E402
    assert_wav_payload,
    check,
    encode_json,
    find_free_port,
    prepend_torch_lib_path,
    request_bytes,
    request_json,
    start_uvicorn_process,
    terminate_process,
    wait_for_json,
)


STARTUP_TIMEOUT_SECONDS = int(os.getenv("VOXTRAL_SMOKE_TIMEOUT", "900"))
EXPECT_READY = os.getenv("VOXTRAL_EXPECT_READY", "false").lower() in {
    "1",
    "true",
    "yes",
    "on",
}


def main() -> int:
    port = find_free_port()
    upstream_port = find_free_port()
    base_url = f"http://127.0.0.1:{port}"
    env = os.environ.copy()
    env["VOXTRAL_HOST"] = "127.0.0.1"
    env["VOXTRAL_PORT"] = str(port)
    env["VOXTRAL_UPSTREAM_HOST"] = "127.0.0.1"
    env["VOXTRAL_UPSTREAM_PORT"] = str(upstream_port)
    prepend_torch_lib_path(env)

    print("=== Voxtral Sidecar Smoke Test ===\n")
    print(f"Starting Voxtral sidecar on port {port}")
    process = start_uvicorn_process(
        python_executable=sys.executable,
        service_dir=ROOT_DIR,
        port=port,
        env=env,
    )

    try:
        ready_check = (
            (lambda body: body.get("model") == "voxtral" and body.get("ready") is True)
            if EXPECT_READY
            else (lambda body: body.get("model") == "voxtral")
        )
        initial_health = wait_for_json(
            f"{base_url}/health",
            timeout_seconds=STARTUP_TIMEOUT_SECONDS,
            ready_check=ready_check,
        )
        check(initial_health.get("model") == "voxtral", "Health endpoint identifies Voxtral")

        if not EXPECT_READY:
            check("ready" in initial_health, "Health endpoint reports ready state")
            check(
                "startupError" in initial_health,
                "Health endpoint reports startupError for go/no-go diagnosis",
            )
            print("\nSmoke test passed in no-go-safe mode.")
            return 0

        check(initial_health.get("ready") is True, "Voxtral is ready for synthesis")
        headers, payload = encode_json(
            {
                "text": "Voxtral local speech synthesis is working.",
                "voice": "casual_male",
                "format": "wav",
            },
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
            label="Voxtral synthesis",
            expected_channels=1,
            min_duration_seconds=0.2,
        )

        final_health = request_json(f"{base_url}/health", timeout=30)
        check(final_health.get("ready") is True, "Service ready after inference")

        print("\nSmoke test passed in ready mode.")
        return 0
    except Exception as exc:
        print(f"Smoke test failed: {exc}", file=sys.stderr)
        return 1
    finally:
        terminate_process(process)


if __name__ == "__main__":
    raise SystemExit(main())
