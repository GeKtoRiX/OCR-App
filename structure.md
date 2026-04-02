# Project Structure Contract

This document describes the repository layout as it exists today. Update it whenever the tree changes in a way that affects ownership, entry points, or architectural decisions.

## Root

Permitted top-level paths:

- `backend/`
- `frontend/`
- `services/`
- `scripts/`
- `docs/`
- `e2e/`
- `data/`
- `logs/`
- `.pids/`
- `.tools/`
- `.claude/`
- `README.md`
- `CLAUDE.md`
- `agents.md`
- `structure.md`
- `package.json`
- `package-lock.json`
- `playwright.config.ts`
- `playwright.save-vocabulary.config.ts`
- `tsconfig.base.json`
- `.gitignore`
- `.env`

## Backend

The backend is split into four logical areas.

### `backend/shared/`

Workspace package `@ocr-app/shared`.

Allowed contents:

- `src/domain/entities/*`
- `src/domain/ports/*`
- `src/domain/value-objects/*`
- `src/contracts/*`
- `src/index.ts`

The package currently also ships checked-in runtime companions (`.js`, `.d.ts.map`) alongside some TS sources. Those are tolerated as part of the current package shape and should not be treated as a reason to change architecture decisions silently.

### `backend/gateway/`

HTTP gateway on port `3000`.

Allowed contents:

- `src/app.module.ts`
- `src/main.ts`
- `src/ocr/*`
- `src/tts/*`
- `src/document/*`
- `src/vocabulary/*`
- `src/practice/*`
- `src/health/*`
- `src/agentic/*`
- `src/filters/*`
- `src/upstream-http-error.ts`

### `backend/services/`

TCP service applications:

- `ocr/` -> port `3901`
- `tts/` -> port `3902`
- `document/` -> port `3903`
- `vocabulary/` -> port `3904`
- `agentic/` -> port `3905`

Each service may contain:

- `src/app.module.ts`
- `src/main.ts`
- `src/*.message.controller.ts`
- `tsconfig.json`

### `backend/src/`

Reusable implementation source shared by the service apps.

Allowed subtrees:

- `domain/`
- `application/`
- `infrastructure/`
- `presentation/`
- `agentic/`

Dependency direction inside this subtree:

```text
domain <- application <- infrastructure / presentation
```

## Frontend

Frontend source lives under `frontend/src/`.

### Layout

- `features/`
  - `ocr/`
  - `tts/`
  - `documents/`
  - `vocabulary/`
  - `practice/`
  - `health/`
- `shared/`
  - `api.ts`
  - `types.ts`
  - `lib/*`
- `ui/`
- `view/`
- `styles/`
- `App.tsx`
- `main.tsx`
- `test-setup.ts`
- `vite-env.d.ts`

### Rules

- Do not reintroduce `model/` or `viewmodel/`.
- Stores live in `features/*/*.store.ts`.
- Feature hooks live with their feature or view surface.
- Shared HTTP wrappers live in `shared/api.ts`.
- Shared pure utilities live in `shared/lib/`.

## Sidecars

### NLP

- `services/nlp/stanza-service/main.py`
- `services/nlp/stanza-service/requirements.txt`
- `services/nlp/bert-service/main.py`
- `services/nlp/bert-service/requirements.txt`

### TTS

Supertone + Piper:

- `services/tts/supertone-service/main.py`
- `services/tts/supertone-service/smoke_test.py`
- `services/tts/supertone-service/requirements.txt`
- `services/tts/supertone-service/models/`

Kokoro:

- `services/tts/kokoro-service/main.py`
- `services/tts/kokoro-service/smoke_test.py`
- `services/tts/kokoro-service/requirements.txt`
- `services/tts/kokoro-service/models/`

## Scripts

Launcher scripts:

- `scripts/linux/ocr-common.sh`
- `scripts/linux/ocr.sh`
- `scripts/linux/tts-models.conf`
- `scripts/linux/run-js-command.sh`
- `scripts/linux/bootstrap-js-tooling.sh`

Automation:

- `scripts/e2e/prepare-browser-env.sh`
- `scripts/e2e/prepare-save-vocabulary-env.sh`
- `scripts/e2e/stop-browser-env.sh`
- `scripts/perf/api-benchmark.mjs`
- `scripts/perf/browser-benchmark.mjs`
- `scripts/perf/run-phase4.sh`
- `scripts/perf/shared.mjs`

## Documentation

- `docs/agent-ecosystem.md`
- `docs/agents/project-overview.md`
- `docs/agents/architecture.md`
- `docs/agents/file-map.md`
- `docs/agents/runbook.md`
- `docs/agents/context.md`
- `docs/agents/adr.md`
- `docs/agents/task-log.md`

## Non-Source Artifacts

These paths may exist at runtime but are not source of truth:

- `backend/dist/`
- `backend/shared/dist/`
- `frontend/dist/`
- `node_modules/`
- `frontend/node_modules/`
- `backend/node_modules/`
- `*.tsbuildinfo`
- `.venv/`
- `.venv.bak*/`
- `logs/`
- `.pids/`
- `tmp/`
- `coverage/`
- `playwright-report/`
- `test-results/`
- `.tools/`

## Audit Snapshot - 2026-03-31

- Gateway/services/shared split is present and active.
- Frontend uses feature-oriented folders with Zustand stores, not MVVM.
- Stanza is present as an optional NLP sidecar for document vocabulary extraction (port `:8501`).
- BERT MLM scorer sidecar added (`prajjwal1/bert-tiny`, port `:8502`, English-only, optional).
- Vocabulary extraction pipeline order: Stanza (or heuristic fallback) → BERT scoring → `DocumentVocabCandidate` construction.
- Launcher-side TTS defaults are controlled through `scripts/linux/tts-models.conf`.
- `Save Vocabulary` uses document-scoped candidate preparation plus a confirm-before-save review overlay.
