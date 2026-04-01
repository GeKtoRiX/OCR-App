# Task Log

## Purpose

Short memory of recent significant changes so the next session does not need a full architectural rediscovery.

## Latest Significant Update

### 2026-03-31 - BERT MLM Scorer Sidecar Integration

- Added `services/nlp/bert-service/` FastAPI sidecar hosting `prajjwal1/bert-tiny` (port `:8502`).
- Sidecar exposes `GET /health` and `POST /score`; scores candidates by masking surface tokens and computing geometric-mean MLM probability.
- `DocumentVocabularyExtractorService` calls BERT between Stanza extraction and `DocumentVocabCandidate` construction. English-only (`targetLang === 'en'`); silent fallback on any error.
- Words with `bertProb >= 0.15` (contextually predictable) get `selectedByDefault: false`; rare/domain words keep `true`.
- Launcher integration mirrors Stanza: `BERT_VENV`, `PID_BERT`, `LOG_BERT`, `check_bert()`, `start_bert()` (120 s wait, optional Step 1e), kill and status display in all three mode branches.
- Added `npm run dev:bert` and `npm run smoke:bert` (port `8502`).
- Model cached under `services/nlp/bert-service/models/` (gitignored, ~1.3 GB).
- ADR-012 added for the BERT MLM scoring decision.

### 2026-03-28 - Save Vocabulary Review Flow, Stanza Sidecar, And Lightweight Browser E2E

- Added document-scoped vocabulary candidate preparation and confirm-before-save endpoints under `/api/documents/:id/vocabulary/*`.
- Frontend now splits `Save Document` and `Save Vocabulary`; the vocabulary path opens a review overlay with an embedded editor and optional LLM review.
- Added optional `services/nlp/stanza-service/` for document vocabulary extraction with heuristic fallback in the document service.
- Added lightweight browser automation for this flow:
  - `playwright.save-vocabulary.config.ts`
  - `e2e/save-vocabulary.spec.ts`
  - `scripts/e2e/prepare-save-vocabulary-env.sh`
  - `npm run test:e2e:browser:vocab`

### 2026-03-27 - Full Documentation Refresh For Gateway/Services Split

- Rewrote `README.md` to match the current runtime: HTTP gateway, TCP services, shared contract package, launcher defaults, and current TTS behavior.
- Rewrote `CLAUDE.md` and `agents.md` to remove stale monolith/MVVM descriptions and align them with the actual gateway/shared/services split and frontend store layout.
- Rewrote `structure.md`, `docs/agents/project-overview.md`, `docs/agents/architecture.md`, `docs/agents/runbook.md`, `docs/agents/context.md`, and `docs/agents/file-map.md`.
- Added ADRs for:
  - backend split into gateway + TCP services
  - `@ocr-app/shared` as the cross-process contract package
- Updated operational context to reflect:
  - launcher defaults now come from `scripts/linux/tts-models.conf`

### 2026-03-27 - Gateway/Services Split

- Backend migrated to:
  - `backend/gateway`
  - `backend/services/{ocr,tts,document,vocabulary,agentic}`
  - `backend/shared`
- Public HTTP routing moved to the gateway; service apps expose TCP message controllers.
- Frontend refactored to feature-oriented Zustand stores plus `shared/`, `ui/`, and `view/` layers.

### 2026-03-21 - Phase 3/4 Completion, Boundary Cleanup, Documentation Refresh

- Browser TTS e2e stabilized by waiting for the real `/api/tts` response and audio player visibility.
- Browser/perf harnesses use `LM_STUDIO_SMOKE_ONLY=true` and a temporary SQLite DB.
- Supertone sidecar now auto-falls back from ROCm to CPU when GPU inference fails.
- `TtsController` stopped owning temp-file concerns; typed in-memory payloads now flow through `SynthesizeSpeechUseCase`.

## Open Questions

- Should `/api/agents/*` degrade to a typed 503 when `OPENAI_API_KEY` is absent?
- Should launcher defaults remain Kokoro-first, or should the baseline stack re-enable Supertone by default?
- Should checked-in JS companions inside `backend/shared/src` stay committed, or move behind an explicit package build/publish flow?

## Update Rule

- Update this file after significant architectural or operational changes.
- Do not record cosmetic-only edits.
