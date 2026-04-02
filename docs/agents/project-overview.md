# Project Overview

## Summary

OCR-App is a local-first OCR and study workflow built as a monorepo:

- image upload -> OCR -> Markdown structuring
- optional TTS playback/generation
- saved document management
- document-scoped vocabulary review before DB writes
- vocabulary capture and SM-2 scheduling
- practice sessions generated and analyzed through LM Studio
- optional agentic architecture/deployment endpoints

## Current Runtime Shape

- `frontend/`: React 18 + Vite 6 UI
- `backend/gateway/`: HTTP gateway on `:3000`
- `backend/services/ocr/`: TCP OCR service on `:3901`
- `backend/services/tts/`: TCP TTS service on `:3902`
- `backend/services/document/`: TCP document service on `:3903`
- `backend/services/vocabulary/`: TCP vocabulary/practice service on `:3904`
- `backend/services/agentic/`: TCP agentic service on `:3905`
- `backend/shared/`: shared contracts and abstractions
- `services/nlp/stanza-service/`: optional Stanza FastAPI sidecar on `:8501`
- `services/tts/supertone-service/`: Supertone + Piper FastAPI sidecar on `:8100`
- `services/tts/kokoro-service/`: Kokoro FastAPI sidecar on `:8200`

## Core Capabilities

- OCR extraction through LM Studio vision OCR
- Markdown structuring through LM Studio
- saved document CRUD
- document vocabulary candidate prepare/confirm flow
- vocabulary CRUD with spaced-repetition metadata
- practice sessions with LLM-generated exercises and session analysis
- TTS through `supertone`, `piper`, and `kokoro`
- health aggregation for OCR, LM Studio, and all TTS engines
- optional agentic planning/deployment workflow

## Public HTTP API

- `POST /api/ocr`
- `GET /api/health`
- `POST /api/tts`
- `POST /api/documents`
- `GET /api/documents`
- `GET /api/documents/:id`
- `PUT /api/documents/:id`
- `DELETE /api/documents/:id`
- `POST /api/documents/:id/vocabulary/prepare`
- `POST /api/documents/:id/vocabulary/confirm`
- `POST /api/vocabulary`
- `GET /api/vocabulary`
- `GET /api/vocabulary/review/due`
- `PUT /api/vocabulary/:id`
- `DELETE /api/vocabulary/:id`
- `POST /api/practice/start`
- `POST /api/practice/answer`
- `POST /api/practice/complete`
- `GET /api/practice/sessions`
- `GET /api/practice/stats/:vocabularyId`
- `POST /api/agents/architecture`
- `POST /api/agents/deploy`

## Current Constraints

- base OCR/TTS/document/vocabulary flows are local-first
- `agentic` requires `OPENAI_API_KEY`
- browser/perf automation may run with `LM_STUDIO_SMOKE_ONLY=true`
- lightweight browser e2e exists for `Save Vocabulary` and does not require OCR/TTS sidecars
- launcher defaults currently enable Kokoro unless `scripts/linux/tts-models.conf` is changed

## Current Health Payload

`GET /api/health` returns:

- `ocrReachable`
- `ocrModels`
- `ocrDevice`
- `lmStudioReachable`
- `lmStudioModels`
- `superToneReachable`
- `kokoroReachable`
