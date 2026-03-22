# Architecture

## Backend Layers

```
domain        ← entities, ports, constants (zero dependencies)
application   ← use cases, DTOs, utils (depends on domain only)
infrastructure ← port implementations: PaddleOCRService, LMStudio*, Sqlite*, configs
presentation  ← NestJS controllers, modules, response DTOs (wires DI)
agentic       ← isolated bounded context for agent orchestration
```

**Dependency rule:** imports may only go upward toward `domain`. Infrastructure may depend on domain and application. Presentation depends on application. `agentic` is fully isolated — it does not import from OCR layers and OCR layers do not import from `agentic`.

## Backend Dependency Rules

- `domain` has no dependencies on other layers.
- `application` depends only on `domain`.
- `infrastructure` implements ports and may depend on `domain` and `application`.
- `presentation` wires dependencies and must contain no business logic.
- `agentic` is isolated from the core OCR use case and must not break the local-first backend runtime.

## Domain Ports (Abstract Classes)

Used as NestJS DI tokens. Concrete implementations are registered via `useExisting`.

| Port | Implementation | Purpose |
|------|----------------|---------|
| `IOCRService` | `PaddleOCRService` | Extract text from image |
| `ITextStructuringService` | `LMStudioStructuringService` | Convert raw text → Markdown |
| `IPaddleOcrHealthPort` | `PaddleOCRHealthService` | PaddleOCR reachability, models, device |
| `ILmStudioHealthPort` | `LMStudioClient` | LM Studio reachability + model list |
| `ISupertonePort` | `SupertoneService` | Supertone TTS synthesis + health |
| `IKokoroPort` | `KokoroService` | Kokoro TTS synthesis + health |
| `IF5TtsPort` | `F5TtsService` | F5 TTS synthesis + health with device |
| `ISavedDocumentRepository` | `SqliteSavedDocumentRepository` | Document CRUD |
| `IVocabularyRepository` | `SqliteVocabularyRepository` | Vocabulary CRUD + SRS queries |
| `IPracticeSessionRepository` | `SqlitePracticeSessionRepository` | Practice session + attempt CRUD |
| `IVocabularyLlmService` | `LMStudioVocabularyService` | Exercise generation + session analysis |

## NestJS Module Map

```
AppModule
├── DatabaseModule          ← SqliteConfig + SqliteConnectionProvider (singleton)
├── OcrModule               ← ProcessImageUseCase; exports IPaddleOcrHealthPort, ILmStudioHealthPort
├── HealthModule            ← HealthCheckUseCase; imports OcrModule + TtsModule
├── TtsModule               ← SynthesizeSpeechUseCase; exports ISupertonePort, IKokoroPort, IF5TtsPort
├── DocumentModule          ← SavedDocumentUseCase; imports DatabaseModule
├── VocabularyModule        ← VocabularyUseCase + PracticeUseCase; imports DatabaseModule
└── AgentEcosystemModule    ← isolated agentic bounded context
```

## OCR Pipeline

```
OcrController (POST /api/ocr)
  → ProcessImageUseCase
    → IOCRService (PaddleOCRService)
      → PaddleOCR sidecar /api/extract/base64
      ← raw text (or NO_TEXT_DETECTED fallback)
    → ITextStructuringService (LMStudioStructuringService)
      → LM Studio /v1/chat/completions
      ← markdown string
  ← { rawText, markdown, filename }
```

## Health Check Pipeline

```
HealthController (GET /api/health)
  → HealthCheckUseCase
    → IPaddleOcrHealthPort (PaddleOCRHealthService)
      → GET sidecar /health  → paddleOcrReachable, paddleOcrDevice
      → GET sidecar /models  → paddleOcrModels
    → ILmStudioHealthPort (LMStudioClient)
      → GET LM Studio /models → lmStudioReachable, lmStudioModels
    → ISupertonePort.checkHealth()
      → GET Supertone sidecar /health → superToneReachable
    → IKokoroPort.checkHealth()
      → GET Kokoro sidecar /health → kokoroReachable
    → IF5TtsPort.getHealth()
      → GET F5 sidecar /health → f5TtsReachable, f5TtsDevice
  ← { paddleOcrReachable, paddleOcrModels, paddleOcrDevice,
       lmStudioReachable, lmStudioModels,
       superToneReachable, kokoroReachable,
       f5TtsReachable, f5TtsDevice }
```

Status lamp logic (frontend `useHealthStatus`):
- 🔴 `paddleOcrReachable = false` → PaddleOCR unreachable
- 🟡 `paddleOcrDevice = 'cpu'` → PaddleOCR on CPU
- 🔵 GPU + `lmStudioReachable` + all TTS reachable → all systems OK
- 🟢 GPU OK but LM Studio / some TTS service not fully available

## TTS Pipeline

```
TtsController (POST /api/tts, multipart kept in memory)
  → SynthesizeSpeechUseCase
    engine='f5'       → IF5TtsPort.synthesize({ text, refText, refAudio, ... })
    engine='kokoro'   → IKokoroPort.synthesize({ text, voice, speed })
    default           → ISupertonePort.synthesize({ text, engine, voice, lang, speed, totalSteps })
  ← audio/wav binary (44100 Hz, mono)
```

HTTP input validation (text length, empty text) stays in `TtsController` as a presentation concern. Temp-file lifecycle is intentionally absent from presentation.

## Document Pipeline

```
DocumentController (POST/GET/PUT/DELETE /api/documents)
  → SavedDocumentUseCase
    → ISavedDocumentRepository (SqliteSavedDocumentRepository)
      → SQLite (DatabaseModule provides connection)
```

## Vocabulary & Practice Pipeline

```
VocabularyController (/api/vocabulary)
  → VocabularyUseCase
    → IVocabularyRepository (SqliteVocabularyRepository)

PracticeController (/api/practice)
  → PracticeUseCase
    → IVocabularyRepository     — select words due for review
    → IVocabularyLlmService     — generate exercises, analyze session
      → LM Studio /v1/chat/completions
    → IPracticeSessionRepository — persist sessions and attempts
    → SM-2 algorithm (application/utils/sm2.ts) — update SRS fields
```

## Agentic Bounded Context

Actual structure of `backend/src/agentic/`:

```
core/         — Zod schemas, runtime types, env-driven config
agents/       — Agent factory: coordinator + specialist pairs per phase
tools/        — SDK function tools (architecture-tools, deployment-tools)
guardrails/   — Phase-level and deployment output validation
application/  — AgentEcosystemService (orchestration via withTrace)
presentation/ — Controller, DTOs, NestJS module
```

### Phase Coordinators And Specialists

Implemented as pairs: Supervisor (decision-heavy, `gpt-5` + reasoning) → Specialist (output, lighter model):

| Phase | Coordinator | Specialist | Output Schema |
|-------|-------------|------------|---------------|
| analyze | Analyze Supervisor | Dependency Mapper | `PhaseOutputSchema` (stage=analyze) |
| scaffold | Scaffold Supervisor | Scaffold Planner | `PhaseOutputSchema` (stage=scaffold) |
| initialize | Initialization Supervisor | Initialization Architect | `PhaseOutputSchema` (stage=initialize) |
| deploy | Deployment Supervisor | Deployment Specialist | `DeploymentReportSchema` |

### Handoff Protocol (Schema-Driven)

Phases are connected by typed objects (ADR-004). Changing a payload requires simultaneous updates to code and documentation.

**`PhaseOutputSchema`** (`backend/src/agentic/core/agent-ecosystem.schemas.ts`):
- `stage` — `'analyze' | 'scaffold' | 'initialize'`
- `summary` — brief phase description
- `dependencyTree` — array of `DependencyNode` (`id`, `description`, `dependsOn[]`)
- `scaffold` — array of `ScaffoldItem` (`path`, `purpose`)
- `agentBlueprints` — array of `AgentBlueprint` (`name`, `role`, `model`, `handoffTargets[]`, `guardrails[]`, ...)
- `decisions` — array of strings with architectural decisions

**`AutonomousArchitecturePlanSchema`**:
- `request`, `analysis`, `scaffold`, `initialization`, `tracing`

**`DeploymentReportSchema`**:
- `workspaceName`, `rootDir`, `summary`, `artifacts[]`, `generatedFiles[]`

**`AutonomousDeploymentResultSchema`**:
- `plan` (AutonomousArchitecturePlan) + `deployment` (DeploymentReport)

### Execution Flow

```
AgentEcosystemService.execute(request)
  → withTrace(workflowName)
    → runPhase(analyzeCoordinator, analyzePrompt)    → PhaseOutput (analyze)
    → runPhase(scaffoldCoordinator, scaffoldPrompt)  → PhaseOutput (scaffold)
    → runPhase(initCoordinator, initPrompt)          → PhaseOutput (initialize)
  ← AutonomousArchitecturePlan

AgentEcosystemService.deploy({ request, workspaceName })
  → generatePlan(request)                             → AutonomousArchitecturePlan
  → withTrace(workflowName-deployment)
    → runDeployment(deploymentCoordinator, deployPrompt)
      → Deployment Specialist calls: create_workspace_scaffold → write_runtime_bundle → summarize_runtime_bundle
  ← AutonomousDeploymentResult { plan, deployment }
```

### Model Allocation

| Role | Default Model | Reasoning |
|------|--------------|-----------|
| Supervisor (all phases) | `gpt-5` | `reasoning.effort = high` |
| Dependency Mapper | `gpt-5-nano` | Simple structured output |
| Scaffold Planner | `gpt-5-mini` | Moderate planning |
| Initialization Architect | `gpt-5` | Decision-heavy, high reasoning |
| Deployment Specialist | `gpt-5-mini` | Tool-use focused |

## Architectural Assessment

- Clean/hexagonal backend structure enforced; no layer violations remain.
- `HealthCheckUseCase` depends exclusively on domain ports (ADR-007).
- `TtsController` delegates to `SynthesizeSpeechUseCase`; multipart upload stays in memory and there are no temp-file infrastructure imports in presentation (ADR-008).
- `DatabaseModule` owns the SQLite connection singleton; `DocumentModule` and `VocabularyModule` import it (ADR-009).
- `agentic` bounded context correctly isolated and does not overlap with OCR layers.
- Frontend MVVM is preserved at the feature boundary: orchestration for the result surface now lives in `useResultPanel`, while `ResultPanel.tsx` remains rendering-focused.
- Documentation aligned with actual code — updated 2026-03-21.
- Open risk: graceful degradation of the agentic runtime when the OpenAI API key is absent is not yet implemented; `/api/agents/*` currently returns 5xx while the rest of the app remains available.
