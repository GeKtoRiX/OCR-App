# Architecture

## Runtime Topology

```text
Frontend
  -> HTTP gateway :3000
       -> OCR service        :3901 -> PaddleOCR :8000
       -> TTS service        :3902 -> Supertone/Piper :8100
       |                               Kokoro          :8200
       |                               F5              :8300
       |                               Voxtral         :8400
       -> Document service   :3903 -> SQLite
       -> Vocabulary service :3904 -> SQLite + LM Studio
       -> Agentic service    :3905 -> OpenAI Agents SDK

LM Studio is used by OCR/vocabulary flows on :1234
```

## Backend Architecture

The backend is split into:

- `backend/gateway`: HTTP API and static frontend hosting
- `backend/services/*`: dedicated TCP apps per bounded responsibility
- `backend/shared`: shared entities, ports, value objects, and TCP contracts
- `backend/src`: reusable clean-architecture implementation consumed by the service apps

### Clean-Architecture Rule

Inside `backend/src`:

```text
domain <- application <- infrastructure / presentation
```

`agentic` remains isolated from the OCR/TTS/document/vocabulary layers.

## Gateway

Responsibilities:

- validate HTTP request shape
- perform multipart handling for F5 uploads
- proxy to TCP services through shared contracts
- map upstream failures into HTTP responses
- serve `frontend/dist`
- apply throttling

Important files:

- `backend/gateway/src/app.module.ts`
- `backend/gateway/src/main.ts`
- `backend/gateway/src/ocr/gateway-ocr.controller.ts`
- `backend/gateway/src/tts/gateway-tts.controller.ts`
- `backend/gateway/src/document/gateway-document.controller.ts`
- `backend/gateway/src/vocabulary/gateway-vocabulary.controller.ts`
- `backend/gateway/src/practice/gateway-practice.controller.ts`
- `backend/gateway/src/health/gateway-health.controller.ts`
- `backend/gateway/src/agentic/gateway-agentic.controller.ts`

## Shared Package

`backend/shared` contains the process boundary:

- domain entities
- domain ports
- uploaded-file value object
- TCP pattern constants and payload/response contracts

Examples:

- `OCR_PATTERNS`
- `TTS_PATTERNS`
- `DOCUMENT_PATTERNS`
- `VOCABULARY_PATTERNS`
- `AGENTIC_PATTERNS`

## Service Apps

### OCR Service

- port `3901`
- owns OCR extraction and Markdown structuring
- reuses `ProcessImageUseCase`
- binds PaddleOCR and LM Studio abstractions
- respects `LM_STUDIO_SMOKE_ONLY=true` by swapping in passthrough structuring

### TTS Service

- port `3902`
- reuses `SynthesizeSpeechUseCase`
- binds Supertone, Kokoro, F5, and Voxtral ports

### Document Service

- port `3903`
- reuses saved document use cases and SQLite repository

### Vocabulary Service

- port `3904`
- owns vocabulary CRUD, due review lookup, practice sessions, and LM Studio exercise generation

### Agentic Service

- port `3905`
- hosts the `backend/src/agentic/*` bounded context

## Domain Ports

Current key ports:

- `IOCRService`
- `ITextStructuringService`
- `IPaddleOcrHealthPort`
- `ILmStudioHealthPort`
- `ISupertonePort`
- `IKokoroPort`
- `IF5TtsPort`
- `IVoxtralTtsPort`
- `ISavedDocumentRepository`
- `IVocabularyRepository`
- `IPracticeSessionRepository`
- `IVocabularyLlmService`

## OCR Flow

```text
POST /api/ocr
  -> gateway OCR controller
  -> OCR TCP service
  -> PaddleOCR sidecar /api/extract/base64
  -> LM Studio structuring
  -> { rawText, markdown, filename }
```

## TTS Flow

```text
POST /api/tts
  -> gateway TTS controller
  -> TTS TCP service
  -> SynthesizeSpeechUseCase
       voxtral -> IVoxtralTtsPort
       f5      -> IF5TtsPort
       kokoro  -> IKokoroPort
       default -> ISupertonePort
  -> audio/wav
```

Gateway-level TTS validation:

- `text` required
- max length `5000`
- F5 upload limit `50 MB`

## Health Flow

```text
GET /api/health
  -> gateway health controller
  -> OCR TCP service health
  -> TTS TCP service health
  -> merged payload
```

Returned health fields:

- `paddleOcrReachable`
- `paddleOcrModels`
- `paddleOcrDevice`
- `lmStudioReachable`
- `lmStudioModels`
- `superToneReachable`
- `kokoroReachable`
- `f5TtsReachable`
- `f5TtsDevice`
- `voxtralReachable`
- `voxtralDevice`

## Document / Vocabulary / Practice Flows

### Documents

```text
/api/documents
  -> gateway
  -> document TCP service
  -> SQLite document repository
```

### Vocabulary / Practice

```text
/api/vocabulary
/api/practice/*
  -> gateway
  -> vocabulary TCP service
  -> SQLite vocabulary + practice repositories
  -> LM Studio exercise generation / analysis when needed
  -> SM-2 updates
```

SQLite defaults:

- document DB: `data/documents.sqlite`
- vocabulary/practice DB: `data/vocabulary.sqlite`

## Agentic Bounded Context

Source layout:

```text
backend/src/agentic/
├── core/
├── agents/
├── tools/
├── guardrails/
├── application/
└── presentation/
```

HTTP routes go through the gateway, but execution is hosted by the dedicated agentic service.

Current limitation:

- without `OPENAI_API_KEY`, `/api/agents/*` still fails instead of returning a graceful degraded response

## Frontend Architecture

Current frontend is feature-oriented, not MVVM.

```text
frontend/src/
├── features/
├── shared/
├── ui/
├── view/
└── styles/
```

### Stores

- `features/ocr/ocr.store.ts`
- `features/documents/documents.store.ts`
- `features/vocabulary/vocabulary.store.ts`
- `features/practice/practice.store.ts`
- `features/health/health.store.ts`

### Local Hooks

- `features/ocr/useImageUpload.ts`
- `features/tts/useTts.ts`
- `features/vocabulary/useVocabContextMenu.ts`
- `view/useResultPanel.ts`

### Health Lamp Semantics

- `red`: PaddleOCR unreachable
- `yellow`: PaddleOCR reachable on CPU
- `blue`: PaddleOCR GPU plus LM Studio, Supertone, Kokoro, and F5 all healthy; Voxtral is informational and does not block blue
- `green`: PaddleOCR GPU healthy but some baseline dependency is missing

### Frontend TTS Notes

- Voxtral is exposed as a frontend engine
- the frontend currently shows only `VOXTRAL_EN_VOICES`
- Kokoro is rejected client-side for Cyrillic input

## Launcher Architecture

- `scripts/linux/ocr-common.sh` contains shared lifecycle logic
- `scripts/linux/tts-models.conf` controls which TTS sidecars start by default
- current default is Voxtral only

Supported launcher entries:

- `ocr.sh`
- `tts.sh`
- `ocr-tts.sh`
- `stack.sh`
