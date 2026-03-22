"""Smoke test for the Supertone + Piper TTS sidecar service."""

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
    request_bytes,
    start_uvicorn_process,
    terminate_process,
    wait_for_json,
)


STARTUP_TIMEOUT_SECONDS = int(os.getenv("SUPERTONE_SMOKE_TIMEOUT", "300"))


def synthesize(base_url: str, payload: dict[str, object], *, label: str, timeout: int) -> None:
    headers, body = encode_json(payload)
    response_headers, wav_bytes = request_bytes(
        f"{base_url}/api/tts",
        method="POST",
        data=body,
        headers=headers,
        timeout=timeout,
    )
    check(
        "audio/wav" in response_headers.get("Content-Type", ""),
        f"{label}: synthesis returns audio/wav",
    )
    assert_wav_payload(
        wav_bytes,
        label=label,
        expected_channels=1,
        min_duration_seconds=0.2,
    )


def main() -> int:
    port = find_free_port()
    base_url = f"http://127.0.0.1:{port}"
    env = {
        "SUPERTONE_HOST": "127.0.0.1",
        "SUPERTONE_PORT": str(port),
    }

    print("=== Supertone TTS Sidecar Smoke Test ===\n")
    print(f"Starting Supertone sidecar on port {port}")
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
        check(health.get("supertone", {}).get("ready") is True, "Supertone engine ready")
        check("en" in health.get("supertone", {}).get("languages", []), "English supported")
        available_piper_voices = health.get("piper", {}).get("available_voices", [])
        check(len(available_piper_voices) > 0, "Piper voices listed")

        synthesize(
            base_url,
            {
                "text": "Hello from the Supertone smoke test.",
                "engine": "supertone",
                "voice": "M1",
                "lang": "en",
                "speed": 1.05,
                "total_steps": 5,
            },
            label="Supertone synthesis",
            timeout=120,
        )

        synthesize(
            base_url,
            {
                "text": "Hello from the Piper smoke test.",
                "engine": "piper",
                "voice": available_piper_voices[0],
                "lang": "en",
                "speed": 1.0,
                "total_steps": 5,
            },
            label="Piper synthesis",
            timeout=180,
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
