# Architecture

## Runtime Topology

```text
Frontend (React/Vite)
  -> HTTP gateway :3000
       -> OCR service        :3901 -> LM Studio :1234
       -> TTS service        :3902 -> Supertone/Piper :8100
       |                               Kokoro          :8200
       -> Document service   :3903 -> SQLite + optional Stanza :8501
       |                                   + optional BERT     :8502
       -> Vocabulary service :3904 -> SQLite + LM Studio
       -> Agentic service    :3905 -> OpenAI Agents SDK
```

## Backend Shape

- `backend/gateway` is the only HTTP entrypoint.
- `backend/services/*` hosts one TCP Nest app per bounded context.
- `backend/shared` is the cross-process contract package.
- `backend/src` holds reusable business logic and integrations consumed by service apps.

## Dependency Rules

Inside `backend/src`:

```text
domain <- application <- infrastructure / presentation
```

Additional guardrails:

- `backend/gateway` stays HTTP-only.
- `backend/shared` contains contracts, shared entities, ports, and value objects.
- `backend/services/*` binds service-local Nest apps to shared and local abstractions.
- `agentic` stays isolated from OCR, TTS, document, and vocabulary core flows.

## Public HTTP Surface

- `POST /api/ocr`
- `GET /api/health`
- `POST /api/tts`
- `POST /api/ai/chat`
- `POST /api/documents`
- `GET /api/documents`
- `GET /api/documents/:id`
- `PUT /api/documents/:id`
- `DELETE /api/documents/:id`
- `POST /api/documents/:id/vocabulary/prepare`
- `POST /api/documents/:id/vocabulary/confirm`
- `POST /api/editor/uploads/images`
- `POST /api/vocabulary`
- `POST /api/vocabulary/batch`
- `GET /api/vocabulary`
- `GET /api/vocabulary/review/due`
- `GET /api/vocabulary/:id`
- `PUT /api/vocabulary/:id`
- `DELETE /api/vocabulary/:id`
- `POST /api/practice/start`
- `POST /api/practice/plan`
- `POST /api/practice/round`
- `POST /api/practice/answer`
- `POST /api/practice/complete`
- `GET /api/practice/sessions`
- `GET /api/practice/stats/:vocabularyId`
- `POST /api/agents/architecture`
- `POST /api/agents/deploy`

## Key Flows

### OCR

`POST /api/ocr` -> gateway -> OCR service -> LM Studio -> `{ rawText, markdown, filename }`

### TTS

`POST /api/tts` -> gateway -> TTS service -> `SynthesizeSpeechUseCase` -> Supertone/Piper or Kokoro

### Health

`GET /api/health` -> gateway -> OCR and TTS services -> merged payload

Health fields currently include:

- `ocrReachable`
- `ocrModels`
- `ocrDevice`
- `lmStudioReachable`
- `lmStudioModels`
- `superToneReachable`
- `kokoroReachable`

### Documents And Vocabulary

`/api/documents` -> gateway -> document service -> `data/documents.sqlite`

`POST /api/documents/:id/vocabulary/prepare` -> document service -> Stanza or heuristics -> optional BERT scoring -> optional LLM review -> candidate storage

`POST /api/documents/:id/vocabulary/confirm` -> document service -> vocabulary service -> `data/vocabulary.sqlite`

### Practice

`/api/practice/*` -> gateway -> vocabulary service -> SQLite repositories + LM Studio generation/analysis + SM-2 updates

### Agentic

`/api/agents/*` -> gateway -> agentic service -> `backend/src/agentic/*`

This path still depends on `OPENAI_API_KEY`.

## Frontend Shape

`frontend/src` is feature-oriented:

- `features/` for stores and feature-local UI
- `shared/` for API wrappers, types, and pure utilities
- `ui/` for shared presentational primitives
- `view/` for cross-feature composition surfaces

Do not reintroduce `model/` or `viewmodel/`.

## Key Entry Points

- `backend/gateway/src/main.ts`
- `backend/gateway/src/app.module.ts`
- `backend/services/ocr/src/main.ts`
- `backend/services/tts/src/main.ts`
- `backend/services/document/src/main.ts`
- `backend/services/vocabulary/src/main.ts`
- `backend/services/agentic/src/main.ts`
- `frontend/src/App.tsx`
- `scripts/linux/ocr.sh`
- `scripts/mcp-vocab-server.js`
