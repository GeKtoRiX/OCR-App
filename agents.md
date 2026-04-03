# Agents Workspace Guide

Read this file before changing architecture, launchers, contracts, tests, or agent-facing docs.

## Read Order

1. `README.md`
2. `CLAUDE.md`
3. `agents.md`
4. `structure.md`
5. `docs/agents/architecture.md`
6. `docs/agents/runbook.md`
7. `docs/agents/context.md`

## Project Intent

- local-first OCR and study workflow
- HTTP gateway plus dedicated TCP services
- SQLite-backed documents, vocabulary, and practice sessions
- document-scoped `Save Vocabulary` prepare/review/confirm flow
- local TTS through Supertone/Piper and Kokoro
- optional agentic endpoints behind `OPENAI_API_KEY`

## Source Of Truth

- structure and ownership: `structure.md`
- architecture and ports: `docs/agents/architecture.md`
- commands, launcher, tests, endpoints: `docs/agents/runbook.md`
- live operational facts and current priorities: `docs/agents/context.md`

Everything else is secondary. Do not treat `dist/`, `node_modules/`, caches, logs, or generated artifacts as source of truth.

## Working Rules

- Preserve the split between `backend/gateway`, `backend/services/*`, `backend/shared`, and `backend/src`.
- Keep `backend/gateway` thin: validate HTTP shape, proxy to services, map upstream errors.
- Keep cross-process contracts in `backend/shared/src/contracts/*`.
- Preserve clean-architecture direction inside `backend/src`.
- Keep the base OCR/TTS/document/vocabulary runtime independent from `OPENAI_API_KEY`.
- Do not reintroduce the old frontend `model/` or `viewmodel/` layout.
- Update docs together with code whenever routes, ports, launchers, contracts, stores, or runtime behavior change.
- When changing tests, keep `docs/agents/runbook.md` aligned with the actual commands.
- When changing agent-facing docs, keep the MCP doc catalog in `scripts/mcp-vocab-server.js` aligned.

## Ownership

- Repository structure and docs: `README.md`, `CLAUDE.md`, `agents.md`, `structure.md`, `docs/agents/*`
- Backend runtime: `backend/gateway`, `backend/services/*`, `backend/shared`, `backend/src`
- Frontend runtime: `frontend/src/*`
- Python sidecars: `services/nlp/*`, `services/tts/*`
- Launcher and automation: `scripts/linux/*`, `scripts/e2e/*`, `scripts/perf/*`
- Local MCP: `scripts/mcp-vocab-server.js`

## Mandatory Checks Before Changes

- Are public routes changing under `/api/*`?
- Are TCP contracts in `backend/shared/src/contracts/*` changing?
- Are ports, launcher defaults, or health payload fields changing?
- Are frontend store boundaries or the `Save Vocabulary` flow changing?
- Are test commands, launcher steps, or local setup instructions changing?
- Are agent-facing docs or MCP project maps now stale because of this task?

## Handoff Protocol

Every non-trivial handoff should include:

- `goal`
- `scope`
- `constraints`
- `changed files`
- `verification`
- `open risks`

## Primary Entry Points

- gateway bootstrap: `backend/gateway/src/main.ts`
- gateway root module: `backend/gateway/src/app.module.ts`
- OCR service: `backend/services/ocr/src/main.ts`
- TTS service: `backend/services/tts/src/main.ts`
- document service: `backend/services/document/src/main.ts`
- vocabulary service: `backend/services/vocabulary/src/main.ts`
- agentic service: `backend/services/agentic/src/main.ts`
- frontend root: `frontend/src/App.tsx`
- launcher: `scripts/linux/ocr.sh`
- local MCP: `scripts/mcp-vocab-server.js`

## Current Runtime Facts

- launcher defaults currently enable Kokoro and disable Supertone
- Kokoro is blocked client-side for Cyrillic text
- document vocabulary extraction prefers Stanza on `:8501`
- English candidate scoring may use the optional BERT sidecar on `:8502`
- `Save Vocabulary` uses prepare and confirm endpoints before writing to the shared vocabulary store
- browser and perf automation may use `LM_STUDIO_SMOKE_ONLY=true`
- the local project MCP has been expanded to cover maps, repo navigation, DB access, testing, launcher control, and log diagnosis

## Kept Agent Docs

- `docs/agents/architecture.md`
- `docs/agents/runbook.md`
- `docs/agents/context.md`
