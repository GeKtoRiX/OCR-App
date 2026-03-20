"""Smoke test for the Qwen3-TTS CustomVoice sidecar service."""

from __future__ import annotations

import os
import sys

import requests

SIDECAR_URL = os.getenv("QWEN_TTS_BASE_URL", "http://localhost:8300")


def check(condition: bool, message: str) -> None:
    status = "OK" if condition else "FAIL"
    print(f"[{status}] {message}")
    if not condition:
        raise SystemExit(1)


def assert_wav(payload: bytes, label: str) -> None:
    check(len(payload) > 128, f"{label}: audio payload is non-empty ({len(payload)} bytes)")
    check(payload[:4] == b"RIFF", f"{label}: payload is WAV")


def main() -> None:
    print("=== Qwen3-TTS CustomVoice Sidecar Smoke Test ===\n")

    health_res = requests.get(f"{SIDECAR_URL}/health", timeout=15)
    check(health_res.ok, f"GET /health returned {health_res.status_code}")
    health = health_res.json()
    check(health.get("ready") is True, f"Service ready: {health.get('ready')}")
    check(health.get("device") == "gpu", f"Device is GPU: {health.get('device')}")

    payload = {
        "text": "Qwen custom voice synthesis is working.",
        "lang": "English",
        "speaker": "Ryan",
        "instruct": "Speak clearly with a confident neutral delivery.",
    }
    res = requests.post(f"{SIDECAR_URL}/api/tts", json=payload, timeout=180)
    check(res.ok, f"CustomVoice synthesis returned {res.status_code}")
    assert_wav(res.content, "CustomVoice")

    print("\nSmoke test passed.")


if __name__ == "__main__":
    try:
        main()
    except requests.RequestException as exc:
        print(f"[FAIL] Request error: {exc}", file=sys.stderr)
        raise SystemExit(1) from exc
