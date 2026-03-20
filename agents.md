# Agents Workspace Guide

This file defines the entry rules for both humans and agent systems. Read it first, then follow the linked documents in order before making any changes.

## Read Order

1. `CLAUDE.md` — technical guide: stack, architecture, commands, env vars
2. `agents.md` — roles, handoff protocol, working rules (this file)
3. `structure.md` — normative repository structure contract
4. `docs/agents/project-overview.md` — project summary and public APIs
5. `docs/agents/architecture.md` — backend layers, port map, all pipelines, agentic bounded context
6. `docs/agents/file-map.md` — map of all significant files
7. `docs/agents/runbook.md` — run, test and curl examples
8. `docs/agents/context.md` — current system status and active risks
9. `docs/agents/adr.md` — recorded architecture decisions
10. `docs/agents/task-log.md` — short memory of recent changes

## Project Intent

- OCR application monorepo with vocabulary learning and TTS synthesis.
- Backend: NestJS 10, clean/hexagonal architecture.
- Frontend: React 18 + Vite 6, MVVM pattern.
- OCR: PaddleOCR Python sidecar (primary); LM Studio — only for structuring raw text after OCR.
- Persistence: SQLite via better-sqlite3 for saved documents, vocabulary words (SRS), and practice sessions.
- TTS: Supertone (port 8100), Kokoro (port 8200), Qwen TTS (port 8300) — all Python FastAPI sidecars.
- Agentic: `backend/src/agentic` — isolated bounded context for autonomous architecture planning and deployment via OpenAI Agents SDK.

## Working Rules

- Do not break the existing clean/hexagonal backend structure.
- Read local context first, then edit.
- Domain ports are abstract classes used as NestJS DI tokens — never import concrete infrastructure from application or presentation layers.
- The core OCR runtime must work without an OpenAI API key. Agentic runtime is an optional dependency.
- Any changes in `backend/src/agentic/*` must be aligned with `docs/agents/architecture.md`.
- If a document is stale, update it alongside the code (ADR-005).
- Build artifacts (`backend/dist`, `frontend/dist`, `*.tsbuildinfo`) are not source files and must not be treated as source of truth.
- When changing the file tree, update `structure.md` and `docs/agents/file-map.md`.
- When changing REST endpoints or Zod schemas, update DTOs, schemas and docs simultaneously.

## Agent Roles

### Repository Architect

- Owns the monorepo structure, backend layers and documentation integrity.
- Must update `structure.md` and `docs/agents/file-map.md` whenever the file tree changes.
- Ensures ADR-005 compliance: architectural changes are not complete without documentation updates.

### Backend Architect

- Owns `backend/src/domain`, `application`, `infrastructure`, `presentation`.
- Enforces strict dependency direction: `presentation → application → domain`; `infrastructure → domain/application`.
- Ensures every new service or repository provides a corresponding domain port abstract class.
- Prevents imports between `agentic` and OCR layers in either direction.
- New ports must be bound as NestJS tokens via `useExisting` in the appropriate module and exported for cross-module consumers.

### Agentic Architect

- Owns `backend/src/agentic/*`.
- Designs agent roles (Analyze/Scaffold/Initialization/Deployment coordinators), handoff flows, guardrails, tool contracts and the deployment workflow.
- New agent roles, schemas and endpoints must be reflected in `docs/agents/architecture.md`.
- Ensures graceful degradation when the OpenAI API key is absent.

### Frontend Architect

- Owns `frontend/src/*`.
- Preserves the current MVVM organisation: `model/` (API + types), `viewmodel/` (hooks), `view/` (components).
- Hooks (`useOCR`, `useImageUpload`, `useHealthStatus`, `useSessionHistory`, `useTts`, `useSavedDocuments`, `useVocabulary`, `usePractice`) hold all logic; components are UI only.
- Health lamp uses 4 colors: 🔵 blue (all OK), 🟢 green (GPU OK, partial), 🟡 yellow (CPU), 🔴 red (PaddleOCR down).

### OCR Integration Owner

- Owns `services/ocr/paddleocr-service/` and backend integrations with PaddleOCR / LM Studio.
- Any change to OCR or structuring sidecar contracts must be accompanied by updates to `docs/agents/runbook.md` and `docs/agents/context.md`.

### TTS Integration Owner

- Owns `services/tts/` sidecars and backend integrations (`ISupertonePort`, `IKokoroPort`, `IQwenTtsPort`, `SynthesizeSpeechUseCase`, `TtsController`, `TtsModule`).
- Any change to TTS sidecar contracts (request shape, response format, health endpoint) must be accompanied by updates to `docs/agents/runbook.md`, `docs/agents/context.md`, and the REST API documentation.
- Responsible for GPU (ROCm ONNX Runtime) runtime setup and `LD_LIBRARY_PATH` correctness in `ocr.sh` and `package.json` scripts.

### Documentation Steward

- Owns `agents.md`, `structure.md`, `docs/agents/*` synchronisation.
- Records current status, decisions and open questions without requiring a full code re-read.

## Task Handoff Protocol

Every task handed off between roles or agents must carry a minimum set of fields:

- `goal`: expected output.
- `scope`: directories and files that may be changed.
- `constraints`: architectural and runtime restrictions.
- `inputs`: document references, API contracts, env vars, related decisions.
- `deliverables`: code, tests, documents, migrations.
- `verification`: how completion is confirmed.

## Mandatory Context For Agent Tasks

Before executing an agent-related task, the assignee must explicitly verify:

- whether there is a dependency on the OpenAI API key;
- whether a local-first fallback is required;
- whether public REST endpoints (`/api/ocr`, `/api/health`, `/api/tts`, `/api/documents`, `/api/vocabulary`, `/api/practice`, `/api/agents/*`) are changing;
- whether Zod schemas / DTOs / guardrails in `agentic/core/` are changing;
- whether `docs/agents/context.md` or `docs/agents/adr.md` needs updating;
- whether health response fields (paddleOcrReachable, superToneReachable, kokoroReachable, qwenTtsReachable, etc.) are being added/removed.

## Primary Entry Points

- Backend bootstrap: `backend/src/main.ts`
- Root Nest module: `backend/src/presentation/app.module.ts`
- OCR API: `backend/src/presentation/controllers/ocr.controller.ts`
- Health API: `backend/src/presentation/controllers/health.controller.ts`
- TTS API: `backend/src/presentation/controllers/tts.controller.ts`
- Document API: `backend/src/presentation/controllers/document.controller.ts`
- Vocabulary API: `backend/src/presentation/controllers/vocabulary.controller.ts`
- Practice API: `backend/src/presentation/controllers/practice.controller.ts`
- Agent APIs: `backend/src/agentic/presentation/controllers/agent-ecosystem.controller.ts`

## Related Docs

- Structure contract: `structure.md`
- Overview: `docs/agents/project-overview.md`
- Architecture: `docs/agents/architecture.md`
- File map: `docs/agents/file-map.md`
- Runbook: `docs/agents/runbook.md`
- Current status: `docs/agents/context.md`
- ADR register: `docs/agents/adr.md`
- Change memory: `docs/agents/task-log.md`
