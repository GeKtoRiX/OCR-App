# ADR Register

## ADR-001: Keep OCR Backend In Clean/Hexagonal NestJS Structure

- Status: accepted
- Context: OCR API, health check and integrations must evolve without mixing domain logic and infrastructure.
- Decision: backend preserves the `domain`, `application`, `infrastructure`, `presentation` layers.
- Consequence: new services and controllers must fit into the existing layers and must not bypass them.

## ADR-002: Isolate Agentic Runtime In Separate Bounded Context

- Status: accepted
- Context: agent orchestration and deployment workflow must not blur the core OCR backend.
- Decision: all agent-related code lives in `backend/src/agentic/*`.
- Consequence: agentic changes must be documented separately and must not break the OCR runtime.

## ADR-003: Default OCR Path Is PaddleOCR Sidecar

- Status: accepted
- Context: the base OCR path must work locally without mandatory cloud key dependencies.
- Decision: OCR always goes through the PaddleOCR sidecar; LM Studio is used only to structure raw text after OCR.
- Consequence: production and dev runbooks must cover the sidecar scenario first.

## ADR-004: Agent Handoffs Must Be Schema-Driven

- Status: accepted
- Context: phase outputs between analyze/scaffold/initialize/deploy must be reproducible and validatable.
- Decision: handoff contracts are defined via `zod` schemas and DTOs.
- Consequence: any change to a phase payload requires simultaneous updates to both code and documentation.

## ADR-005: Documentation Is Part Of Runtime Safety

- Status: accepted
- Context: autonomous agent operation is impossible without explicit descriptions of structure, current status and decisions.
- Decision: `agents.md`, `structure.md`, `docs/agents/context.md`, `docs/agents/adr.md` are mandatory operational documents.
- Consequence: architectural changes are not considered complete without updating these files.

## ADR-006: Supertone TTS As A Separate Python Sidecar

- Status: accepted
- Context: TTS synthesis requires ONNX Runtime (ROCm GPU) and Python-specific libraries (`supertonic`). Embedding this in the NestJS backend would violate the language boundary and the clean architecture principle.
- Decision: Supertone TTS runs as a standalone Python FastAPI sidecar (`services/tts/supertone-service/`, port 8100), following the same sidecar pattern as PaddleOCR. The NestJS backend communicates with it via HTTP (`SupertoneService`).
- Consequence: `TtsModule` must export TTS port tokens; `HealthModule` must import `TtsModule` to access them. The GPU provider list must be mutated in-place (`.clear()` + `.extend()`) rather than reassigned, because `supertonic/loader.py` holds a reference to the original list object.

## ADR-007: Split IHealthCheckPort Into Per-Service Health Ports

- Status: accepted
- Context: `HealthCheckUseCase` was directly importing five concrete infrastructure classes (`LMStudioClient`, `PaddleOCRHealthService`, `SupertoneService`, `KokoroService`, `QwenTtsService`), violating the dependency inversion principle. The generic `IHealthCheckPort` (`isReachable`, `listModels`) did not cover all health contracts — `PaddleOCRHealthService` also provides `getDevice()`, and TTS services expose `checkHealth()` / `getHealth()` which differ per engine.
- Decision: replace the single `IHealthCheckPort` with five named ports in `domain/ports/`:
  - `IPaddleOcrHealthPort` — `isReachable()`, `listModels()`, `getDevice()`
  - `ILmStudioHealthPort` — `isReachable()`, `listModels()`
  - `ISupertonePort` — `synthesize()`, `checkHealth()`
  - `IKokoroPort` — `synthesize()`, `checkHealth()`
  - `IQwenTtsPort` — `synthesize()`, `getHealth()`
  `HealthCheckUseCase` now depends exclusively on these ports. The old `health-check.port.ts` is deleted.
- Consequence: each concrete infrastructure service must declare `extends <Port>`. `OcrModule` and `TtsModule` bind port tokens via `useExisting` and export the port abstract classes for `HealthModule` to resolve.

## ADR-008: Introduce SynthesizeSpeechUseCase To Remove Controller→Infrastructure Coupling

- Status: accepted
- Context: `TtsController` was directly injecting and calling three infrastructure services (`SupertoneService`, `QwenTtsService`, `KokoroService`) with engine-routing logic inside the controller. Presentation layer must contain no business logic.
- Decision: create `SynthesizeSpeechUseCase` in `application/use-cases/` that injects `ISupertonePort`, `IKokoroPort`, `IQwenTtsPort` and encapsulates all engine routing. `TtsController` injects only `SynthesizeSpeechUseCase` and delegates synthesis; HTTP input validation (`qwenMode` guard, text length checks) stays in the controller as a presentation concern.
- Consequence: `TtsModule` must provide `SynthesizeSpeechUseCase` and all three port bindings. `tts.controller.spec.ts` mocks the use case, not the services. A new `synthesize-speech.use-case.spec.ts` covers routing logic.

## ADR-009: Introduce DatabaseModule To Own The SQLite Connection Singleton

- Status: accepted
- Context: `VocabularyModule` imported `DocumentModule` solely to reuse `SqliteConnectionProvider` and `SqliteConfig`, creating semantic cross-module coupling (document business concerns mixing with vocabulary DI needs).
- Decision: create `DatabaseModule` in `presentation/modules/` that provides and exports `SqliteConfig` and `SqliteConnectionProvider`. Both `DocumentModule` and `VocabularyModule` import `DatabaseModule`. `AppModule` also imports `DatabaseModule` at the root to guarantee a single shared SQLite connection singleton across all feature modules.
- Consequence: `DocumentModule` no longer exports the SQLite providers. `VocabularyModule` no longer imports `DocumentModule`.
