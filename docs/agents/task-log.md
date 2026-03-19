# Task Log

## Purpose

Short memory of recent significant changes, allowing quick context recovery at the start of the next task.

## Latest Significant Update

### 2026-03-19 - Frontend Redesign, Scripts Cleanup, Log Removal

- Frontend fully redesigned: dark theme (`#1b1e26` base), minimalist layout, no hero block.
- All UI text translated to English; Russian strings removed from all frontend files.
- `StatusLight` health indicator moved into Pipeline panel header.
- Layout changed to fit viewport by default; expands naturally when OCR result is present.
- `scripts/windows/` directory removed — project targets Linux/macOS only.
- `scripts/linux/start.sh`, `stop.sh`, `kill.sh` replaced by unified `scripts/linux/ocr.sh` (`start|stop|wipe|status`).
- Backend process now runs with `> /dev/null` — no `app.log` or `paddleocr.log` created in project root.
- `.gitignore` updated: `*.log` and `.*.pid` patterns added.
- `structure.md`, `docs/agents/file-map.md`, `docs/agents/runbook.md`, `docs/agents/context.md` updated to reflect all changes.

### 2026-03-19 - Removed Docker

- Deleted `Dockerfile`, `docker-compose.yml`, `.dockerignore`, `paddleocr-service/Dockerfile`, `paddleocr-service/.dockerignore`.
- Rewrote all scripts (`start.sh/bat`, `stop.sh/bat`, `kill.sh/bat`) to use direct Node.js process instead of Docker containers.
- `start.*` now builds with `npm run build` and starts `node backend/dist/main.js`.
- `stop.*` kills the node process; `kill.*` kills it and removes build artifacts.
- Updated `README.md`, `CLAUDE.md`, `structure.md`, and all `docs/agents/*` to remove Docker references.

### 2026-03-19 - Reduced PaddleOCR Docker Base Image Size

- `paddleocr-service/Dockerfile` switched from the heavier ROCm complete image to the leaner `rocm/dev-ubuntu-22.04:6.4` base image.
- Added `ROCM_BASE_IMAGE` build arg for controlled overrides without editing the Dockerfile again.
- Root `README.md` updated with Docker disk-usage troubleshooting and cleanup commands (`docker system df`, `docker builder prune -a`, `docker system prune -a`).
- Goal: reduce the default PaddleOCR sidecar image footprint and make cache-related disk usage easier to diagnose.

### 2026-03-19 - Docker Compose Switched To Host-Side PaddleOCR

- `docker-compose.yml` no longer starts the PaddleOCR container; the app now connects to `host.docker.internal:8000`.
- Windows and Linux start scripts now check the external PaddleOCR sidecar before starting Docker.
- Cleanup scripts now also prune Docker build cache.
- `README.md`, `CLAUDE.md`, `docs/agents/runbook.md`, and `docs/agents/context.md` updated to reflect the host-side PaddleOCR requirement.

### 2026-03-19 - Full Architectural Review And Documentation Refresh

- Complete project review: backend, frontend, agentic, sidecar, documentation.
- **CLAUDE.md** — full update:
  - Added `agentic/` layer to the backend architecture tree.
  - Fixed `/api/health` response shape (was incorrect; now reflects the real `{ paddleOcrReachable, paddleOcrModels, paddleOcrDevice, lmStudioReachable, lmStudioModels }`).
  - Added `useHealthStatus.ts` and `StatusLight.tsx` to the frontend MVVM section.
  - Added Agentic API endpoints section (`/api/agents/architecture`, `/api/agents/deploy`).
  - Added agentic environment variables (`OPENAI_API_KEY`, `OPENAI_AGENT_*`, `AGENT_*`).
  - Added references to `agents.md` and `structure.md`.
- **agents.md** — refined working rules, added Frontend Architect role description with `useHealthStatus` and `StatusLight`, added reference to `docs/agent-ecosystem.md`.
- **structure.md** — updated audit result to 2026-03-19, recorded current findings.
- **docs/agents/context.md** — updated snapshot, system status, risks and recommendations.
- **docs/agents/file-map.md** — added all previously missing files:
  - `useHealthStatus.ts`, `StatusLight.tsx` (frontend)
  - `health-check.dto.ts`, `health-check.use-case.ts` (application layer)
  - `paddleocr-health.service.ts`, `lm-studio.client.ts` (infrastructure)
  - All agentic files organised into a separate section.
- **docs/agents/architecture.md** — expanded to a full description: dependency rules, domain ports, OCR pipeline, health pipeline, agentic execution flow, model allocation table, phase schemas.

### 2026-03-19 - Scripts And Documentation Translated To English

- All shell scripts and batch files translated from Russian to English.
- README.md translated to English.
- All agent/architecture documentation files translated to English.
- `docs/README.ru.md` removed (superseded by the root `README.md`).
- Scripts reorganised into `scripts/windows/` and `scripts/linux/` directories.

## Open Questions

- Should `agentic` degrade gracefully (503 instead of crash) when `OPENAI_API_KEY` is absent?
- Are task queuing, status storage and persistence needed for agent workflows?
- Should the LM Studio structuring system prompt be externalised to env/config?
- Is a centralised HTTP request/response logger needed for production debugging?

## Previous Updates

### 2026-03-18 - Architecture Documentation Audit

- Project structure and agent documentation audit performed.
- Root `structure.md` added as the normative project tree contract.
- `agents.md` expanded into a working document with roles and handoff protocol.
- `docs/agents/context.md` and `docs/agents/adr.md` added for autonomous operation and decision recording.
- `docs/agents/project-overview.md`, `docs/agents/architecture.md`, `docs/agents/file-map.md`, `docs/agents/runbook.md` updated.
- Confirmed that build artifacts are present in the workspace but are not the source of truth.

## Update Rule

- Update this file after significant architectural changes.
- Do not record minor cosmetic edits here.
