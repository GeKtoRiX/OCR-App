# Agents Workspace Guide

This file defines the entry rules for both humans and agent systems. Read it first, then follow the linked documents in order before making any changes.

## Read Order

1. `CLAUDE.md` — technical guide: stack, architecture, commands, env vars
2. `agents.md` — roles, handoff protocol, working rules (this file)
3. `structure.md` — normative repository structure contract
4. `docs/agents/project-overview.md` — project summary and public APIs
5. `docs/agents/architecture.md` — backend layers, agentic bounded context, handoff schemas
6. `docs/agents/file-map.md` — map of all significant files
7. `docs/agents/runbook.md` — run, test and curl examples
8. `docs/agents/context.md` — current system status and active risks
9. `docs/agents/adr.md` — recorded architecture decisions
10. `docs/agents/task-log.md` — short memory of recent changes

## Project Intent

- OCR application monorepo.
- Backend: NestJS 10, clean/hexagonal architecture.
- Frontend: React 18 + Vite 6, MVVM pattern.
- OCR: PaddleOCR Python sidecar (primary); LM Studio — only for structuring raw text after OCR.
- Agentic: `backend/src/agentic` — isolated bounded context for autonomous architecture planning and deployment via OpenAI Agents SDK.

## Working Rules

- Do not break the existing clean/hexagonal backend structure.
- Read local context first, then edit.
- The core OCR runtime must work without an OpenAI API key. Agentic runtime is an optional dependency.
- Any changes in `backend/src/agentic/*` must be aligned with `docs/agents/architecture.md` and `docs/agent-ecosystem.md`.
- If a document is stale, update it alongside the code (ADR-005).
- Build artifacts (`backend/dist`, `frontend/dist`, `*.tsbuildinfo`) are not source files and must not be treated as source of truth.
- When changing the file tree, update `structure.md` and `docs/agents/file-map.md`.
- When changing REST endpoints or Zod schemas, update DTOs, schemas and docs simultaneously.

## Agent Roles

### Repository Architect

- Owns the monorepo structure, backend layers and documentation integrity.
- Must update `structure.md` and `docs/agents/file-map.md` whenever the file tree changes.

### Backend Architect

- Owns `backend/src/domain`, `application`, `infrastructure`, `presentation`.
- Ensures dependencies only flow upward: `presentation → application → domain`, `infrastructure → domain/application`.
- Prevents imports between `agentic` and OCR layers in either direction.

### Agentic Architect

- Owns `backend/src/agentic/*`.
- Designs agent roles (Analyze/Scaffold/Initialization/Deployment coordinators), handoff flows, guardrails, tool contracts and the deployment workflow.
- New agent roles, schemas and endpoints must be reflected in `docs/agents/architecture.md` and `docs/agent-ecosystem.md`.
- Ensures graceful degradation when the OpenAI API key is absent.

### Frontend Architect

- Owns `frontend/src/*`.
- Preserves the current MVVM organisation: `model`, `viewmodel`, `view`.
- Hooks (`useOCR`, `useImageUpload`, `useHealthStatus`) hold logic; components (`DropZone`, `ResultPanel`, `StatusBar`, `StatusLight`) are UI only.

### OCR Integration Owner

- Owns `paddleocr-service/*` and backend integrations with PaddleOCR / LM Studio.
- Any change to OCR sidecar contracts must be accompanied by updates to `docs/agents/runbook.md` and `docs/agents/context.md`.

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
- whether public REST endpoints (`/api/ocr`, `/api/health`, `/api/agents/*`) are changing;
- whether Zod schemas / DTOs / guardrails in `agentic/core/` are changing;
- whether `docs/agents/context.md` or `docs/agents/adr.md` needs updating.

## Primary Entry Points

- Backend bootstrap: `backend/src/main.ts`
- Root Nest module: `backend/src/presentation/app.module.ts`
- OCR API: `backend/src/presentation/controllers/ocr.controller.ts`
- Health API: `backend/src/presentation/controllers/health.controller.ts`
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
- Agentic runtime overview: `docs/agent-ecosystem.md`
