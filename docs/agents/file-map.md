# File Map

## Root

- `agents.md`: agent entry rules and handoff protocol.
- `structure.md`: normative repository structure contract.
- `CLAUDE.md`: engineering guide.
- `package.json`: root workspace orchestration.
- `tsconfig.base.json`: shared TypeScript config.
- `.gitignore`, `.env`: local configuration and exclusions.

## Scripts

- `scripts/linux/ocr.sh`: unified lifecycle script for Linux/macOS. Interactive mode selector starts PaddleOCR, TTS sidecars, and backend; Ctrl+C stops all gracefully. Sub-commands: `stop`, `wipe`, `status`. Logs written to `.logs/`; PID files in `.pids/`.

## Backend — OCR Core

- `backend/src/main.ts`: bootstrap (port 3000).
- `backend/src/presentation/app.module.ts`: composition root (DatabaseModule, OcrModule, HealthModule, TtsModule, DocumentModule, VocabularyModule, AgentEcosystemModule, ServeStaticModule).
- `backend/src/presentation/modules/database.module.ts`: SQLite connection singleton (provides/exports SqliteConfig + SqliteConnectionProvider).
- `backend/src/presentation/modules/ocr.module.ts`: OCR DI wiring; binds/exports IPaddleOcrHealthPort, ILmStudioHealthPort.
- `backend/src/presentation/modules/health.module.ts`: HealthCheckUseCase wiring (imports OcrModule + TtsModule for port tokens).
- `backend/src/presentation/modules/tts.module.ts`: TTS DI wiring; binds/exports ISupertonePort, IKokoroPort, IQwenTtsPort; provides SynthesizeSpeechUseCase.
- `backend/src/presentation/modules/document.module.ts`: saved-document wiring (imports DatabaseModule).
- `backend/src/presentation/modules/vocabulary.module.ts`: vocabulary + practice wiring (imports DatabaseModule).
- `backend/src/presentation/controllers/ocr.controller.ts`: POST /api/ocr.
- `backend/src/presentation/controllers/health.controller.ts`: GET /api/health.
- `backend/src/presentation/controllers/tts.controller.ts`: POST /api/tts — validates text, delegates to SynthesizeSpeechUseCase, returns audio/wav.
- `backend/src/presentation/controllers/document.controller.ts`: CRUD /api/documents.
- `backend/src/presentation/controllers/vocabulary.controller.ts`: CRUD /api/vocabulary.
- `backend/src/presentation/controllers/practice.controller.ts`: /api/practice start/answer/complete/sessions/stats.
- `backend/src/presentation/dto/ocr-response.dto.ts`: response DTOs for /api/ocr and /api/health.
- `backend/src/presentation/dto/document.dto.ts`: document request/response DTOs.
- `backend/src/presentation/dto/vocabulary.dto.ts`: vocabulary request DTOs.
- `backend/src/presentation/dto/practice.dto.ts`: practice request DTOs.

### Domain — Entities

- `backend/src/domain/entities/image-data.entity.ts`: image buffer + metadata entity.
- `backend/src/domain/entities/ocr-result.entity.ts`: rawText + structuredMarkdown entity.
- `backend/src/domain/entities/saved-document.entity.ts`: saved OCR document (markdown, filename, timestamps).
- `backend/src/domain/entities/vocabulary-word.entity.ts`: vocabulary word with SRS fields (intervalDays, easinessFactor, repetitions, nextReviewAt).
- `backend/src/domain/entities/practice-session.entity.ts`: practice session (language pair, start/end, exercise counts, LLM analysis).
- `backend/src/domain/entities/exercise-attempt.entity.ts`: individual exercise attempt (type, correctness, error position, quality rating, mnemonic).

### Domain — Ports

- `backend/src/domain/ports/ocr-service.port.ts`: IOCRService.
- `backend/src/domain/ports/text-structuring-service.port.ts`: ITextStructuringService.
- `backend/src/domain/ports/paddle-ocr-health.port.ts`: IPaddleOcrHealthPort — isReachable, listModels, getDevice.
- `backend/src/domain/ports/lm-studio-health.port.ts`: ILmStudioHealthPort — isReachable, listModels.
- `backend/src/domain/ports/supertone.port.ts`: ISupertonePort — synthesize(SupertoneSynthesisInput), checkHealth.
- `backend/src/domain/ports/kokoro.port.ts`: IKokoroPort — synthesize(KokoroSynthesisInput), checkHealth.
- `backend/src/domain/ports/qwen-tts.port.ts`: IQwenTtsPort — synthesize(QwenSynthesisInput), getHealth → QwenTtsHealthResult.
- `backend/src/domain/ports/saved-document-repository.port.ts`: ISavedDocumentRepository.
- `backend/src/domain/ports/vocabulary-repository.port.ts`: IVocabularyRepository (CRUD + findByWord + findDueForReview + updateSrs).
- `backend/src/domain/ports/practice-session-repository.port.ts`: IPracticeSessionRepository (sessions + attempts CRUD).
- `backend/src/domain/ports/vocabulary-llm-service.port.ts`: IVocabularyLlmService — generateExercises, analyzeSession.
- `backend/src/domain/constants.ts`: NO_TEXT_DETECTED fallback constant.

### Application — Use Cases

- `backend/src/application/use-cases/process-image.use-case.ts`: OCR orchestration.
- `backend/src/application/use-cases/health-check.use-case.ts`: aggregates health from 5 domain ports (no infrastructure imports).
- `backend/src/application/use-cases/synthesize-speech.use-case.ts`: routes by engine to ISupertonePort / IKokoroPort / IQwenTtsPort.
- `backend/src/application/use-cases/saved-document.use-case.ts`: document CRUD orchestration.
- `backend/src/application/use-cases/vocabulary.use-case.ts`: vocabulary CRUD + SRS queries.
- `backend/src/application/use-cases/practice.use-case.ts`: practice session orchestration (exercise generation, SM-2 updates, session analysis).

### Application — DTOs

- `backend/src/application/dto/process-image.dto.ts`: ProcessImageInput/Output.
- `backend/src/application/dto/health-check.dto.ts`: HealthCheckOutput.
- `backend/src/application/dto/synthesize-speech.dto.ts`: SynthesizeSpeechInput/Output.
- `backend/src/application/dto/saved-document.dto.ts`: CreateDocumentInput, UpdateDocumentInput, SavedDocumentOutput.
- `backend/src/application/dto/vocabulary.dto.ts`: AddVocabularyInput, UpdateVocabularyInput, VocabularyOutput.
- `backend/src/application/dto/practice.dto.ts`: StartPracticeInput, SubmitAnswerInput, ExerciseOutput, SubmitAnswerOutput, SessionAnalysisOutput.

### Application — Utils

- `backend/src/application/utils/sm2.ts`: SM-2 spaced repetition algorithm (calculateSm2, computeErrorPosition, computeQualityRating).

### Infrastructure — Config

- `backend/src/infrastructure/config/lm-studio.config.ts`: LM Studio env vars.
- `backend/src/infrastructure/config/paddleocr.config.ts`: PaddleOCR env vars + endpoint helpers.
- `backend/src/infrastructure/config/supertone.config.ts`: Supertone env vars + endpoint helpers.
- `backend/src/infrastructure/config/kokoro.config.ts`: Kokoro env vars + endpoint helpers.
- `backend/src/infrastructure/config/qwen-tts.config.ts`: Qwen TTS env vars + endpoint helpers.
- `backend/src/infrastructure/config/sqlite.config.ts`: SQLite database path from env.

### Infrastructure — LM Studio

- `backend/src/infrastructure/lm-studio/lm-studio.client.ts`: LMStudioClient (extends ILmStudioHealthPort); chatCompletion(), isReachable(), listModels().
- `backend/src/infrastructure/lm-studio/lm-studio-ocr.service.ts`: LMStudioOCRService (fallback IOCRService, not used in primary path).
- `backend/src/infrastructure/lm-studio/lm-studio-structuring.service.ts`: LMStudioStructuringService (primary ITextStructuringService).
- `backend/src/infrastructure/lm-studio/lm-studio-vocabulary.service.ts`: LMStudioVocabularyService (IVocabularyLlmService); generates exercises, analyzes sessions.

### Infrastructure — PaddleOCR

- `backend/src/infrastructure/paddleocr/paddleocr-ocr.service.ts`: PaddleOCRService (primary IOCRService).
- `backend/src/infrastructure/paddleocr/paddleocr-health.service.ts`: PaddleOCRHealthService (extends IPaddleOcrHealthPort); isReachable, getDevice, listModels.

### Infrastructure — TTS Services

- `backend/src/infrastructure/supertone/supertone.service.ts`: SupertoneService (extends ISupertonePort); synthesize, checkHealth.
- `backend/src/infrastructure/kokoro/kokoro.service.ts`: KokoroService (extends IKokoroPort); synthesize, checkHealth.
- `backend/src/infrastructure/qwen/qwen-tts.service.ts`: QwenTtsService (extends IQwenTtsPort); synthesize, getHealth.

### Infrastructure — SQLite

- `backend/src/infrastructure/sqlite/sqlite-connection.provider.ts`: SqliteConnectionProvider — better-sqlite3 lifecycle management (WAL pragma, dir creation).
- `backend/src/infrastructure/sqlite/sqlite-saved-document.repository.ts`: SqliteSavedDocumentRepository (extends ISavedDocumentRepository).
- `backend/src/infrastructure/sqlite/sqlite-vocabulary.repository.ts`: SqliteVocabularyRepository (extends IVocabularyRepository); SRS index on next_review_at.
- `backend/src/infrastructure/sqlite/sqlite-practice-session.repository.ts`: SqlitePracticeSessionRepository (extends IPracticeSessionRepository); foreign key cascade on session delete.

### Tests

- `backend/src/app.e2e.spec.ts`: e2e API test (full NestJS with mocked providers).
- `backend/src/integration.spec.ts`: integration-level backend test (requires live sidecars; skips gracefully).

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

## Frontend

- `frontend/src/App.tsx`: root UI component — composes all hooks and views.
- `frontend/src/main.tsx`: React DOM entry.
- `frontend/src/styles/base.css`: CSS variables and base resets (dark theme, #1b1e26 base).
- `frontend/src/styles/layout.css`: layout system (app shell, workspace grid, panels, buttons, animations).
- `frontend/src/model/api.ts`: processImage, checkHealth, generateSpeech, document/vocabulary/practice fetch wrappers.
- `frontend/src/model/types.ts`: OcrResponse, HealthResponse, TTS settings (4 engine variants), SavedDocument, VocabularyWord, Exercise, AnswerResult, SessionAnalysis, HistoryEntry, LanguagePair.
- `frontend/src/model/clipboard.ts`: copyToClipboard() utility.
- `frontend/src/viewmodel/useOCR.ts`: state machine hook (idle → loading → success/error) with AbortController.
- `frontend/src/viewmodel/useImageUpload.ts`: file validation, drag & drop, clipboard paste, preview management.
- `frontend/src/viewmodel/useHealthStatus.ts`: polls /api/health every 30s; 4-color lamp (blue/green/yellow/red).
- `frontend/src/viewmodel/useSessionHistory.ts`: in-session OCR result history.
- `frontend/src/viewmodel/useTts.ts`: TTS state and audio generation for 4 engines.
- `frontend/src/viewmodel/useSavedDocuments.ts`: CRUD state for saved documents.
- `frontend/src/viewmodel/useVocabulary.ts`: vocabulary word list state with language pair tracking and due count.
- `frontend/src/viewmodel/usePractice.ts`: practice session state machine (idle → practicing → reviewing → complete).
- `frontend/src/view/DropZone.tsx`: drag-drop file input with preview.
- `frontend/src/view/ResultPanel.tsx`: tabbed view (Markdown/Raw) + copy + inline edit mode + save + collapsible TTS panel.
- `frontend/src/view/StatusBar.tsx`: loading spinner, success/error messages.
- `frontend/src/view/StatusLight.tsx`: color-coded service health indicator (blue/green/yellow/red).
- `frontend/src/view/HistoryPanel.tsx`: 3-tab panel (Session, Saved, Vocab) with practice launch.
- `frontend/src/view/VocabularyPanel.tsx`: vocabulary word list with language pair selector.
- `frontend/src/view/VocabContextMenu.tsx`: context menu for selecting vocabulary type from text selection.
- `frontend/src/view/VocabAddForm.tsx`: form for entering translation after vocab type selection.
- `frontend/src/view/PracticeView.tsx`: modal for practice session rendering exercises, feedback, and analysis.

## TTS Sidecars

- `services/tts/supertone-service/`: Supertone FastAPI sidecar (port 8100, ONNX Runtime, GPU via ROCm).
- `services/tts/kokoro-service/`: Kokoro FastAPI sidecar (port 8200, GPU support).
- `services/tts/qwen-tts-service/`: Qwen TTS FastAPI sidecar (port 8300, GPU support).

## OCR Sidecar

- `services/ocr/paddleocr-service/main.py`: FastAPI OCR service entry point.
- `services/ocr/paddleocr-service/smoke_test.py`: startup smoke-test.
- `services/ocr/paddleocr-service/requirements.txt`: Python dependencies.

## Documentation

- `docs/agents/project-overview.md`: project summary, public APIs, constraints.
- `docs/agents/architecture.md`: layer rules, port map, all pipelines, agentic bounded context.
- `docs/agents/file-map.md`: this file — map of all significant source files.
- `docs/agents/runbook.md`: run/test/deploy procedures and curl examples.
- `docs/agents/context.md`: current operational status and active risks.
- `docs/agents/adr.md`: architecture decisions register.
- `docs/agents/task-log.md`: change memory for recent significant updates.
