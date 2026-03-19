# Project Structure Contract

This document defines the target and permitted repository structure. If the actual file tree diverges from it, update the document first or bring the code into the described form.

## Root

Permitted root directories and files:

- `backend/`: NestJS backend.
- `frontend/`: React/Vite frontend.
- `paddleocr-service/`: Python OCR sidecar.
- `docs/`: project documentation.
- `scripts/`: platform-specific start/stop/kill scripts.
- `.claude/`: local workspace configuration.
- `agents.md`: agent entry point.
- `CLAUDE.md`: engineering guide.
- `package.json`, `package-lock.json`, `tsconfig.base.json`, `.gitignore`, `.env`.

## Backend

Backend source code lives exclusively in `backend/src/`.

### Layered Layout

- `backend/src/domain/`
  - `entities/*.entity.ts`
  - `ports/*.port.ts`
  - `constants.ts`
- `backend/src/application/`
  - `dto/*.dto.ts`
  - `use-cases/*.use-case.ts`
- `backend/src/infrastructure/`
  - `config/*.config.ts`
  - `lm-studio/*.service.ts`, `*.client.ts`
  - `paddleocr/*.service.ts`
- `backend/src/presentation/`
  - `controllers/*.controller.ts`
  - `dto/*.dto.ts`
  - `modules/*.module.ts`
  - `app.module.ts`
- `backend/src/agentic/`
  - `core/*.ts`
  - `agents/*.ts`
  - `guardrails/*.ts`
  - `tools/*.ts`
  - `application/*.service.ts`
  - `presentation/controllers/*.controller.ts`
  - `presentation/dto/*.dto.ts`
  - `presentation/modules/*.module.ts`
- `backend/src/main.ts`

### Tests

- Unit/spec tests colocated alongside sources: `*.spec.ts`.
- Cross-cutting backend tests are permitted at the root of `backend/src/`:
  - `app.e2e.spec.ts`
  - `integration.spec.ts`

### Naming Rules

- Entity files: `*.entity.ts`
- Port files: `*.port.ts`
- Use case files: `*.use-case.ts`
- Nest module files: `*.module.ts`
- Controller files: `*.controller.ts`
- DTO files: `*.dto.ts`
- Service files: `*.service.ts`
- Config files: `*.config.ts`

## Frontend

Frontend source code lives in `frontend/src/`.

- `model/`: API and types.
- `viewmodel/`: hooks and state.
- `view/`: React components.
- `App.tsx`, `main.tsx`, `styles.css`, `test-setup.ts`, `vite-env.d.ts`.

Files are named by responsibility:

- Components: `PascalCase.tsx`
- Hooks: `use*.ts`
- Tests: `*.spec.ts` / `*.spec.tsx`

## PaddleOCR Sidecar

- `paddleocr-service/main.py`: entry point.
- `paddleocr-service/smoke_test.py`: smoke test for sidecar startup and `/health`.
- `paddleocr-service/requirements.txt`: Python deps.

## Scripts

- `scripts/linux/ocr.sh`: unified Linux/macOS lifecycle script (`start`, `stop`, `wipe`, `status`).

## Documentation

- `docs/agents/`: operational documentation for architecture and agent work.
- `docs/agent-ecosystem.md`: runtime overview of the agentic bounded context.

## Non-Source Artifacts

The following paths are permitted as build/runtime artifacts but are not part of the source structure:

- `backend/dist/`
- `frontend/dist/`
- `frontend/tsconfig.tsbuildinfo`
- `node_modules/`

They must not be used as the basis for architectural decisions and should not appear in the file map as source of truth.

## Audit Result On 2026-03-19

- No critical hierarchy violations found in source files.
- All main backend and frontend files follow naming rules.
- `agentic/` bounded context is correctly isolated inside `backend/src/` and does not overlap with OCR layers.
- Frontend added `viewmodel/useHealthStatus.ts` and `view/StatusLight.tsx` — reflected in file-map and CLAUDE.md.
- Exception explicitly noted: `backend/src/integration.spec.ts` and `backend/src/app.e2e.spec.ts` reside at the root of `src/` as integration/e2e tests.
- Main source of potential confusion: build artifacts (`backend/dist`, `frontend/dist`, `frontend/tsconfig.tsbuildinfo`) present alongside sources — do not edit them.
- `scripts/windows/` removed — project targets Linux/macOS only.
- Backend process runs silently (`> /dev/null`); no log files are created in the project root.
