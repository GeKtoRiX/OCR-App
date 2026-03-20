# Project Structure Contract

This document defines the target and permitted repository structure. If the actual file tree diverges from it, update the document first or bring the code into the described form.

## Root

Permitted root directories and files:

- `backend/`: NestJS backend.
- `frontend/`: React/Vite frontend.
- `services/`: Python sidecar services.
  - `ocr/paddleocr-service/`: Python OCR sidecar (PaddleOCR, port 8000).
  - `tts/supertone-service/`: Python TTS sidecar (Supertone / supertonic, port 8100).
  - `tts/kokoro-service/`: Python TTS sidecar (Kokoro, port 8200).
  - `tts/qwen-tts-service/`: Python TTS sidecar (Qwen TTS, port 8300).
- `logs/`: runtime log files (gitignored).
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
  - `utils/*.ts`
- `backend/src/infrastructure/`
  - `config/*.config.ts`
  - `lm-studio/*.service.ts`, `*.client.ts`
  - `paddleocr/*.service.ts`
  - `supertone/*.service.ts`
  - `kokoro/*.service.ts`
  - `qwen/*.service.ts`
  - `sqlite/*.repository.ts`, `*.provider.ts`
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

- `model/`: API client functions and TypeScript types.
- `viewmodel/`: React hooks (state and logic).
- `view/`: React components (UI only, no business logic).
- `styles/`: CSS files (base.css, layout.css).
- `App.tsx`, `main.tsx`, `test-setup.ts`, `vite-env.d.ts`.

Files are named by responsibility:

- Components: `PascalCase.tsx`
- Hooks: `use*.ts`
- Tests: `*.spec.ts` / `*.spec.tsx`
- CSS: colocated with components or in `styles/`.

## OCR Sidecar (`services/ocr/paddleocr-service/`)

- `main.py`: entry point.
- `smoke_test.py`: smoke test for sidecar startup and `/health`.
- `requirements.txt`: Python deps.

## TTS Sidecars (`services/tts/`)

### Supertone (`supertone-service/`)

- `main.py`: FastAPI TTS service entry point (supertonic ONNX Runtime).
- `smoke_test.py`: smoke test for startup, `/health`, and `/api/tts`.
- `requirements.txt`: Python deps (`supertonic`, `fastapi`, `uvicorn`, `soundfile`, `numpy`).

### Kokoro (`kokoro-service/`)

- `main.py`: FastAPI TTS service entry point (Kokoro).
- `requirements.txt`: Python deps.

### Qwen TTS (`qwen-tts-service/`)

- `main.py`: FastAPI TTS service entry point (Qwen TTS).
- `requirements.txt`: Python deps.

## Scripts

- `scripts/linux/ocr.sh`: unified Linux/macOS lifecycle script. Interactive mode selector starts PaddleOCR, TTS sidecars, and the NestJS backend; Ctrl+C stops all gracefully. Sub-commands: `stop`, `wipe`, `status`.

## Documentation

- `docs/agents/`: operational documentation for architecture and agent work.

## Non-Source Artifacts

The following paths are permitted as build/runtime artifacts but are not part of the source structure:

- `backend/dist/`
- `frontend/dist/`
- `frontend/tsconfig.tsbuildinfo`
- `node_modules/`
- `data/` (SQLite database file at runtime)
- `.logs/`, `.pids/` (lifecycle script output)

They must not be used as the basis for architectural decisions and should not appear in the file map as source of truth.

## Audit Result On 2026-03-21

- No hierarchy violations found in source files.
- All backend and frontend files follow naming rules.
- `agentic/` bounded context is correctly isolated inside `backend/src/` and does not overlap with OCR layers.
- Architecture violations resolved: `HealthCheckUseCase` and `TtsController` now depend exclusively on domain ports (ADR-007, 008).
- `DatabaseModule` owns the SQLite connection singleton; `DocumentModule` and `VocabularyModule` import it (ADR-009).
- New domain entities: `SavedDocument`, `VocabularyWord`, `PracticeSession`, `ExerciseAttempt`.
- New domain ports: `IPaddleOcrHealthPort`, `ILmStudioHealthPort`, `ISupertonePort`, `IKokoroPort`, `IQwenTtsPort`, `ISavedDocumentRepository`, `IVocabularyRepository`, `IPracticeSessionRepository`, `IVocabularyLlmService`.
- New application use cases: `SynthesizeSpeechUseCase`, `SavedDocumentUseCase`, `VocabularyUseCase`, `PracticeUseCase`.
- New application utils: `sm2.ts` (SM-2 spaced repetition algorithm).
- New infrastructure: `SqliteConnectionProvider`, `SqliteSavedDocumentRepository`, `SqliteVocabularyRepository`, `SqlitePracticeSessionRepository`, `KokoroService`, `QwenTtsService`, `LMStudioVocabularyService`, configs for SQLite/Kokoro/Qwen TTS.
- New presentation modules: `DatabaseModule`, `DocumentModule`, `VocabularyModule` + controllers and DTOs.
- New frontend hooks: `useTts`, `useSavedDocuments`, `useVocabulary`, `usePractice`.
- New frontend views: `VocabularyPanel`, `VocabContextMenu`, `VocabAddForm`, `PracticeView`.
- CSS moved to `frontend/src/styles/` (`base.css`, `layout.css`) plus colocated component CSS files.
- Exception: `backend/src/integration.spec.ts` and `backend/src/app.e2e.spec.ts` reside at the root of `src/` as integration/e2e tests — permitted by design.
