# OCR Web App — Claude Code Guide

## Project Overview

Full-stack monorepo OCR web application. Accepts image uploads, extracts raw text via a local PaddleOCR sidecar, then structures that text into Markdown via LM Studio. Also contains an `agentic` bounded context that provides multi-phase autonomous architecture planning and deployment workflows via the OpenAI Agents SDK.

## Companion Docs

- `agents.md` — agent roles, handoff protocol, working rules. Read before making architectural changes.
- `structure.md` — normative repo structure contract. Update together with code when the tree changes.

## Tech Stack

- **Backend:** NestJS 10 (TypeScript, CommonJS)
- **Frontend:** React 18 + Vite 6 (TypeScript, ESM)
- **OCR Engine:** PaddleOCR sidecar service (Python FastAPI, ROCm GPU support)
- **LLM:** LM Studio (local, OpenAI-compatible API — text structuring only)
- **Agentic:** OpenAI Agents SDK (`@openai/agents`) — architecture planning & deployment
- **Testing:** Jest (backend), Vitest + Testing Library (frontend)
- **Deployment:** Direct Node.js process (`npm run build` + `node backend/dist/main.js`)

## Architecture

### Backend — Clean/Hexagonal Architecture

```
backend/src/
├── domain/           # Entities + Ports (no dependencies)
│   ├── entities/     # ImageData, OCRResult
│   ├── ports/        # IOCRService, ITextStructuringService, IHealthCheckPort (abstract classes)
│   └── constants.ts  # NO_TEXT_DETECTED fallback constant
├── application/      # Use cases + DTOs (depends on domain only)
│   ├── dto/          # ProcessImageInput/Output, HealthCheckOutput
│   └── use-cases/    # ProcessImageUseCase, HealthCheckUseCase
├── infrastructure/   # External integrations (implements ports)
│   ├── config/       # LMStudioConfig, PaddleOCRConfig (env vars)
│   ├── lm-studio/    # LMStudioClient, LMStudioOCRService (fallback), LMStudioStructuringService
│   └── paddleocr/    # PaddleOCRService (primary OCR), PaddleOCRHealthService
├── presentation/     # NestJS layer (controllers, modules, DTOs)
│   ├── controllers/  # OcrController (POST /api/ocr), HealthController (GET /api/health)
│   ├── dto/          # OcrResponseDto, HealthResponseDto
│   ├── modules/      # OcrModule, HealthModule
│   └── app.module.ts # Root module (imports OcrModule, HealthModule, AgentEcosystemModule; serves frontend)
├── agentic/          # Autonomous agent bounded context (isolated from OCR layers)
│   ├── core/         # Zod schemas, runtime types, env-driven model/tracing config
│   ├── agents/       # Agent factory: Analyze/Scaffold/Initialization/Deployment coordinators
│   ├── guardrails/   # Phase-level and deployment output validation guardrails
│   ├── tools/        # architecture-tools, deployment-tools (SDK function tools)
│   ├── application/  # AgentEcosystemService — phase orchestration via withTrace
│   └── presentation/ # AgentEcosystemController, DTOs, AgentEcosystemModule
└── main.ts           # Bootstrap (port 3000)
```

**DI Pattern:** Abstract class ports as injection tokens → concrete infrastructure implementations bound via NestJS providers.

**Dependency rule:** `domain` ← `application` ← `infrastructure`/`presentation`. `agentic` is isolated and does not import from OCR layers.

### PaddleOCR Sidecar Service Architecture

```
┌─────────────────┐    HTTP    ┌──────────────────┐    HTTP    ┌─────────────────────┐
│   Frontend      │◄──────────►│  Backend (NestJS) │◄──────────►│  PaddleOCR Sidecar  │
│   React App     │            │  port 3000        │            │  Python FastAPI     │
└─────────────────┘            └──────────────────┘            │  port 8000          │
                                        │                       └─────────────────────┘
                                        │ HTTP
                                   ┌────▼─────┐
                                   │ LM Studio │
                                   │ port 1234 │
                                   └──────────┘
```

**Sidecar Endpoints:**

- `GET /health` — Health check (returns `{ status, model_loaded, device }`)
- `POST /api/extract/base64` — Extract text from base64-encoded image
- `GET /models` — List loaded OCR models

### OCR Pipeline

1. Frontend uploads image → `POST /api/ocr` (multipart)
2. `OcrController` validates MIME type and size, creates `ImageData` entity
3. `ProcessImageUseCase` calls `IOCRService` → `PaddleOCRService` → sidecar `/api/extract/base64`
4. PaddleOCR returns raw text; empty result triggers `NO_TEXT_DETECTED` fallback
5. `ITextStructuringService` → `LMStudioStructuringService` sends raw text to LM Studio
6. LM Studio returns structured Markdown; controller responds `{ rawText, markdown, filename }`

### Frontend — MVVM Pattern

```
frontend/src/
├── model/            # API layer + types
│   ├── api.ts        # processImage(), checkHealth() — fetch wrappers
│   ├── types.ts      # OcrResponse, HealthResponse, ApiError
│   └── clipboard.ts  # copyToClipboard() utility
├── viewmodel/        # React hooks (state + logic)
│   ├── useOCR.ts          # Status machine: idle → loading → success/error; AbortController
│   ├── useImageUpload.ts  # File validation, preview, drag & drop, clipboard paste
│   └── useHealthStatus.ts # Polls /api/health every 30s; computes status light color
├── view/             # React components (UI only, no business logic)
│   ├── DropZone.tsx     # Drag-drop file input with preview
│   ├── ResultPanel.tsx  # Tabs (Markdown/Raw) + copy-to-clipboard
│   ├── StatusBar.tsx    # Loading spinner, success/error messages
│   └── StatusLight.tsx  # Color-coded service health indicator (gpu/cpu/degraded)
├── App.tsx           # Root component — composes hooks and views
├── main.tsx          # React DOM entry
└── styles.css        # Dark theme CSS
```

## API Endpoints

### OCR

| Method | Path          | Description                    | Body                                | Response                                                        |
| ------ | ------------- | ------------------------------ | ----------------------------------- | --------------------------------------------------------------- |
| POST   | `/api/ocr`    | Process image → OCR + Markdown | `multipart/form-data` field `image` | `{ rawText, markdown, filename }`                               |
| GET    | `/api/health` | Backend + sidecar health check | —                                   | `{ paddleOcrReachable, paddleOcrModels, paddleOcrDevice, lmStudioReachable, lmStudioModels }` |

**Validation:** PNG/JPEG/WebP/BMP/TIFF only, max 10 MB. Unsupported MIME → 400. Service failure → 502.

### PaddleOCR Sidecar

| Method | Path                  | Description                          |
| ------ | --------------------- | ------------------------------------ |
| GET    | `/health`             | Health check                         |
| POST   | `/api/extract/base64` | Extract text from base64-encoded img |
| GET    | `/models`             | List loaded OCR models               |

### Agentic

| Method | Path                      | Description                                   | Body                                             |
| ------ | ------------------------- | --------------------------------------------- | ------------------------------------------------ |
| POST   | `/api/agents/architecture` | Run 3-phase planning (analyze/scaffold/init) | `{ request: string }`                            |
| POST   | `/api/agents/deploy`      | Plan + materialize agent ecosystem on disk    | `{ request: string, workspaceName?: string }`    |

Agentic endpoints require `OPENAI_API_KEY` and `@openai/agents` runtime. They are isolated from the OCR path and must not affect it.

## Key Paths & Aliases

Backend tsconfig path aliases (also mirrored in `jest.config.js`):

- `@domain/*` → `src/domain/*`
- `@application/*` → `src/application/*`
- `@infrastructure/*` → `src/infrastructure/*`
- `@presentation/*` → `src/presentation/*`

## Commands

```bash
# Development
npm run dev:backend          # NestJS watch mode (port 3000)
npm run dev:frontend         # Vite dev server (port 5173, proxies /api → :3000)
npm run dev:paddleocr        # Start PaddleOCR sidecar locally
npm run smoke:paddleocr      # Smoke test sidecar startup

# Build
npm run build                # Build frontend then backend
npm run start:prod           # Run production build

# Testing
npm test --workspace=backend               # Jest (backend unit + integration)
npm run test:e2e --workspace=backend       # E2E (full NestJS app with mocked providers)
npm run test:cov --workspace=backend       # Jest with coverage
npm test --workspace=frontend              # Vitest (frontend unit)
```

## Environment Variables

### OCR Runtime

| Variable             | Default                    | Description                              |
| -------------------- | -------------------------- | ---------------------------------------- |
| `PORT`               | `3000`                     | Backend server port                      |
| `LM_STUDIO_BASE_URL` | `http://localhost:1234/v1` | LM Studio API base URL                   |
| `STRUCTURING_MODEL`  | `qwen/qwen3.5-9b`          | Text structuring model (Markdown output) |
| `LM_STUDIO_TIMEOUT`  | `120000`                   | LM Studio request timeout (ms)           |
| `PADDLEOCR_HOST`     | `localhost`                | PaddleOCR sidecar host                   |
| `PADDLEOCR_PORT`     | `8000`                     | PaddleOCR sidecar port                   |
| `PADDLEOCR_TIMEOUT`  | `30000`                    | PaddleOCR request timeout (ms)           |

### Agentic Runtime (optional — only needed for `/api/agents/*`)

| Variable                          | Default                        | Description                            |
| --------------------------------- | ------------------------------ | -------------------------------------- |
| `OPENAI_API_KEY`                  | —                              | Required for OpenAI Agents SDK         |
| `OPENAI_AGENT_SUPERVISOR_MODEL`   | `gpt-5`                        | Model for supervisor/coordinator roles |
| `OPENAI_AGENT_PLANNER_MODEL`      | `gpt-5`                        | Model for planner roles                |
| `OPENAI_AGENT_SCAFFOLD_MODEL`     | `gpt-5-mini`                   | Model for scaffold/deploy specialists  |
| `OPENAI_AGENT_MAPPER_MODEL`       | `gpt-5-nano`                   | Model for dependency mapper            |
| `AGENT_TRACE_WORKFLOW_NAME`       | `autonomous-agent-ecosystem`   | Tracing workflow name                  |
| `AGENT_DEPLOY_ROOT`               | `generated-agent-ecosystems`   | Output directory for generated bundles |

## Testing Conventions

- Test files: `*.spec.ts` / `*.spec.tsx` — colocated alongside source files
- Backend: mocks via `jest.fn()`, e2e uses `@nestjs/testing` with `overrideProvider`
- Frontend: mocks via `vi.mock()`, component tests with `@testing-library/react`
- E2E test (`app.e2e.spec.ts`): bootstraps full NestJS app with mocked providers, tests real HTTP
- Integration test (`integration.spec.ts`): backend-level integration scenarios

## Important Patterns

- **Dependency Inversion:** Domain ports are abstract classes used as NestJS provider tokens. Never import infrastructure from domain/application layers.
- **Error handling:** `ProcessImageUseCase` returns fallback `NO_TEXT_DETECTED` when OCR returns empty. `OcrController` wraps processing errors as HTTP 502.
- **Static serving:** Backend serves built frontend via `@nestjs/serve-static` from `frontend/dist/`.
- **Sidecar Pattern:** PaddleOCR runs as a separate host-side service, communicating via HTTP API.
- **Text Structuring:** LM Studio is used only after OCR to convert raw text into Markdown.
- **Agentic Isolation:** `agentic` bounded context must not break local OCR runtime. It fails gracefully if OpenAI key is absent.
- **Schema-driven Handoffs:** Agentic phase payloads are validated by Zod schemas and output guardrails. Change schema + docs together.

## PaddleOCR Sidecar

```bash
# Start sidecar locally (requires Python + dependencies)
cd paddleocr-service
python -m uvicorn main:app --host 0.0.0.0 --port 8000

# Access services:
# - Backend API: http://localhost:3000/api/ocr
# - PaddleOCR Sidecar: http://localhost:8000/health
```
