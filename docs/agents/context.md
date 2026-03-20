# Current Context

## Snapshot Date

- `2026-03-21`

## System Status

- Backend, frontend, PaddleOCR sidecar, Supertone TTS sidecar, Kokoro TTS sidecar, and Qwen TTS sidecar are structurally separated correctly.
- App runs as a direct Node.js process; sidecars run as separate host-side Python services (ports 8000, 8100, 8200, 8300).
- `scripts/linux/ocr.sh` auto-starts all services and shows a live 4-color status lamp.
- `agentic` bounded context exists as a separate isolated module inside the backend.
- All architecture violations resolved: `HealthCheckUseCase` and `TtsController` now depend only on domain ports; `DatabaseModule` owns the SQLite singleton (ADR-007, 008, 009).
- Vocabulary, document, and practice domains are fully implemented with SQLite persistence and SRS (SM-2 algorithm).
- All documentation (CLAUDE.md, agents.md, structure.md, docs/agents/*) has been reviewed and aligned with the actual code.

## Confirmed Facts

- Root `README.md` is present and serves as the user-facing entry point.
- `structure.md` is the normative contract for the repository tree.
- `agents.md` contains explicit role descriptions, working rules and handoff protocol.
- Health endpoint `/api/health` returns: `{ paddleOcrReachable, paddleOcrModels, paddleOcrDevice, lmStudioReachable, lmStudioModels, superToneReachable, kokoroReachable, qwenTtsReachable, qwenTtsDevice }`.
- TTS endpoint `POST /api/tts` accepts `{ text, engine, voice, lang, speed, totalSteps, speaker, instruct }` and returns `audio/wav` binary. Engine values: `supertone` (default), `kokoro`, `qwen`.
- Document endpoints: `POST/GET/PUT/DELETE /api/documents`.
- Vocabulary endpoints: `POST/GET/PUT/DELETE /api/vocabulary`.
- Practice endpoints: `POST /api/practice/start`, `POST /api/practice/answer`, `POST /api/practice/complete`, `GET /api/practice/sessions`, `GET /api/practice/stats/:vocabularyId`.
- Agentic endpoints (`/api/agents/architecture`, `/api/agents/deploy`) require `OPENAI_API_KEY` and are not required for the base OCR scenario.

## Current Risks

- Local-first strategy for the `agentic` runtime is incomplete: the service crashes rather than degrading gracefully when the OpenAI key is absent.
- Build artifacts alongside sources increase the risk of accidentally editing generated files.
- Host-side PaddleOCR availability is an explicit runtime prerequisite.
- Host-side Supertone/Kokoro/Qwen TTS availability is an explicit runtime prerequisite for TTS (non-critical for OCR).
- Hardcoded structuring prompt in `LMStudioStructuringService` — not versioned or externalised.
- `onnxruntime-rocm` requires versioned `.so` symlinks from the PyTorch lib dir; missing symlinks cause silent fallback to CPU with misleading provider names.
- `LMStudioConfig` is provided independently in both `OcrModule` and `VocabularyModule` — both read the same env vars and produce equivalent values (not a runtime bug, but could be unified into an `LmStudioModule` in a future pass).

## Recommended Next Actions

- Do not manually edit `dist` artifacts.
- When changing REST contracts, update DTOs, schemas and docs simultaneously.
- If `agentic` is extended — add graceful degradation when `OPENAI_API_KEY` is absent (return 503 with a clear message instead of crashing).
- If persistence for agent workflows is needed — add a dedicated storage layer inside `agentic/`.
- If Supertone/Kokoro/Qwen GPU inference is required — verify `.so` symlinks and `LD_LIBRARY_PATH` before starting the sidecar.
- Future improvement: consolidate `LMStudioConfig` + `LMStudioClient` into a shared `LmStudioModule` to eliminate the duplicate provider.
