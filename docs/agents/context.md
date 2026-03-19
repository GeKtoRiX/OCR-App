# Current Context

## Snapshot Date

- `2026-03-19`

## System Status

- Backend, frontend and PaddleOCR sidecar are structurally separated correctly.
- App runs as a direct Node.js process; PaddleOCR is expected as an external host-side service.
- `agentic` bounded context exists as a separate isolated module inside the backend.
- Public endpoints for architecture and deploy are implemented and documented.
- Frontend includes `useHealthStatus.ts` (service health polling) and `StatusLight.tsx` (visual indicator).
- All documentation (CLAUDE.md, agents.md, structure.md, docs/agents/*) has been reviewed and aligned with the actual code.

## Confirmed Facts

- Root `README.md` is present and serves as the user-facing entry point.
- `structure.md` is the normative contract for the repository tree.
- `agents.md` contains explicit role descriptions, working rules and handoff protocol.
- Build artifacts are present in the workspace: `backend/dist`, `frontend/dist`, `frontend/tsconfig.tsbuildinfo`.
- Health endpoint `/api/health` returns: `{ paddleOcrReachable, paddleOcrModels, paddleOcrDevice, lmStudioReachable, lmStudioModels }`.
- Agentic endpoints (`/api/agents/architecture`, `/api/agents/deploy`) require `OPENAI_API_KEY` and are not required for the base OCR scenario.

## Current Risks

- Local-first strategy for the `agentic` runtime is incomplete: the service crashes rather than degrading gracefully when the OpenAI key is absent.
- Build artifacts alongside sources increase the risk of accidentally editing generated files.
- Host-side PaddleOCR availability is an explicit runtime prerequisite.
- Hardcoded structuring prompt in `LMStudioStructuringService` — not versioned or externalised.
- Backend runs silently (`> /dev/null`); no log output is captured for post-mortem debugging.

## Recommended Next Actions

- Do not manually edit `dist` artifacts.
- When changing REST contracts, update DTOs, schemas and docs simultaneously.
- If `agentic` is extended — add graceful degradation when `OPENAI_API_KEY` is absent (return 503 with a clear message instead of crashing).
- If persistence for agent workflows is needed — add a dedicated storage layer inside `agentic/`.
