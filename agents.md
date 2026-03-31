# Agents Workspace Guide

Read this file before changing architecture, launchers, contracts, or documentation.

## Read Order

1. `README.md`
2. `CLAUDE.md`
3. `agents.md`
4. `structure.md`
5. `docs/agents/project-overview.md`
6. `docs/agents/architecture.md`
7. `docs/agents/file-map.md`
8. `docs/agents/runbook.md`
9. `docs/agents/context.md`
10. `docs/agents/adr.md`
11. `docs/agents/task-log.md`

## Project Intent

- local-first OCR application with study workflows
- gateway + TCP service backend
- SQLite-backed documents, vocabulary, and practice sessions
- document-scoped `Save Vocabulary` review flow with confirm-before-save semantics
- local TTS via Supertone/Piper and Kokoro
- optional agentic planning/deployment features

## Working Rules

- Preserve the clean-architecture direction inside `backend/src`.
- Treat `backend/gateway`, `backend/services/*`, and `backend/shared` as the runtime split.
- Do not import concrete infrastructure into application or presentation layers.
- Keep the base OCR/TTS/document/vocabulary runtime independent from `OPENAI_API_KEY`.
- Update documentation together with code when routes, ports, stores, launchers, or file layout change.
- Do not treat `dist/`, `node_modules/`, `*.tsbuildinfo`, caches, or runtime logs as source of truth.
- When changing the file tree, update `structure.md` and `docs/agents/file-map.md`.
- When changing contracts, update gateway DTO assumptions, shared contracts, frontend API wrappers, and docs together.
- When changing `Save Vocabulary` or review/editor behavior, update browser e2e coverage and automation docs together.

## Architecture Guardrails

### Backend

- HTTP entrypoint: `backend/gateway`
- TCP services: `backend/services/{ocr,tts,document,vocabulary,agentic}`
- process boundary contracts: `backend/shared`
- reusable implementation: `backend/src`

Dependency expectations:

- `backend/shared` contains only shared entities, ports, value objects, and TCP contracts
- `backend/gateway` must stay thin: validate HTTP shape, proxy to TCP, map upstream errors
- `backend/services/*` host service-specific Nest apps
- `backend/src` remains the business-logic source reused by services

### Frontend

Current frontend layout is:

- `features/` for domain stores and feature-local components
- `shared/` for HTTP wrappers, types, and pure utilities
- `ui/` for shared presentational primitives
- `view/` for cross-feature composition surfaces

Do not reintroduce the removed `model/` / `viewmodel/` structure.

## Role Ownership

### Repository Architect

- Owns monorepo-wide structure, runtime split, and documentation integrity.
- Must update `structure.md` and `docs/agents/file-map.md` when the tree changes.

### Backend Architect

- Owns `backend/src`, `backend/gateway`, `backend/services/*`, and `backend/shared`.
- Protects the gateway/services/shared split.
- Ensures new cross-process payloads are defined in `backend/shared/src/contracts/*`.
- Ensures local and shared DI tokens stay aligned where both are used.
- Owns the document-vocabulary prepare/confirm contract surface across document and vocabulary services.

### Gateway Owner

- Owns `backend/gateway/*`.
- Keeps HTTP concerns in the gateway only.
- Preserves upstream error mapping behavior.
- Updates user-facing API docs when routes or validation rules change.

### Service Owner

- Owns `backend/services/*`.
- Keeps each service narrowly scoped to its bounded responsibility.
- Ensures service app modules bind the required local and shared tokens.

### Agentic Architect

- Owns `backend/src/agentic/*` and `backend/services/agentic/*`.
- Documents schema changes, tool changes, and deployment behavior.
- Responsible for future graceful degradation when `OPENAI_API_KEY` is absent.

### Frontend Architect

- Owns `frontend/src/*`.
- Preserves the feature/store/view split.
- Keeps orchestration in hooks and stores, not in shared UI primitives.
- Updates docs whenever store layout or result-panel flows change.
- Preserves the explicit `Save Document` / `Save Vocabulary` split and the review overlay editor workflow.

### OCR Integration Owner

- Owns PaddleOCR integration and LM Studio structuring path.
- Must update docs when OCR or structuring contracts change.

### TTS Integration Owner

- Owns Supertone/Piper and Kokoro sidecars plus backend integrations.
- Must update docs when sidecar contracts, launcher behavior, health fields, or frontend engine options change.
- Preserves the current rule that launcher defaults are configured in `scripts/linux/tts-models.conf`.

### Documentation Steward

- Owns `README.md`, `CLAUDE.md`, `agents.md`, `structure.md`, `docs/agents/*`, and `docs/agent-ecosystem.md`.
- Maintains current-state accuracy, not aspirational descriptions.
- Must keep `playwright*.config.ts` and `scripts/e2e/*` references aligned with the current automation entrypoints.

## Handoff Protocol

Every significant task handoff must include:

- `goal`
- `scope`
- `constraints`
- `inputs`
- `deliverables`
- `verification`

## Mandatory Checks Before Changes

Verify all applicable items before implementation:

- Are public routes changing?
  - `/api/ocr`
  - `/api/health`
  - `/api/tts`
  - `/api/documents/*`
  - `/api/documents/:id/vocabulary/*`
  - `/api/vocabulary/*`
  - `/api/practice/*`
  - `/api/agents/*`
- Are TCP contracts in `backend/shared/src/contracts/*` changing?
- Are health response fields changing?
- Are launcher defaults or runtime ports changing?
- Are frontend store boundaries or result-panel flows changing?
- Are docs now stale because of this task?

## Primary Entry Points

- Gateway bootstrap: `backend/gateway/src/main.ts`
- Gateway root module: `backend/gateway/src/app.module.ts`
- OCR TCP service: `backend/services/ocr/src/main.ts`
- TTS TCP service: `backend/services/tts/src/main.ts`
- Document TCP service: `backend/services/document/src/main.ts`
- Vocabulary TCP service: `backend/services/vocabulary/src/main.ts`
- Agentic TCP service: `backend/services/agentic/src/main.ts`
- Frontend root: `frontend/src/App.tsx`

## Current Runtime Facts

- launcher defaults currently enable Kokoro by default
- Kokoro is blocked client-side for Cyrillic text
- browser/perf automation may run with `LM_STUDIO_SMOKE_ONLY=true`
- `Save Vocabulary` prepares document-scoped candidates before writing to the shared vocabulary store
- the review overlay contains an embedded editor and optional LLM review toggle
- lightweight browser e2e exists for this flow via `test:e2e:browser:vocab`
- document vocabulary extraction prefers the optional Stanza sidecar on `:8501`
- for English targets, BERT sidecar on `:8502` (`bert-large-cased`) scores candidates via MLM and adjusts `selectedByDefault`; optional and degrades silently

## Related Docs

- `README.md`
- `CLAUDE.md`
- `structure.md`
- `docs/agents/project-overview.md`
- `docs/agents/architecture.md`
- `docs/agents/file-map.md`
- `docs/agents/runbook.md`
- `docs/agents/context.md`
- `docs/agents/adr.md`
- `docs/agents/task-log.md`
