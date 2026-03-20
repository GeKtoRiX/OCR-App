"""Smoke test for the Supertone TTS sidecar service."""

import sys
import time
import wave

import numpy as np

SIDECAR_URL = "http://127.0.0.1:8100"


def check(condition: bool, msg: str) -> None:
    if condition:
        print(f"  ✓ {msg}")
    else:
        print(f"  ✗ {msg}")
        sys.exit(1)


def main() -> None:
    try:
        import urllib.request
        import json

        print("=== Supertone TTS Sidecar Smoke Test ===\n")

        # 1. Health check
        print("[1] Health check...")
        with urllib.request.urlopen(f"{SIDECAR_URL}/health", timeout=10) as r:
            health = json.loads(r.read())
        check(health["status"] == "healthy", "Service is healthy")
        check(health["model_loaded"], "Model is loaded")
        check(len(health["voices"]) > 0, f"Voices available: {health['voices']}")
        check("en" in health["languages"], "English supported")
        print(f"  → Device: {health['device']}")
        print(f"  → Model: {health['model']}")

        # 2. TTS synthesis
        print("\n[2] TTS synthesis...")
        payload = json.dumps({
            "text": "Hello! Supertone TTS is working correctly.",
            "voice": "M1",
            "lang": "en",
            "speed": 1.05,
            "total_steps": 5,
        }).encode()
        req = urllib.request.Request(
            f"{SIDECAR_URL}/api/tts",
            data=payload,
            headers={"Content-Type": "application/json"},
        )
        t0 = time.time()
        with urllib.request.urlopen(req, timeout=60) as r:
            content_type = r.headers.get("Content-Type", "")
            wav_bytes = r.read()
        elapsed = time.time() - t0

        check("audio/wav" in content_type, f"Response is audio/wav (got {content_type})")
        check(len(wav_bytes) > 1000, f"Response size: {len(wav_bytes):,} bytes")

        # Validate WAV structure
        import io
        with wave.open(io.BytesIO(wav_bytes), "rb") as wf:
            sr = wf.getframerate()
            dur = wf.getnframes() / sr
            channels = wf.getnchannels()

        check(sr == 44100, f"Sample rate: {sr} Hz")
        check(channels == 1, f"Channels: {channels} (mono)")
        check(dur > 0.5, f"Duration: {dur:.2f}s")
        print(f"  → Synthesis time: {elapsed:.3f}s (RTF: {elapsed/dur:.4f}x)")

        # 3. Female voice + another language
        print("\n[3] Female voice + Spanish...")
        payload2 = json.dumps({
            "text": "Hola, esto es una prueba de síntesis de voz.",
            "voice": "F1",
            "lang": "es",
            "speed": 1.0,
            "total_steps": 3,
        }).encode()
        req2 = urllib.request.Request(
            f"{SIDECAR_URL}/api/tts",
            data=payload2,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req2, timeout=60) as r:
            wav_bytes2 = r.read()
        check(len(wav_bytes2) > 1000, f"Spanish audio: {len(wav_bytes2):,} bytes")

        print("\n=== All checks passed ✓ ===")

    except Exception as e:
        print(f"\n✗ Smoke test failed: {e}")
        sys.exit(1)


if __name__ == "__main__":
    main()
