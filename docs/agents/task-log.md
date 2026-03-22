# Task Log

## Purpose

Short memory of recent significant changes, allowing quick context recovery at the start of the next task.

## Latest Significant Update

### 2026-03-21 - Phase 3/4 Completion, Architecture Boundary Cleanup, Documentation Refresh

**Browser e2e and LM Studio test harness**

- Browser TTS e2e was stabilised by waiting on the real `POST /api/tts` response, the generate button re-enable, and the audio player visibility instead of comparing `blob:` URLs.
- Production-like browser e2e and perf harnesses now run with `LM_STUDIO_SMOKE_ONLY=true` and a temporary SQLite database at `tmp/test-db/browser-e2e.sqlite`.
- Added test-only adapters: `PassthroughStructuringService` and `StubVocabularyLlmService` so browser/perf runs do not send real LM Studio content-generation requests. LM Studio remains covered via its own smoke path.

**Runtime and architecture fixes**

- `services/tts/supertone-service/main.py` now auto-falls back from ROCm to CPU when real inference fails with GPU runtime errors such as `hipErrorInvalidDeviceFunction`; manual startup no longer fails the whole TTS path on this hardware.
- Frontend MVVM boundary tightened: `frontend/src/viewmodel/useResultPanel.ts` now owns copy/edit/tab/TTS/vocabulary orchestration, leaving `ResultPanel.tsx` rendering-focused.
- Backend presentation boundary tightened: `TtsController` now accepts `refAudio` via `memoryStorage()` and forwards typed in-memory payloads to `SynthesizeSpeechUseCase`; temp-file infrastructure was removed from presentation.

**Phase 4 baseline**

- Added perf harness scripts: `scripts/perf/api-benchmark.mjs`, `scripts/perf/browser-benchmark.mjs`, `scripts/perf/shared.mjs`, `scripts/perf/run-phase4.sh`.
- Warm baseline recorded on 2026-03-21:
  - API: OCR `p50 2054.70 ms`, Supertone `141.99 ms`, Piper `261.41 ms`, Kokoro `527.82 ms`, F5 `1174.91 ms`
  - Browser: page load `101.15 ms`, upload-to-result `3200.25 ms`, full workflow `7194.23 ms`

**Documentation**

- Updated `README.md`, `agents.md`, `CLAUDE.md`, `structure.md`, and `docs/agents/*` to reflect current commands, route contracts, perf tooling, LM Studio smoke-only automation behavior, and the latest architecture boundaries.

### 2026-03-21 - Architecture Enforcement Refactoring + Full Documentation Update

**Problem:** Three structural violations existed where concrete infrastructure classes were imported directly into application/presentation layers, bypassing the port abstraction boundary. Additionally, vocabulary, document, practice, Kokoro, and Qwen TTS domains added in a previous session were not reflected in any documentation.

**Backend changes (no business logic changed):**

- **ADR-007 — Health port split:** Removed generic `IHealthCheckPort`. Created named domain ports: `IPaddleOcrHealthPort`, `ILmStudioHealthPort`, `ISupertonePort`, `IKokoroPort`, `IF5TtsPort`. Each concrete service now declares `extends <Port>`. `HealthCheckUseCase` now imports only from `domain/ports/` — the application→infrastructure violation is eliminated.
- **ADR-008 — SynthesizeSpeechUseCase:** Created `application/use-cases/synthesize-speech.use-case.ts` with engine-routing logic (previously in `TtsController`). `TtsController` now injects only `SynthesizeSpeechUseCase`; HTTP validation stays in the controller. New `synthesize-speech.use-case.spec.ts` covers routing. `tts.controller.spec.ts` updated to mock the use case.
- **ADR-009 — DatabaseModule:** Created `presentation/modules/database.module.ts` owning `SqliteConfig` + `SqliteConnectionProvider`. `DocumentModule` and `VocabularyModule` both import it. `VocabularyModule` no longer imports `DocumentModule`. `AppModule` imports `DatabaseModule` at root for singleton guarantee.
- `OcrModule` now binds and exports `IPaddleOcrHealthPort` and `ILmStudioHealthPort` tokens. `TtsModule` now binds and exports `ISupertonePort`, `IKokoroPort`, `IF5TtsPort` tokens and provides `SynthesizeSpeechUseCase`.
- `health-check.use-case.spec.ts` updated: mock types changed to port abstract classes.

**Test result:** 252 tests pass, 40 suites, zero failures.

**Documentation:**
- `CLAUDE.md` — full rewrite: all new domains, ports, modules, API endpoints, env vars, TTS engines.
- `agents.md` — updated roles and architecture overview.
- `structure.md` — all new files added.
- `docs/agents/adr.md` — ADR-007, 008, 009 added.
- `docs/agents/architecture.md` — full rewrite: new ports, TTS pipeline, document/vocabulary/practice pipelines, updated module map.
- `docs/agents/context.md` — snapshot updated to 2026-03-21, confirmed facts updated, new risks noted.
- `docs/agents/file-map.md` — all new files added.
- `docs/agents/project-overview.md` — updated.
- `docs/agents/runbook.md` — document/vocabulary/practice endpoints added.
- `README.md` — Kokoro/Qwen setup added, new API endpoints documented.

### 2026-03-19 - Vocabulary, Document, Practice Domains + Kokoro TTS (Qwen TTS later removed)

**Backend:**
- New domain: `saved-document` (entity, port, use case, SQLite repo, controller, module).
- New domain: `vocabulary` (entity with SRS fields, port, use case, SQLite repo, controller, module, LMStudio vocabulary service with exercise generation and SM-2 scheduling).
- New domain: `practice` (session + attempt entities, ports, use case with SM-2 algorithm, SQLite repo, controller).
- New infrastructure: `SqliteConnectionProvider` (better-sqlite3, WAL mode), `SqliteConfig`.
- New TTS engines: `KokoroService` (port 8200) with config. (Qwen TTS was added here but later replaced by F5 TTS.)
- `HealthCheckUseCase` updated to include `kokoroReachable`.
- `VocabularyModule`, `DocumentModule` added to `AppModule`.
- `application/utils/sm2.ts` — SM-2 spaced repetition algorithm implementation.

**Frontend:**
- `HistoryPanel` — 3-tab panel (Session, Saved, Vocab) with health light and practice launch.
- `VocabularyPanel`, `VocabContextMenu`, `VocabAddForm` — vocabulary management UI.
- `PracticeView` — modal for practice sessions (fill_blank, spelling, multiple_choice).
- `useSavedDocuments`, `useVocabulary`, `usePractice` hooks.
- `useTts` — extended to support Kokoro and F5 engines.
- `useHealthStatus` — Kokoro and F5 health signals included in lamp logic.

### 2026-03-19 - Supertone TTS Integration, Edit Mode, Live Status Lamp

**Supertone TTS sidecar (`services/tts/supertone-service/`)**
- Complete Python FastAPI sidecar using `pip install supertonic` (ONNX Runtime, NOT PyTorch/transformers).
- Model: `supertonic-2`. Voices: M1–M5, F1–F5. Languages: en/ko/es/pt/fr. Output: 44100 Hz WAV.
- GPU via `onnxruntime-rocm 1.22.2`. GPU provider list patched **in-place** (`.clear()` + `.extend()`) — reassignment fails because `loader.py` holds a reference to the original list object.

**Backend:**
- New: `infrastructure/config/supertone.config.ts`, `infrastructure/supertone/supertone.service.ts`.
- New: `presentation/controllers/tts.controller.ts` (POST /api/tts), `presentation/modules/tts.module.ts`.

**Frontend:**
- `ResultPanel.tsx` — inline edit mode; collapsible TTS settings panel.
- `useSessionHistory.ts`, `HistoryPanel.tsx` — session history tracking.

### 2026-03-19 - Frontend Redesign, Scripts Cleanup

- Frontend fully redesigned: dark theme (`#1b1e26` base), minimalist layout.
- `scripts/linux/ocr.sh`, `scripts/linux/tts.sh`, `scripts/linux/ocr-tts.sh` — dedicated lifecycle entry scripts with shared common launcher logic and live status lamp.

### 2026-03-19 - Removed Docker

- Deleted Docker artifacts. App runs as direct Node.js process.

## Open Questions

- Should `agentic` degrade gracefully (503 instead of crash) when `OPENAI_API_KEY` is absent?
- Are task queuing, status storage and persistence needed for agent workflows?
- Should the LM Studio structuring system prompt be externalised to env/config?
- Is a centralised HTTP request/response logger needed for production debugging?
- Should `LMStudioConfig` + `LMStudioClient` be extracted to a shared `LmStudioModule`?

## Update Rule

- Update this file after significant architectural changes.
- Do not record minor cosmetic edits here.
