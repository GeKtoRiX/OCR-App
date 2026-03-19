# Architecture

## Backend Layers

```
domain        ← entities, ports, constants (zero dependencies)
application   ← use cases, DTOs (depends on domain only)
infrastructure ← port implementations: PaddleOCRService, LMStudio*, configs
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

| Port | Primary Implementation | Purpose |
|------|------------------------|---------|
| `IOCRService` | `PaddleOCRService` | Extract text from image |
| `ITextStructuringService` | `LMStudioStructuringService` | Convert raw text → Markdown |
| `IHealthCheckPort` | `PaddleOCRHealthService` / `LMStudioClient` | Check reachability + list models |

## OCR Pipeline

```
OcrController
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
HealthController
  → HealthCheckUseCase
    → IHealthCheckPort (PaddleOCRHealthService)
      → GET sidecar /health  → paddleOcrReachable, paddleOcrDevice
      → GET sidecar /models  → paddleOcrModels
    → IHealthCheckPort (LMStudioClient)
      → GET LM Studio /models → lmStudioReachable, lmStudioModels
  ← { paddleOcrReachable, paddleOcrModels, paddleOcrDevice, lmStudioReachable, lmStudioModels }
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

- Clean/hexagonal backend structure preserved; layers are not mixed.
- `agentic` bounded context correctly isolated and does not overlap with OCR layers.
- Frontend MVVM maintained: hooks hold logic, components handle rendering only.
- Documentation aligned with actual code during the 2026-03-19 revision.
- Open risk: graceful degradation of the agentic runtime when the OpenAI API key is absent is not yet implemented.
