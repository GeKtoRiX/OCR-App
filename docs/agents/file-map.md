# File Map

## Root

- `agents.md`: agent entry rules and handoff protocol.
- `structure.md`: normative repository structure contract.
- `CLAUDE.md`: engineering guide.
- `package.json`: root workspace orchestration.
- `tsconfig.base.json`: shared TypeScript config.
- `.gitignore`, `.env`: local configuration and exclusions.

## Scripts

- `scripts/linux/ocr.sh`: unified lifecycle script for Linux/macOS — `start`, `stop`, `wipe`, `status` commands.

## Backend — OCR Core

- `backend/src/main.ts`: bootstrap (port 3000).
- `backend/src/presentation/app.module.ts`: composition root (OcrModule, HealthModule, AgentEcosystemModule, ServeStaticModule).
- `backend/src/presentation/modules/ocr.module.ts`: OCR DI wiring (PaddleOCRService → IOCRService).
- `backend/src/presentation/modules/health.module.ts`: health wiring.
- `backend/src/presentation/controllers/ocr.controller.ts`: POST /api/ocr.
- `backend/src/presentation/controllers/health.controller.ts`: GET /api/health.
- `backend/src/presentation/dto/ocr-response.dto.ts`: response shape for /api/ocr.
- `backend/src/domain/entities/image-data.entity.ts`: image buffer + metadata entity.
- `backend/src/domain/entities/ocr-result.entity.ts`: rawText + structuredMarkdown entity.
- `backend/src/domain/ports/ocr-service.port.ts`: IOCRService abstract class.
- `backend/src/domain/ports/text-structuring-service.port.ts`: ITextStructuringService abstract class.
- `backend/src/domain/ports/health-check.port.ts`: IHealthCheckPort abstract class.
- `backend/src/domain/constants.ts`: NO_TEXT_DETECTED fallback constant.
- `backend/src/application/use-cases/process-image.use-case.ts`: OCR orchestration use case.
- `backend/src/application/use-cases/health-check.use-case.ts`: health orchestration use case.
- `backend/src/application/dto/process-image.dto.ts`: ProcessImageInput/Output DTOs.
- `backend/src/application/dto/health-check.dto.ts`: HealthCheckOutput DTO.
- `backend/src/infrastructure/config/lm-studio.config.ts`: LM Studio env vars.
- `backend/src/infrastructure/config/paddleocr.config.ts`: PaddleOCR env vars + endpoint helpers.
- `backend/src/infrastructure/lm-studio/lm-studio.client.ts`: LMStudioClient (IHealthCheckPort impl).
- `backend/src/infrastructure/lm-studio/lm-studio-ocr.service.ts`: LMStudioOCRService (fallback IOCRService).
- `backend/src/infrastructure/lm-studio/lm-studio-structuring.service.ts`: LMStudioStructuringService (primary ITextStructuringService).
- `backend/src/infrastructure/paddleocr/paddleocr-ocr.service.ts`: PaddleOCRService (primary IOCRService).
- `backend/src/infrastructure/paddleocr/paddleocr-health.service.ts`: PaddleOCRHealthService (IHealthCheckPort impl for sidecar).
- `backend/src/app.e2e.spec.ts`: e2e API test (full NestJS with mocked providers).
- `backend/src/integration.spec.ts`: integration-level backend test.

## Backend — Agentic Bounded Context

- `backend/src/agentic/core/agent-ecosystem.schemas.ts`: Zod schemas for phase outputs and deployment report.
- `backend/src/agentic/core/agent-ecosystem.config.ts`: AgentEcosystemConfig — model names + tracing settings from env.
- `backend/src/agentic/core/agent-ecosystem.types.ts`: AgentWorkflowContext, AgentRuntimeModels, PhaseExecutionInput, DeploymentRequest interfaces.
- `backend/src/agentic/agents/agent-factory.ts`: factory functions for Analyze/Scaffold/Initialization/Deployment coordinators and specialists.
- `backend/src/agentic/application/agent-ecosystem.service.ts`: phase orchestration via withTrace; generate plan + deploy.
- `backend/src/agentic/tools/architecture-tools.ts`: SDK function tools for architecture flow.
- `backend/src/agentic/tools/deployment-tools.ts`: SDK function tools for deployment flow.
- `backend/src/agentic/guardrails/phase-output.guardrails.ts`: analyze/scaffold/initialize phase output validation.
- `backend/src/agentic/guardrails/deployment-output.guardrails.ts`: deployment report validation guardrail.
- `backend/src/agentic/presentation/controllers/agent-ecosystem.controller.ts`: POST /api/agents/architecture + /api/agents/deploy.
- `backend/src/agentic/presentation/dto/agent-ecosystem-request.dto.ts`: architecture request DTO.
- `backend/src/agentic/presentation/dto/agent-ecosystem-response.dto.ts`: architecture response DTO.
- `backend/src/agentic/presentation/dto/agent-deployment-request.dto.ts`: deploy request DTO.
- `backend/src/agentic/presentation/dto/agent-deployment-response.dto.ts`: deploy response DTO.
- `backend/src/agentic/presentation/modules/agent-ecosystem.module.ts`: Nest module wiring for agentic context.
- `backend/src/agentic/application/agent-ecosystem.service.spec.ts`: unit tests for AgentEcosystemService.

## Frontend

- `frontend/src/App.tsx`: root UI component — composes hooks and views.
- `frontend/src/main.tsx`: React DOM entry.
- `frontend/src/styles.css`: dark theme CSS.
- `frontend/src/model/api.ts`: processImage() and checkHealth() fetch wrappers.
- `frontend/src/model/types.ts`: OcrResponse, HealthResponse, ApiError types.
- `frontend/src/model/clipboard.ts`: copyToClipboard() utility.
- `frontend/src/viewmodel/useOCR.ts`: state machine hook (idle → loading → success/error) with AbortController.
- `frontend/src/viewmodel/useImageUpload.ts`: file validation, drag & drop, clipboard paste, preview management.
- `frontend/src/viewmodel/useHealthStatus.ts`: polls /api/health every 30s; computes status light color and device mode.
- `frontend/src/view/DropZone.tsx`: drag-drop file input with preview.
- `frontend/src/view/ResultPanel.tsx`: tabbed view (Markdown/Raw) + copy-to-clipboard.
- `frontend/src/view/StatusBar.tsx`: loading spinner, success/error messages.
- `frontend/src/view/StatusLight.tsx`: color-coded service health indicator (gpu/cpu/degraded/offline).

## OCR Sidecar

- `paddleocr-service/main.py`: FastAPI service entry point.
- `paddleocr-service/smoke_test.py`: startup smoke-test for the sidecar.
- `paddleocr-service/requirements.txt`: Python dependencies.

## Documentation

- `docs/agent-ecosystem.md`: runtime overview for agentic bounded context (phases, coordinators, tools).
- `docs/agents/project-overview.md`: project summary, public APIs, constraints.
- `docs/agents/architecture.md`: layer rules, agentic bounded context, handoff schemas.
- `docs/agents/file-map.md`: this file — map of all significant source files.
- `docs/agents/runbook.md`: run/test/deploy procedures and curl examples.
- `docs/agents/context.md`: current operational status and active risks.
- `docs/agents/adr.md`: architecture decisions register.
- `docs/agents/task-log.md`: change memory for recent significant updates.
