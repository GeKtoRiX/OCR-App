# OCR Web App - Claude Code Guide

## Project Overview

OCR Web App is a local-first OCR and study workflow:

- OCR extraction from images through PaddleOCR
- Markdown structuring through LM Studio
- saved documents in SQLite
- document-scoped vocabulary candidate review before DB writes
- vocabulary capture with SM-2 scheduling
- practice sessions generated through LM Studio
- TTS through Supertone/Piper, Kokoro, F5, and Voxtral
- optional agentic planning/deployment endpoints backed by the OpenAI Agents SDK

The current backend runtime is no longer a single NestJS process. It is split into an HTTP gateway plus multiple TCP services.

## Read First

- `agents.md` - agent roles, handoff rules, working constraints
- `structure.md` - repository structure contract
- `docs/agents/architecture.md` - detailed architecture
- `docs/agents/runbook.md` - current commands and endpoint examples

## Tech Stack

- Backend: NestJS 10, CommonJS, monorepo mode
- Frontend: React 18 + Vite 6 + TypeScript
- Frontend state: Zustand stores plus local orchestration hooks
- OCR: PaddleOCR Python FastAPI sidecar on `:8000`
- NLP: optional Stanza FastAPI sidecar on `:8501` with heuristic fallback in the document service
- TTS:
  - Supertone + Piper sidecar on `:8100`
  - Kokoro sidecar on `:8200`
  - F5 sidecar on `:8300`
  - Voxtral adapter on `:8400`
- LLM: LM Studio OpenAI-compatible API on `:1234`
- Persistence: SQLite via `better-sqlite3`
- Agentic: `@openai/agents`

## Backend Topology

```text
backend/
├── gateway/          HTTP API + static frontend hosting
├── services/
│   ├── ocr/          TCP 3901
│   ├── tts/          TCP 3902
│   ├── document/     TCP 3903
│   ├── vocabulary/   TCP 3904
│   └── agentic/      TCP 3905
├── shared/           @ocr-app/shared workspace package
└── src/              reusable clean-architecture implementation reused by services
```

### Gateway

`backend/gateway` is the HTTP entrypoint:

- serves `frontend/dist`
- applies throttling
- exposes `/api/*`
- maps upstream microservice failures to HTTP responses

Main files:

- `backend/gateway/src/main.ts`
- `backend/gateway/src/app.module.ts`
- `backend/gateway/src/*/gateway-*.controller.ts`

### Services

Each TCP service is a thin Nest app that reuses the implementation under `backend/src`:

- OCR service binds OCR + LM Studio structuring
- TTS service binds all TTS ports including Voxtral
- document service binds saved document persistence plus document-scoped vocabulary candidate preparation
- vocabulary service binds vocabulary + practice persistence and LM Studio exercise generation
- agentic service binds `backend/src/agentic/*`

### Shared Package

`backend/shared` exports:

- shared domain entities
- shared domain ports
- shared value objects
- shared TCP contracts

This package is the process boundary contract between gateway and services.

## Reusable Implementation Layout

`backend/src` is still the source of truth for domain/application/infrastructure/presentation logic reused by the service apps.

```text
backend/src/
├── domain/
├── application/
├── infrastructure/
├── presentation/
└── agentic/
```

Dependency direction:

```text
domain <- application <- infrastructure / presentation
```

The `agentic` bounded context remains isolated from the OCR/TTS/document/vocabulary layers.

## Key Runtime Flows

### OCR

1. Gateway receives `POST /api/ocr`.
2. OCR TCP service validates and routes to PaddleOCR.
3. PaddleOCR returns raw text.
4. LM Studio structures raw text into Markdown.
5. Gateway returns `{ rawText, markdown, filename }`.

### Health

1. Gateway receives `GET /api/health`.
2. Gateway asks OCR service and TTS service over TCP.
3. OCR service reports PaddleOCR + LM Studio health.
4. TTS service reports Supertone, Kokoro, F5, and Voxtral health.
5. Gateway merges the payloads.

Current response fields:

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

### TTS

Gateway `POST /api/tts` accepts:

- JSON for `supertone`, `piper`, `kokoro`, `voxtral`
- multipart for `f5`

`SynthesizeSpeechUseCase` routes by engine:

- `voxtral` -> `IVoxtralTtsPort`
- `f5` -> `IF5TtsPort`
- `kokoro` -> `IKokoroPort`
- default / `supertone` / `piper` -> `ISupertonePort`

TTS validation at the gateway:

- `text` required
- max text length `5000`
- F5 `refAudio` limited to `50 MB`

### Document / Vocabulary / Practice

- documents and vocabulary/practice are split into separate services
- document DB defaults to `data/documents.sqlite`
- vocabulary/practice DB defaults to `data/vocabulary.sqlite`
- document vocabulary extraction prefers the Stanza sidecar and falls back to heuristics when it is unavailable

### Save Vocabulary

1. `Save Document` persists OCR/Markdown output.
2. `Save Vocabulary` is available only for saved documents.
3. document service prepares vocabulary candidates.
4. optional LLM review refines the prepared list.
5. frontend opens a review overlay with an embedded editor.
6. only confirmed items are written into the shared vocabulary store.

### Agentic

Gateway routes:

- `POST /api/agents/architecture`
- `POST /api/agents/deploy`

Agentic execution still lives in `backend/src/agentic/*`, but is hosted by a dedicated TCP service. It requires `OPENAI_API_KEY`.

## Frontend Structure

```text
frontend/src/
├── features/
│   ├── ocr/
│   ├── tts/
│   ├── documents/
│   ├── vocabulary/
│   ├── practice/
│   └── health/
├── shared/
│   ├── api.ts
│   ├── types.ts
│   └── lib/
├── ui/
├── view/
├── styles/
├── App.tsx
└── main.tsx
```

Current frontend architecture is not MVVM anymore. It is a feature-oriented layout with:

- Zustand stores in `features/*/*.store.ts`
- local hooks for orchestration (`useImageUpload`, `useTts`, `useResultPanel`, `useVocabContextMenu`)
- stateless shared UI primitives in `ui/`
- cross-feature composite surfaces in `view/`

### Frontend Stores

- `ocr.store.ts`: OCR request state + session history
- `documents.store.ts`: saved documents + active saved selection + vocabulary review state
- `vocabulary.store.ts`: words, due count, language pair
- `practice.store.ts`: current session and exercise flow
- `health.store.ts`: lamp color and tooltip

The result panel now exposes separate `Save Document` and `Save Vocabulary` actions.

### Frontend TTS Notes

- Voxtral is available as a frontend engine
- the frontend currently exposes only English Voxtral preset voices
- Kokoro is blocked client-side for Cyrillic input

## Launcher Notes

Launcher entry scripts:

- `scripts/linux/ocr.sh`
- `scripts/linux/tts.sh`
- `scripts/linux/ocr-tts.sh`
- `scripts/linux/stack.sh`

Shared logic:

- `scripts/linux/ocr-common.sh`

Launcher-side TTS defaults:

- configured in `scripts/linux/tts-models.conf`
- current default is Voxtral only

## Important Commands

```bash
npm run build
npm run dev:stanza
npm run smoke:stanza
npm run test:frontend
npm run test:backend
npm run test:e2e:api
npm run test:e2e:integration
npm run test:e2e:launcher
npm run test:e2e:browser
npm run test:e2e:browser:vocab
```

Manual prod-style boot:

```bash
npm run build
node backend/dist/services/ocr/src/main.js
node backend/dist/services/tts/src/main.js
node backend/dist/services/document/src/main.js
node backend/dist/services/vocabulary/src/main.js
node backend/dist/services/agentic/src/main.js
node backend/dist/gateway/main.js
```

## Key Entry Points

- Gateway bootstrap: `backend/gateway/src/main.ts`
- Gateway root module: `backend/gateway/src/app.module.ts`
- OCR service root: `backend/services/ocr/src/app.module.ts`
- TTS service root: `backend/services/tts/src/app.module.ts`
- Document service root: `backend/services/document/src/app.module.ts`
- Vocabulary service root: `backend/services/vocabulary/src/app.module.ts`
- Agentic service root: `backend/services/agentic/src/app.module.ts`
- Frontend root: `frontend/src/App.tsx`

## Current Constraints

- Base OCR/TTS/document/vocabulary flows are local-first.
- `agentic` still requires `OPENAI_API_KEY`; there is no graceful degraded HTTP response yet.
- Build artifacts are not source of truth.
- LM Studio smoke-only mode exists for browser/perf automation via `LM_STUDIO_SMOKE_ONLY=true`.
- Voxtral remains optional and may stay unavailable on some AMD/ROCm setups.
