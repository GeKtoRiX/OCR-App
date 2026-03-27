# Project Structure Contract

This document defines the target and permitted repository structure. If the actual file tree diverges from it, update the document first or bring the code into the described form.

## Root

Permitted root directories and files:

- `backend/`: NestJS backend.
- `frontend/`: React/Vite frontend.
- `services/`: Python sidecar services.
  - `ocr/paddleocr-service/`: Python OCR sidecar (PaddleOCR, port 8000).
  - `tts/supertone-service/`: Python TTS sidecar (Supertone + Piper, port 8100).
  - `tts/kokoro-service/`: Python TTS sidecar (Kokoro, port 8200).
  - `tts/f5-service/`: Python TTS sidecar (F5, port 8300).
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
  - `f5/*.service.ts`
  - `testing/*.service.ts`
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

Frontend source code lives in `frontend/src/`. Architecture: Zustand stores + feature-sliced
layout (FSD-inspired, without strict layer isolation rules).

### Layout

- `features/`: domain-specific code, each subfolder owns its store, hooks, and components.
  - `ocr/`: `ocr.store.ts`, `useImageUpload.ts`, `DropZone.tsx` + colocated CSS and specs.
  - `tts/`: `useTts.ts` + spec.
  - `documents/`: `documents.store.ts` + spec.
  - `vocabulary/`: `vocabulary.store.ts`, `useVocabContextMenu.ts`,
    `VocabularyPanel.tsx`, `VocabContextMenu.tsx`, `VocabAddForm.tsx` + colocated CSS and specs.
  - `practice/`: `practice.store.ts`, `PracticeView.tsx` + colocated CSS and specs.
  - `health/`: `health.store.ts` + spec.
- `shared/`: cross-feature utilities with no upward dependencies.
  - `api.ts`: all HTTP fetch wrappers (single file, not split).
  - `types.ts`: all TypeScript types and constants.
  - `lib/`: `health-status.ts`, `text-utils.ts`, `clipboard.ts` + colocated specs.
- `ui/`: stateless presentational primitives used across features.
  - `StatusBar.tsx`, `StatusLight.tsx` + colocated CSS and specs.
- `view/`: cross-feature composite components that span multiple feature domains.
  - `ResultPanel.tsx`, `TtsPanel.css`, `useResultPanel.ts` + colocated CSS and specs.
  - `HistoryPanel.tsx` + colocated CSS and spec.
- `styles/`: global CSS (`base.css`, `layout.css`).
- `App.tsx`, `main.tsx`, `test-setup.ts`, `vite-env.d.ts`.

### State Management

Zustand stores (`features/*/`). Stores are singletons; AbortControllers and timers are
closure variables inside `create()` — not part of Zustand state — so resets in tests do not
orphan live requests or dangling timers. Health polling runs in a `useEffect` in `App.tsx`.

### Rules

- `features/*` may import from `shared/` and `ui/`. Cross-feature imports are allowed but
  should go through `shared/` when possible.
- `view/` components import from `features/` stores and `ui/` primitives.
- `App.tsx` orchestrates layout, health polling, and cross-feature coordination.
- No path aliases — all imports use relative paths.

Files are named by responsibility:

- Components: `PascalCase.tsx`
- Stores: `*.store.ts`
- Hooks: `use*.ts`
- Tests: `*.spec.ts` / `*.spec.tsx`
- CSS: colocated with their component.

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
- `smoke_test.py`: smoke test for startup, `/health`, and synthesis.
- `requirements.txt`: Python deps.

### F5 (`f5-service/`)

- `main.py`: FastAPI TTS service entry point (F5 TTS).
- `smoke_test.py`: smoke test for startup, `/health`, and synthesis.
- `requirements.txt`: Python deps.

## Scripts

- `scripts/linux/ocr-common.sh`: shared Linux launcher logic used by the dedicated entry scripts.
- `scripts/linux/ocr.sh`: OCR launcher entry (PaddleOCR + Kokoro + LM Studio + backend).
- `scripts/linux/tts.sh`: TTS launcher entry (PaddleOCR + Supertone/Piper + Kokoro + F5 + backend).
- `scripts/linux/ocr-tts.sh`: full-stack launcher entry (OCR + TTS + LM Studio + backend).
- `scripts/e2e/prepare-browser-env.sh`: rebuilds frontend/backend and resets the temp browser-e2e SQLite database.
- `scripts/e2e/stop-browser-env.sh`: kills the production-like browser e2e stack on ports 3000/8000/8100/8200/8300.
- `scripts/perf/`: Phase 4 benchmark harness (`api-benchmark.mjs`, `browser-benchmark.mjs`, `run-phase4.sh`, `shared.mjs`).

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
- Architecture violations resolved: `HealthCheckUseCase` and `TtsController` now depend exclusively on domain ports (ADR-007, 008). `TtsController` accepts multipart into memory and does not manage temp files in presentation.
- `DatabaseModule` owns the SQLite connection singleton; `DocumentModule` and `VocabularyModule` import it (ADR-009).
- New domain entities: `SavedDocument`, `VocabularyWord`, `PracticeSession`, `ExerciseAttempt`.
- New domain ports: `IPaddleOcrHealthPort`, `ILmStudioHealthPort`, `ISupertonePort`, `IKokoroPort`, `IF5TtsPort`, `ISavedDocumentRepository`, `IVocabularyRepository`, `IPracticeSessionRepository`, `IVocabularyLlmService`.
- New application use cases: `SynthesizeSpeechUseCase`, `SavedDocumentUseCase`, `VocabularyUseCase`, `PracticeUseCase`.
- New application utils: `sm2.ts` (SM-2 spaced repetition algorithm).
- New infrastructure: `SqliteConnectionProvider`, `SqliteSavedDocumentRepository`, `SqliteVocabularyRepository`, `SqlitePracticeSessionRepository`, `KokoroService`, `F5TtsService`, `LMStudioVocabularyService`, configs for SQLite/Kokoro/F5 TTS.
- New presentation modules: `DatabaseModule`, `DocumentModule`, `VocabularyModule` + controllers and DTOs.
- New frontend hooks: `useTts`, `useResultPanel`, `useSavedDocuments`, `useVocabulary`, `usePractice`.
- New frontend views: `VocabularyPanel`, `VocabContextMenu`, `VocabAddForm`, `PracticeView`.
- CSS moved to `frontend/src/styles/` (`base.css`, `layout.css`) plus colocated component CSS files.
- Exception: `backend/src/integration.spec.ts` and `backend/src/app.e2e.spec.ts` reside at the root of `src/` as integration/e2e tests — permitted by design.

## Audit Result On 2026-03-27

- Frontend refactored: `model/` and `viewmodel/` directories removed. New layout: `features/`,
  `shared/`, `ui/`, `view/` (see Frontend section above).
- `zustand` added as a frontend dependency (`^5.0.12`). Five Zustand stores introduced:
  `ocr.store.ts` (OCR + session history), `documents.store.ts` (saved docs + active selection),
  `vocabulary.store.ts` (words + SRS metadata), `practice.store.ts` (session state machine),
  `health.store.ts` (health-light color/tooltip).
- `useAppOrchestrator` god-hook deleted. `App.tsx` reads stores directly and coordinates
  health polling via `useEffect`.
- `HistoryPanel` is now a zero-prop component; reads all five stores directly — eliminates
  the 26-prop drilling that previously went through `App.tsx`.
- AbortController (`ocr.store.ts`) and save-status timer (`documents.store.ts`) are closure
  variables inside `create()`, not Zustand state, so store resets in tests are safe.
- All 22 frontend test files updated/rewritten; store tests use `getState()` / `setState()`
  directly without `renderHook`. All tests pass.
