# File Map

This file lists the main architectural entry points and ownership boundaries. It is intentionally selective.

## Root

- `README.md` - user-facing project overview
- `CLAUDE.md` - engineering guide
- `agents.md` - agent roles and working rules
- `structure.md` - structure contract
- `package.json` - workspace orchestration

## Backend

### Shared package

- `backend/shared/src/index.ts`
- `backend/shared/src/contracts/agentic.contracts.ts`
- `backend/shared/src/contracts/document.contracts.ts`
- `backend/shared/src/contracts/ocr.contracts.ts`
- `backend/shared/src/contracts/tts.contracts.ts`
- `backend/shared/src/contracts/vocabulary.contracts.ts`

### Gateway

- `backend/gateway/src/main.ts`
- `backend/gateway/src/app.module.ts`
- `backend/gateway/src/gateway-clients.module.ts`
- `backend/gateway/src/upstream-http-error.ts`
- `backend/gateway/src/ocr/gateway-ocr.controller.ts`
- `backend/gateway/src/tts/gateway-tts.controller.ts`
- `backend/gateway/src/document/gateway-document.controller.ts`
- `backend/gateway/src/vocabulary/gateway-vocabulary.controller.ts`
- `backend/gateway/src/practice/gateway-practice.controller.ts`
- `backend/gateway/src/health/gateway-health.controller.ts`
- `backend/gateway/src/agentic/gateway-agentic.controller.ts`

### Service apps

- `backend/services/ocr/src/main.ts`
- `backend/services/ocr/src/app.module.ts`
- `backend/services/ocr/src/ocr.message.controller.ts`
- `backend/services/tts/src/main.ts`
- `backend/services/tts/src/app.module.ts`
- `backend/services/tts/src/tts.message.controller.ts`
- `backend/services/document/src/main.ts`
- `backend/services/document/src/app.module.ts`
- `backend/services/document/src/document.message.controller.ts`
- `backend/services/vocabulary/src/main.ts`
- `backend/services/vocabulary/src/app.module.ts`
- `backend/services/vocabulary/src/vocabulary.message.controller.ts`
- `backend/services/agentic/src/main.ts`
- `backend/services/agentic/src/app.module.ts`
- `backend/services/agentic/src/agentic.message.controller.ts`

### Reusable implementation

- `backend/src/domain/*`
- `backend/src/application/*`
- `backend/src/infrastructure/*`
- `backend/src/presentation/*`
- `backend/src/agentic/*`

Important files:

- `backend/src/application/use-cases/process-image.use-case.ts`
- `backend/src/application/use-cases/health-check.use-case.ts`
- `backend/src/application/use-cases/synthesize-speech.use-case.ts`
- `backend/src/application/use-cases/saved-document.use-case.ts`
- `backend/src/application/use-cases/vocabulary.use-case.ts`
- `backend/src/application/use-cases/practice.use-case.ts`
- `backend/src/domain/entities/document-vocab-candidate.entity.ts`
- `backend/src/domain/ports/document-vocabulary-extractor.port.ts`
- `backend/src/infrastructure/document/document-vocabulary-extractor.service.ts`
- `backend/src/infrastructure/lm-studio/lm-studio.client.ts`
- `backend/src/infrastructure/lm-studio/lm-studio-ocr.service.ts`
- `backend/src/infrastructure/lm-studio/lm-studio-ocr-health.service.ts`
- `backend/src/infrastructure/lm-studio/lm-studio-structuring.service.ts`
- `backend/src/infrastructure/lm-studio/lm-studio-vocabulary.service.ts`
- `backend/src/infrastructure/vocabulary/tcp-vocabulary.repository.ts`
- `backend/src/infrastructure/supertone/supertone.service.ts`
- `backend/src/infrastructure/kokoro/kokoro.service.ts`

## Frontend

- `frontend/src/App.tsx`
- `frontend/src/main.tsx`

### Stores

- `frontend/src/features/ocr/ocr.store.ts`
- `frontend/src/features/documents/documents.store.ts`
- `frontend/src/features/vocabulary/vocabulary.store.ts`
- `frontend/src/features/practice/practice.store.ts`
- `frontend/src/features/health/health.store.ts`

### Hooks and surfaces

- `frontend/src/features/ocr/useImageUpload.ts`
- `frontend/src/features/tts/useTts.ts`
- `frontend/src/features/vocabulary/useVocabContextMenu.ts`
- `frontend/src/view/useResultPanel.ts`
- `frontend/src/view/ResultPanel.tsx`
- `frontend/src/view/HistoryPanel.tsx`
- `frontend/src/features/practice/PracticeView.tsx`
- `frontend/src/features/vocabulary/VocabularyPanel.tsx`
- `frontend/src/features/vocabulary/SaveVocabularyOverlay.tsx`

### Shared frontend files

- `frontend/src/shared/api.ts`
- `frontend/src/shared/types.ts`
- `frontend/src/shared/lib/health-status.ts`
- `frontend/src/ui/StatusBar.tsx`
- `frontend/src/ui/StatusLight.tsx`

## Sidecars

- `services/nlp/stanza-service/main.py`
- `services/nlp/stanza-service/requirements.txt`
- `services/tts/supertone-service/main.py`
- `services/tts/supertone-service/smoke_test.py`
- `services/tts/kokoro-service/main.py`
- `services/tts/kokoro-service/smoke_test.py`

## Scripts

- `scripts/linux/ocr-common.sh`
- `scripts/linux/ocr.sh`
- `scripts/linux/tts-models.conf`
- `scripts/e2e/prepare-browser-env.sh`
- `scripts/e2e/prepare-save-vocabulary-env.sh`
- `scripts/e2e/stop-browser-env.sh`
- `scripts/perf/api-benchmark.mjs`
- `scripts/perf/browser-benchmark.mjs`
- `scripts/perf/run-phase4.sh`

## Documentation

- `docs/agent-ecosystem.md`
- `docs/agents/project-overview.md`
- `docs/agents/architecture.md`
- `docs/agents/file-map.md`
- `docs/agents/runbook.md`
- `docs/agents/context.md`
- `docs/agents/adr.md`
- `docs/agents/task-log.md`

## Browser E2E

- `playwright.config.ts`
- `playwright.save-vocabulary.config.ts`
- `e2e/app.spec.ts`
- `e2e/save-vocabulary.spec.ts`
