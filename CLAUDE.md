# OCR Web App — Claude Code Guide

## Project Overview

Full-stack monorepo OCR web application. Accepts image uploads, extracts raw text via a local PaddleOCR sidecar, then structures that text into Markdown via LM Studio. Users can save OCR results as documents, build a vocabulary list with spaced repetition (SM-2), and practice vocabulary through interactive exercises. Also contains an `agentic` bounded context that provides multi-phase autonomous architecture planning and deployment workflows via the OpenAI Agents SDK.

## Companion Docs

- `agents.md` — agent roles, handoff protocol, working rules. Read before making architectural changes.
- `structure.md` — normative repo structure contract. Update together with code when the tree changes.

## Tech Stack

- **Backend:** NestJS 10 (TypeScript, CommonJS)
- **Frontend:** React 18 + Vite 6 (TypeScript, ESM)
- **OCR Engine:** PaddleOCR sidecar service (Python FastAPI, ROCm GPU support, port 8000)
- **TTS Engines:** `services/tts/` — Supertone + Piper (shared sidecar, port 8100), Kokoro (port 8200), F5 TTS (port 8300); Python FastAPI, GPU support
- **LLM:** LM Studio (local, OpenAI-compatible API — text structuring + vocabulary exercise generation)
- **Persistence:** SQLite via `better-sqlite3` — saved documents, vocabulary words (SRS), practice sessions
- **Agentic:** OpenAI Agents SDK (`@openai/agents`) — architecture planning & deployment
- **Testing:** Jest (backend), Vitest + Testing Library (frontend)
- **Deployment:** Direct Node.js process (`npm run build` + `node backend/dist/main.js`)

## Architecture

### Backend — Clean/Hexagonal Architecture

```
backend/src/
├── domain/           # Entities + Ports (no dependencies)
│   ├── entities/     # ImageData, OCRResult, SavedDocument, VocabularyWord,
│   │                 # PracticeSession, ExerciseAttempt
│   ├── ports/        # 11 abstract class ports (see port table below)
│   └── constants.ts  # NO_TEXT_DETECTED fallback constant
├── application/      # Use cases + DTOs (depends on domain only)
│   ├── dto/          # ProcessImageInput/Output, HealthCheckOutput,
│   │                 # SynthesizeSpeechInput/Output, SavedDocumentOutput,
│   │                 # VocabularyOutput, PracticeDTO types
│   ├── use-cases/    # ProcessImageUseCase, HealthCheckUseCase,
│   │                 # SynthesizeSpeechUseCase, SavedDocumentUseCase,
│   │                 # VocabularyUseCase, PracticeUseCase
│   └── utils/        # sm2.ts (SM-2 spaced repetition algorithm)
├── infrastructure/   # External integrations (implements ports)
│   ├── config/       # LMStudioConfig, PaddleOCRConfig, SupertoneConfig,
│   │                 # KokoroConfig, F5TtsConfig, SqliteConfig (env vars)
│   ├── lm-studio/    # LMStudioClient (ILmStudioHealthPort),
│   │                 # LMStudioOCRService (fallback), LMStudioStructuringService,
│   │                 # LMStudioVocabularyService (IVocabularyLlmService)
│   ├── paddleocr/    # PaddleOCRService (primary IOCRService),
│   │                 # PaddleOCRHealthService (IPaddleOcrHealthPort)
│   ├── supertone/    # SupertoneService (ISupertonePort)
│   ├── kokoro/       # KokoroService (IKokoroPort)
│   ├── f5/           # F5TtsService (IF5TtsPort)
│   └── sqlite/       # SqliteConnectionProvider, SqliteSavedDocumentRepository,
│                     # SqliteVocabularyRepository, SqlitePracticeSessionRepository
├── presentation/     # NestJS layer (controllers, modules, DTOs)
│   ├── controllers/  # OcrController, HealthController, TtsController,
│   │                 # DocumentController, VocabularyController, PracticeController
│   ├── dto/          # OcrResponseDto, HealthResponseDto, DocumentDto,
│   │                 # VocabularyDto, PracticeDto
│   ├── modules/      # DatabaseModule, OcrModule, HealthModule, TtsModule,
│   │                 # DocumentModule, VocabularyModule
│   └── app.module.ts # Root module
├── agentic/          # Autonomous agent bounded context (isolated from OCR layers)
│   ├── core/         # Zod schemas, runtime types, env-driven model/tracing config
│   ├── agents/       # Agent factory: Analyze/Scaffold/Initialization/Deployment coordinators
│   ├── guardrails/   # Phase-level and deployment output validation guardrails
│   ├── tools/        # architecture-tools, deployment-tools (SDK function tools)
│   ├── application/  # AgentEcosystemService — phase orchestration via withTrace
│   └── presentation/ # AgentEcosystemController, DTOs, AgentEcosystemModule
└── main.ts           # Bootstrap (port 3000)
```

**DI Pattern:** Abstract class ports as NestJS injection tokens → concrete infrastructure implementations bound via `useExisting` in the appropriate module. Controllers inject only use cases — never infrastructure services directly.

**Dependency rule:** `domain` ← `application` ← `infrastructure`/`presentation`. `agentic` is isolated and does not import from OCR layers.

### Domain Ports

| Port | Methods | Bound in |
|------|---------|----------|
| `IOCRService` | `extractText(image)` | OcrModule |
| `ITextStructuringService` | `structure(text)` | OcrModule |
| `IPaddleOcrHealthPort` | `isReachable()`, `listModels()`, `getDevice()` | OcrModule |
| `ILmStudioHealthPort` | `isReachable()`, `listModels()` | OcrModule |
| `ISupertonePort` | `synthesize(input)`, `checkHealth()` | TtsModule |
| `IKokoroPort` | `synthesize(input)`, `checkHealth()` | TtsModule |
| `IF5TtsPort` | `synthesize(input)`, `getHealth()` | TtsModule |
| `ISavedDocumentRepository` | `create`, `findAll`, `findById`, `update`, `delete` | DocumentModule |
| `IVocabularyRepository` | `create`, `findAll`, `findByWord`, `findDueForReview`, `updateSrs`, `update`, `delete` | VocabularyModule |
| `IPracticeSessionRepository` | sessions + attempts CRUD | VocabularyModule |
| `IVocabularyLlmService` | `generateExercises`, `analyzeSession` | VocabularyModule |

### NestJS Module Map

```
AppModule
├── DatabaseModule          # SqliteConfig + SqliteConnectionProvider (singleton)
├── LmStudioModule          # LMStudioConfig + LMStudioClient + ILmStudioHealthPort (shared)
├── OcrModule               # imports LmStudioModule; provides/exports IPaddleOcrHealthPort,
│                           #   IOCRService, ITextStructuringService
├── HealthModule            # imports OcrModule + TtsModule + LmStudioModule for port tokens
├── TtsModule               # provides/exports ISupertonePort, IKokoroPort, IF5TtsPort;
│                           #   provides SynthesizeSpeechUseCase
├── DocumentModule          # imports DatabaseModule; provides ISavedDocumentRepository,
│                           #   SavedDocumentUseCase
├── VocabularyModule        # imports DatabaseModule + LmStudioModule; provides IVocabularyRepository,
│                           #   IPracticeSessionRepository, IVocabularyLlmService,
│                           #   VocabularyUseCase, PracticeUseCase
└── AgentEcosystemModule    # agentic bounded context (optional; without API key the endpoints return 5xx)
```

### Sidecar Architecture

```
┌─────────────────┐    HTTP    ┌──────────────────┐    HTTP    ┌─────────────────────┐
│   Frontend      │◄──────────►│  Backend (NestJS) │◄──────────►│  PaddleOCR Sidecar  │
│   React App     │            │  port 3000        │            │  Python FastAPI     │
└─────────────────┘            └──────────────────┘            │  port 8000          │
                                   │   │   │   │               └─────────────────────┘
                              HTTP │   │   │   │               ┌─────────────────────┐
                                   │   │   │   └──────────────►│  Supertone Sidecar  │
                                   │   │   │                   │  port 8100          │
                                   │   │   │                   └─────────────────────┘
                                   │   │   │                   ┌─────────────────────┐
                                   │   │   └──────────────────►│  Kokoro Sidecar     │
                                   │   │                       │  port 8200          │
                                   │   │                       └─────────────────────┘
                                   │   │                       ┌─────────────────────┐
                                   │   └──────────────────────►│  F5 TTS Sidecar     │
                                   │                           │  port 8300          │
                              ┌────▼─────┐                     └─────────────────────┘
                              │ LM Studio │
                              │ port 1234 │
                              └──────────┘
```

**PaddleOCR Sidecar Endpoints:**

- `GET /health` — Health check (returns `{ status, model_loaded, device }`)
- `POST /api/extract/base64` — Extract text from base64-encoded image
- `GET /models` — List loaded OCR models

### Pipelines

#### OCR Pipeline

1. Frontend uploads image → `POST /api/ocr` (multipart)
2. `OcrController` validates MIME type and size, creates `ImageData` entity
3. `ProcessImageUseCase` calls `IOCRService` → `PaddleOCRService` → sidecar `/api/extract/base64`
4. PaddleOCR returns raw text; empty result triggers `NO_TEXT_DETECTED` fallback
5. `ITextStructuringService` → `LMStudioStructuringService` sends raw text to LM Studio
6. LM Studio returns structured Markdown; controller responds `{ rawText, markdown, filename }`

#### TTS Pipeline

1. Frontend sends `POST /api/tts` with `{ text, engine?, voice?, lang?, speed?, ... }`
2. `TtsController` validates text (non-empty, ≤ 5000 chars), passes to `SynthesizeSpeechUseCase`
3. `SynthesizeSpeechUseCase` routes by `engine`: `supertone`/`piper` → `ISupertonePort`, `kokoro` → `IKokoroPort`, `f5` → `IF5TtsPort` (default: supertone)
4. Sidecar returns `Buffer`; controller responds with `audio/wav`

#### Health Pipeline

1. `GET /api/health` → `HealthController` → `HealthCheckUseCase`
2. Use case calls all 5 health ports concurrently, aggregates into `HealthCheckOutput`
3. Returns `{ paddleOcrReachable, paddleOcrModels, paddleOcrDevice, lmStudioReachable, lmStudioModels, superToneReachable, kokoroReachable, f5TtsReachable, f5TtsDevice }`

#### Document Pipeline

1. OCR result → `POST /api/documents` → `DocumentController` → `SavedDocumentUseCase`
2. `ISavedDocumentRepository` → `SqliteSavedDocumentRepository` → SQLite (WAL mode)
3. CRUD at `/api/documents/:id`

#### Vocabulary + Practice Pipeline

1. Text selection → `POST /api/vocabulary` → `VocabularyUseCase` → `IVocabularyRepository`
2. `GET /api/vocabulary/review/due` returns words due for review (SM-2 `nextReviewAt` index)
3. `POST /api/practice/start` → `PracticeUseCase` picks due words, calls `IVocabularyLlmService.generateExercises`
4. `POST /api/practice/answer` → SM-2 update on `IVocabularyRepository.updateSrs`
5. `POST /api/practice/complete` → `IVocabularyLlmService.analyzeSession` → `IPracticeSessionRepository`

### Frontend — MVVM Pattern

```
frontend/src/
├── model/            # API layer + types
│   ├── api.ts        # processImage(), checkHealth(), generateSpeech(),
│   │                 # document/vocabulary/practice fetch wrappers
│   ├── types.ts      # OcrResponse, HealthResponse (9 health fields), TtsSettings
│   │                 # (4 engine variants), SavedDocument, VocabularyWord, Exercise,
│   │                 # AnswerResult, SessionAnalysis, HistoryEntry, LanguagePair
│   └── clipboard.ts  # copyToClipboard() utility
├── viewmodel/        # React hooks (state + logic)
│   ├── useOCR.ts           # State machine: idle → loading → success/error; AbortController
│   ├── useImageUpload.ts   # File validation, preview, drag & drop, clipboard paste
│   ├── useHealthStatus.ts  # Polls /api/health every 30s; 4-color lamp (🔵🟢🟡🔴)
│   ├── useSessionHistory.ts # In-session OCR result history (HistoryEntry list)
│   ├── useTts.ts           # TTS state and audio generation for 4 engines
│   ├── useResultPanel.ts   # Result-panel orchestration (copy/edit/tabs/TTS/vocab menu)
│   ├── useSavedDocuments.ts # CRUD state for saved documents
│   ├── useVocabulary.ts    # Vocabulary word list + language pair + due count
│   └── usePractice.ts      # Practice session state machine (idle → practicing → reviewing → complete)
├── view/             # React components (UI only, no business logic)
│   ├── DropZone.tsx        # Drag-drop file input with preview
│   ├── ResultPanel.tsx     # Rendering for tabs/edit/save/TTS panel; delegates orchestration to useResultPanel
│   ├── StatusBar.tsx       # Loading spinner, success/error messages
│   ├── StatusLight.tsx     # Color-coded service health indicator (blue/green/yellow/red)
│   ├── HistoryPanel.tsx    # 3-tab panel (Session, Saved, Vocab) with practice launch
│   ├── VocabularyPanel.tsx # Vocabulary word list with language pair selector
│   ├── VocabContextMenu.tsx # Context menu for vocab type selection from text
│   ├── VocabAddForm.tsx    # Form for entering translation after type selection
│   └── PracticeView.tsx    # Modal for exercises, feedback, and session analysis
├── styles/           # base.css (CSS variables, dark theme), layout.css (app shell, panels)
├── App.tsx           # Root component — composes hooks and views
└── main.tsx          # React DOM entry
```

## API Endpoints

### OCR

| Method | Path | Description | Body | Response |
|--------|------|-------------|------|----------|
| POST | `/api/ocr` | Process image → OCR + Markdown | `multipart/form-data` field `image` | `{ rawText, markdown, filename }` |
| GET | `/api/health` | Backend + sidecar health check | — | `{ paddleOcrReachable, paddleOcrModels, paddleOcrDevice, lmStudioReachable, lmStudioModels, superToneReachable, kokoroReachable, f5TtsReachable, f5TtsDevice }` |
| POST | `/api/tts` | Synthesize text → WAV audio | JSON for `supertone`/`piper`/`kokoro`, multipart for `f5` (`text`, `refText`, `refAudio`, `removeSilence`) | `audio/wav` binary |

**Validation:** PNG/JPEG/WebP/BMP/TIFF only, max 10 MB. Unsupported MIME → 400. Service failure → 502. TTS text empty or > 5000 chars → 400.

**TTS engines:** `supertone` (default) — voice M1–M5/F1–F5, lang en/ko/es/pt/fr; `piper` — curated downloadable voices via the same sidecar; `kokoro` — voices such as `af_heart`, `af_bella`, `am_fenrir`, `bm_fable`; `f5` — upload reference audio + transcript.

### Documents

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/documents` | Save OCR result as document |
| GET | `/api/documents` | List all saved documents |
| GET | `/api/documents/:id` | Get document by ID |
| PUT | `/api/documents/:id` | Update document markdown |
| DELETE | `/api/documents/:id` | Delete document |

### Vocabulary

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/vocabulary` | Add vocabulary word |
| GET | `/api/vocabulary` | List words (filter: `?targetLang=en&nativeLang=ru`) |
| GET | `/api/vocabulary/review/due` | Words due for review (`?limit=20`) |
| PUT | `/api/vocabulary/:id` | Update translation/context |
| DELETE | `/api/vocabulary/:id` | Delete word |

### Practice

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/practice/start` | Start practice session |
| POST | `/api/practice/answer` | Submit exercise answer |
| POST | `/api/practice/complete` | Complete session + get LLM analysis |
| GET | `/api/practice/sessions` | Recent sessions |
| GET | `/api/practice/stats/:vocabularyId` | Attempt history for a word |

### PaddleOCR Sidecar

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/extract/base64` | Extract text from base64-encoded img |
| GET | `/models` | List loaded OCR models |

### Agentic

| Method | Path | Description | Body |
|--------|------|-------------|------|
| POST | `/api/agents/architecture` | Run 3-phase planning (analyze/scaffold/init) | `{ request: string }` |
| POST | `/api/agents/deploy` | Plan + materialize agent ecosystem on disk | `{ request: string, workspaceName?: string }` |

Agentic endpoints require `OPENAI_API_KEY` and `@openai/agents` runtime. Without the key, these endpoints currently return a server error but do not break the OCR/TTS runtime.

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
npm run dev:paddleocr        # Start PaddleOCR sidecar locally (port 8000)
npm run smoke:paddleocr      # Smoke test sidecar startup
npm run dev:supertone        # Start Supertone + Piper sidecar locally (port 8100)
npm run smoke:supertone      # Smoke test Supertone + Piper sidecar (must be running)
npm run dev:kokoro           # Start Kokoro TTS sidecar locally (port 8200)
npm run smoke:kokoro         # Smoke test Kokoro sidecar
npm run dev:f5               # Start F5 TTS sidecar locally (port 8300)
npm run smoke:f5             # Smoke test F5 sidecar
npm run smoke:lmstudio       # Backend LM Studio structuring smoke
npm run smoke:all            # All sidecar smokes

# Dedicated launchers
bash scripts/linux/ocr.sh         # start OCR mode, Ctrl+C to stop all project services
bash scripts/linux/tts.sh         # start TTS mode
bash scripts/linux/ocr-tts.sh     # start full stack
bash scripts/linux/stack.sh       # interactive stack menu
bash scripts/linux/ocr-tts.sh stop    # stop all services
bash scripts/linux/ocr-tts.sh status  # show lamp + health
bash scripts/linux/ocr-tts.sh wipe    # stop + remove build artifacts

# Build
npm run build                # Build frontend then backend
npm run start:prod           # Run production build

# Testing
npm test --workspace=backend               # Jest (backend unit + integration)
npm run test:cov --workspace=backend       # Jest with coverage
npm test --workspace=frontend              # Vitest (frontend unit)
npm run test:cov --workspace=frontend      # Frontend coverage
npm run test:cov                           # Both frontend + backend coverage
npm run test:e2e:api                       # Backend API e2e
npm run test:e2e:integration               # Backend integration tests against live deps
npm run test:e2e:browser                   # Playwright browser e2e on production-like stack

# Performance
npm run perf:api                           # API latency benchmark
npm run perf:browser                       # Browser workflow benchmark
npm run perf:phase4                        # Full Phase 4 benchmark harness
```

`test:e2e:browser` and `perf:phase4` rebuild the app, use `tmp/test-db/browser-e2e.sqlite`, and set `LM_STUDIO_SMOKE_ONLY=true` so those harnesses do not make real LM Studio content-generation calls.

## Environment Variables

### OCR Runtime

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Backend server port |
| `LM_STUDIO_BASE_URL` | `http://localhost:1234/v1` | LM Studio API base URL |
| `STRUCTURING_MODEL` | `qwen/qwen3.5-9b` | Text structuring model (Markdown output) |
| `VOCABULARY_MODEL` | falls back to `STRUCTURING_MODEL` | Model for vocabulary exercises and session analysis |
| `LM_STUDIO_TIMEOUT` | `120000` | LM Studio request timeout (ms) |
| `PADDLEOCR_HOST` | `localhost` | PaddleOCR sidecar host |
| `PADDLEOCR_PORT` | `8000` | PaddleOCR sidecar port |
| `PADDLEOCR_TIMEOUT` | `30000` | PaddleOCR request timeout (ms) |

### Supertone TTS

| Variable | Default | Description |
|----------|---------|-------------|
| `SUPERTONE_HOST` | `localhost` | Supertone TTS sidecar host |
| `SUPERTONE_PORT` | `8100` | Supertone TTS sidecar port |
| `SUPERTONE_TIMEOUT` | `120000` | Supertone request timeout (ms) |
| `SUPERTONE_MODEL` | `supertonic-2` | supertonic model name (auto-downloaded) |

### Kokoro TTS

| Variable | Default | Description |
|----------|---------|-------------|
| `KOKORO_HOST` | `localhost` | Kokoro TTS sidecar host |
| `KOKORO_PORT` | `8200` | Kokoro TTS sidecar port |
| `KOKORO_TIMEOUT` | `120000` | Kokoro request timeout (ms) |
| `KOKORO_ONNX_MODEL_PATH` | `services/tts/kokoro-service/models/kokoro-v1.0.onnx` | Local ONNX model path |
| `KOKORO_ONNX_VOICES_PATH` | `services/tts/kokoro-service/models/voices-v1.0.bin` | Local ONNX voices blob path |
| `KOKORO_ONNX_MODEL_URL` | upstream release URL | Download source for `kokoro-v1.0.onnx` if missing |
| `KOKORO_ONNX_VOICES_URL` | upstream release URL | Download source for `voices-v1.0.bin` if missing |

### F5 TTS

| Variable | Default | Description |
|----------|---------|-------------|
| `F5_TTS_HOST` | `localhost` | F5 TTS sidecar host |
| `F5_TTS_PORT` | `8300` | F5 TTS sidecar port |
| `F5_TTS_TIMEOUT` | `180000` | F5 TTS request timeout (ms) |

### SQLite

| Variable | Default | Description |
|----------|---------|-------------|
| `SQLITE_DB_PATH` | `./data/ocr-app.db` | SQLite database file path |

### Agentic Runtime (optional — only needed for `/api/agents/*`)

| Variable | Default | Description |
|----------|---------|-------------|
| `OPENAI_API_KEY` | — | Required for OpenAI Agents SDK |
| `OPENAI_AGENT_SUPERVISOR_MODEL` | `gpt-5` | Model for supervisor/coordinator roles |
| `OPENAI_AGENT_PLANNER_MODEL` | `gpt-5` | Model for planner roles |
| `OPENAI_AGENT_SCAFFOLD_MODEL` | `gpt-5-mini` | Model for scaffold/deploy specialists |
| `OPENAI_AGENT_MAPPER_MODEL` | `gpt-5-nano` | Model for dependency mapper |
| `AGENT_TRACE_WORKFLOW_NAME` | `autonomous-agent-ecosystem` | Tracing workflow name |
| `AGENT_DEPLOY_ROOT` | `generated-agent-ecosystems` | Output directory for generated bundles |

## Testing Conventions

- Test files: `*.spec.ts` / `*.spec.tsx` — colocated alongside source files
- Backend: mocks via `jest.fn()`, e2e uses `@nestjs/testing` with `overrideProvider`
- Frontend: mocks via `vi.mock()`, component tests with `@testing-library/react`
- E2E test (`app.e2e.spec.ts`): bootstraps full NestJS app with mocked providers, tests real HTTP
- Integration test (`integration.spec.ts`): backend-level integration scenarios (requires live sidecars; skips gracefully)

## Important Patterns

- **Dependency Inversion:** Domain ports are abstract classes used as NestJS provider tokens. Never import infrastructure from domain/application layers. Controllers inject only use cases — never infrastructure services or repositories directly.
- **Port binding:** Each module binds concrete services to ports via `useExisting` and exports the port token. Cross-module consumers import the module and inject the port token.
- **Error handling:** `ProcessImageUseCase` returns fallback `NO_TEXT_DETECTED` when OCR returns empty. `OcrController` wraps processing errors as HTTP 502.
- **Static serving:** Backend serves built frontend via `@nestjs/serve-static` from `frontend/dist/`.
- **Sidecar Pattern:** All Python sidecars live under `services/` and communicate with the NestJS backend via HTTP API.
- **Text Structuring:** LM Studio is used (1) after OCR to convert raw text into Markdown, and (2) to generate vocabulary exercises and analyze practice sessions.
- **LmStudioModule singleton:** `LMStudioConfig`, `LMStudioClient`, and `ILmStudioHealthPort` are owned by `LmStudioModule`; `OcrModule`, `VocabularyModule`, and `HealthModule` import it. Never provide these outside `LmStudioModule`.
- **DatabaseModule singleton:** `SqliteConnectionProvider` is owned by `DatabaseModule`; `DocumentModule` and `VocabularyModule` import it. Never provide `SqliteConnectionProvider` outside `DatabaseModule`.
- **SM-2 Algorithm:** `application/utils/sm2.ts` implements `calculateSm2`, `computeErrorPosition`, `computeQualityRating`. Used by `PracticeUseCase` on answer submission.
- **Agentic Isolation:** `agentic` bounded context must not break local OCR runtime. Without `OPENAI_API_KEY`, `/api/agents/*` currently returns 5xx while the rest of the app stays available.
- **Schema-driven Handoffs:** Agentic phase payloads are validated by Zod schemas and output guardrails. Change schema + docs together.

## Supertone TTS Sidecar

```bash
# Start sidecar locally (requires Python + supertonic + onnxruntime-rocm)
cd services/tts/supertone-service
source .venv/bin/activate
SUPERTONE_USE_GPU=true python -m uvicorn main:app --host 0.0.0.0 --port 8100

# On AMD ROCm systems, torch lib dir must be in LD_LIBRARY_PATH:
# export LD_LIBRARY_PATH=$(python -c "import torch; print(torch.__path__[0])")/lib:$LD_LIBRARY_PATH

# Model supertonic-2 auto-downloads on first run (~300 MB)
# - Supertone TTS Sidecar: http://localhost:8100/health
```

**Important:** GPU provider list must be mutated in-place (`.clear()` + `.extend()`), not reassigned — `supertonic/loader.py` holds a reference to the original list object.

**Frontend integration:** ResultPanel has a collapsible TTS panel. Settings: voice (M1–M5, F1–F5), language (en/ko/es/pt/fr), speed (0.5–2.0×), quality (total_steps 1–20). Audio is returned as WAV (44100 Hz) and auto-downloaded.

## Kokoro TTS Sidecar

```bash
cd services/tts/kokoro-service
source .venv/bin/activate
pip uninstall -y onnxruntime
pip install onnxruntime-rocm==1.22.2.post1
python -m uvicorn main:app --host 0.0.0.0 --port 8200
# - Kokoro TTS Sidecar: http://localhost:8200/health
```

**Runtime:** The sidecar uses `kokoro-onnx` + ONNX Runtime. It downloads `kokoro-v1.0.onnx` and `voices-v1.0.bin` into `services/tts/kokoro-service/models/` if they are missing, tries `ROCMExecutionProvider` first, and falls back to `CPUExecutionProvider` if ROCm init or probe inference fails.

## F5 TTS Sidecar

```bash
cd services/tts/f5-service
source .venv/bin/activate
python -m uvicorn main:app --host 0.0.0.0 --port 8300
# - F5 TTS Sidecar: http://localhost:8300/health
# GPU-only by design. Sidecar stays unavailable if device != gpu.
# Requests must include text + refText + refAudio.
```

## PaddleOCR Sidecar

```bash
# Start sidecar locally (requires Python + dependencies)
cd services/ocr/paddleocr-service
python -m uvicorn main:app --host 0.0.0.0 --port 8000

# Access services:
# - Backend API: http://localhost:3000/api/ocr
# - PaddleOCR Sidecar: http://localhost:8000/health
```
