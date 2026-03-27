# Current Context

## Snapshot Date

- `2026-03-27`

## System Status

- backend is split into `gateway`, `services/*`, and `shared`
- gateway is the only HTTP entrypoint
- OCR, TTS, document, vocabulary, and agentic workloads are hosted as separate TCP service apps
- reusable business logic still lives in `backend/src`
- frontend uses a feature/store/view layout with Zustand stores
- Voxtral is integrated as an optional TTS adapter and appears in health + frontend
- launcher-side TTS defaults are now controlled through `scripts/linux/tts-models.conf`
- current launcher default enables only Voxtral
- documentation has been refreshed to match the current repo shape

## Confirmed Facts

- `GET /api/health` includes Voxtral fields:
  - `voxtralReachable`
  - `voxtralDevice`
- `POST /api/tts` supports:
  - `supertone`
  - `piper`
  - `kokoro`
  - `f5`
  - `voxtral`
- gateway validates TTS text length at `5000`
- F5 uploads are accepted in memory through the gateway and forwarded over TCP
- browser/perf automation may use `LM_STUDIO_SMOKE_ONLY=true`
- frontend currently exposes only English Voxtral voices
- Kokoro is rejected client-side for Cyrillic text
- SQLite persistence is split:
  - `data/documents.sqlite`
  - `data/vocabulary.sqlite`

## Current Risks

- `agentic` still lacks a graceful degraded response when `OPENAI_API_KEY` is absent
- checked-in runtime companion files inside `backend/shared/src` can confuse readers if treated as primary source
- launcher defaults can surprise operators because only Voxtral is enabled by default
- Voxtral readiness remains hardware-sensitive on AMD/ROCm
- build artifacts and caches can accumulate quickly if not cleaned periodically

## Recommended Next Actions

- do not edit generated artifacts under `dist/` or checked-in JS companions when the TS source is the true edit target
- when changing public routes, update gateway docs and shared contracts together
- if the launcher defaults change, update `README.md`, `CLAUDE.md`, `agents.md`, and `docs/agents/runbook.md`
- implement explicit graceful degradation for `/api/agents/*`
- consider documenting or automating routine cache cleanup for large local runtime artifacts
