# Current Context

## Snapshot Date

- `2026-03-21`

## System Status

- Backend, frontend, PaddleOCR sidecar, Supertone TTS sidecar, Kokoro TTS sidecar, and F5 TTS sidecar are structurally separated correctly.
- App runs as a direct Node.js process; sidecars run as separate host-side Python services (ports 8000, 8100, 8200, 8300).
- `scripts/linux/ocr.sh`, `scripts/linux/tts.sh`, and `scripts/linux/ocr-tts.sh` are the supported launcher entries; each shows a live 4-color status lamp for its mode.
- `scripts/e2e/prepare-browser-env.sh` and `scripts/perf/run-phase4.sh` provide production-like browser e2e and benchmark harnesses on a temporary SQLite database.
- `agentic` bounded context exists as a separate isolated module inside the backend.
- All architecture violations resolved: `HealthCheckUseCase` and `TtsController` now depend only on domain ports; `DatabaseModule` owns the SQLite singleton (ADR-007, 008, 009).
- `ResultPanel.tsx` is now rendering-focused; result-surface orchestration lives in `frontend/src/viewmodel/useResultPanel.ts`.
- Vocabulary, document, and practice domains are fully implemented with SQLite persistence and SRS (SM-2 algorithm).
- Documentation refreshed after Phase 4/5 to match current code paths, commands, and route contracts.

## Confirmed Facts

- Root `README.md` is present and serves as the user-facing entry point.
- `structure.md` is the normative contract for the repository tree.
- `agents.md` contains explicit role descriptions, working rules and handoff protocol.
- Health endpoint `/api/health` returns: `{ paddleOcrReachable, paddleOcrModels, paddleOcrDevice, lmStudioReachable, lmStudioModels, superToneReachable, kokoroReachable, f5TtsReachable, f5TtsDevice }`.
- TTS endpoint `POST /api/tts` accepts `{ text, engine, voice, lang, speed, totalSteps }` and returns `audio/wav` binary. Engine values: `supertone` (default), `piper`, `kokoro`, `f5`.
- Document endpoints: `POST/GET/PUT/DELETE /api/documents`.
- Vocabulary endpoints: `POST/GET/PUT/DELETE /api/vocabulary`.
- Practice endpoints: `POST /api/practice/start`, `POST /api/practice/answer`, `POST /api/practice/complete`, `GET /api/practice/sessions`, `GET /api/practice/stats/:vocabularyId`.
- Agentic endpoints (`/api/agents/architecture`, `/api/agents/deploy`) require `OPENAI_API_KEY`; without it they currently return 5xx while the base OCR scenario remains available.
- Phase 4 warm baseline on 2026-03-21: OCR `p50 2054.70 ms`, TTS `supertone 141.99 ms`, `piper 261.41 ms`, `kokoro 527.82 ms`, `f5 1174.91 ms`, browser `upload-to-result 3200.25 ms`, full workflow `7194.23 ms`.

## Current Risks

- Local-first strategy for the `agentic` runtime is incomplete: `/api/agents/*` returns 5xx rather than a typed graceful degradation response when the OpenAI key is absent.
- Build artifacts alongside sources increase the risk of accidentally editing generated files.
- Host-side PaddleOCR availability is an explicit runtime prerequisite.
- Host-side Supertone/Kokoro/F5 TTS availability is an explicit runtime prerequisite for TTS (non-critical for OCR).
- Browser/perf harnesses intentionally use `LM_STUDIO_SMOKE_ONLY=true`; this avoids real LM Studio generation during automation but means those runs do not benchmark local LLM structuring latency.
- Hardcoded structuring prompt in `LMStudioStructuringService` — not versioned or externalised.
- `onnxruntime-rocm` requires versioned `.so` symlinks from the PyTorch lib dir; missing symlinks cause silent fallback to CPU with misleading provider names.
- Sidecar cold starts remain uneven: Kokoro and F5 have materially higher startup and synthesis latency than Supertone/Piper.

## Recommended Next Actions

- Do not manually edit `dist` artifacts.
- When changing REST contracts, update DTOs, schemas and docs simultaneously.
- If `agentic` is extended — add graceful degradation when `OPENAI_API_KEY` is absent (for example 503 with a clear message instead of generic 5xx).
- If persistence for agent workflows is needed — add a dedicated storage layer inside `agentic/`.
- If Supertone/Kokoro/F5 GPU inference is required — verify `.so` symlinks and `LD_LIBRARY_PATH` before starting the sidecar.
- Prioritise perf work on OCR latency first, then Kokoro/F5 cold/warm latency, then UI orchestration around the full upload-to-result workflow.
