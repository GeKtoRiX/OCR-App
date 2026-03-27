# Task Log

## Purpose

Short memory of recent significant changes so the next session does not need a full architectural rediscovery.

## Latest Significant Update

### 2026-03-27 - Full Documentation Refresh For Gateway/Services/Voxtral Stage

- Rewrote `README.md` to match the current runtime: HTTP gateway, TCP services, shared contract package, launcher defaults, and current TTS behavior.
- Rewrote `CLAUDE.md` and `agents.md` to remove stale monolith/MVVM descriptions and align them with the actual gateway/shared/services split and frontend store layout.
- Rewrote `structure.md`, `docs/agents/project-overview.md`, `docs/agents/architecture.md`, `docs/agents/runbook.md`, `docs/agents/context.md`, and `docs/agents/file-map.md`.
- Added ADRs for:
  - backend split into gateway + TCP services
  - `@ocr-app/shared` as the cross-process contract package
  - Voxtral as an optional non-blocking TTS adapter
- Updated operational context to reflect:
  - launcher defaults now come from `scripts/linux/tts-models.conf`
  - current default enables only Voxtral
  - health includes Voxtral fields
  - frontend currently shows only English Voxtral voices

### 2026-03-27 - Gateway/Services Split And Voxtral Integration

- Backend migrated to:
  - `backend/gateway`
  - `backend/services/{ocr,tts,document,vocabulary,agentic}`
  - `backend/shared`
- Public HTTP routing moved to the gateway; service apps expose TCP message controllers.
- Voxtral added as a separate TTS adapter path with dedicated health reporting and launcher integration.
- Frontend refactored to feature-oriented Zustand stores plus `shared/`, `ui/`, and `view/` layers.

### 2026-03-21 - Phase 3/4 Completion, Boundary Cleanup, Documentation Refresh

- Browser TTS e2e stabilized by waiting for the real `/api/tts` response and audio player visibility.
- Browser/perf harnesses use `LM_STUDIO_SMOKE_ONLY=true` and a temporary SQLite DB.
- Supertone sidecar now auto-falls back from ROCm to CPU when GPU inference fails.
- `TtsController` stopped owning temp-file concerns; typed in-memory payloads now flow through `SynthesizeSpeechUseCase`.

## Open Questions

- Should `/api/agents/*` degrade to a typed 503 when `OPENAI_API_KEY` is absent?
- Should launcher defaults remain Voxtral-only, or should the baseline stack re-enable Supertone/Kokoro/F5 by default?
- Should checked-in JS companions inside `backend/shared/src` stay committed, or move behind an explicit package build/publish flow?

## Update Rule

- Update this file after significant architectural or operational changes.
- Do not record cosmetic-only edits.
