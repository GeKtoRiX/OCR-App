# Project Overview

## Summary

Full-stack OCR web application. The user uploads an image, the backend calls the OCR sidecar, optionally structures the text, and returns the result. Users can save OCR results as documents, build a vocabulary list with spaced repetition scheduling, and practice vocabulary through interactive exercises.

## Main Components

- `frontend/`: UI built with React 18 + Vite 6 (MVVM: model / viewmodel / view).
- `backend/`: API and orchestration built with NestJS 10 (Clean/Hexagonal Architecture).
- `services/ocr/paddleocr-service/`: Python sidecar for OCR extraction (port 8000).
- `services/tts/supertone-service/`: Python sidecar for Supertone TTS synthesis (port 8100).
- `services/tts/kokoro-service/`: Python sidecar for Kokoro TTS synthesis (port 8200, ONNX Runtime backend with ROCm->CPU fallback).
- `services/tts/f5-service/`: Python sidecar for F5 TTS synthesis (port 8300).
- `docs/`: project and agent documentation.

## Runtime Capabilities

- OCR extraction via local PaddleOCR sidecar; LM Studio structures raw OCR text into Markdown.
- Saved documents: OCR results can be saved and managed via REST.
- Vocabulary system: words extracted from documents, stored with SRS metadata (SM-2 algorithm).
- Practice sessions: LM Studio generates exercises (fill_blank, spelling, multiple_choice, context_sentence); session analysis returned on completion.
- TTS synthesis: Supertone, Piper, Kokoro, and F5 TTS engines available. Piper shares the Supertone sidecar.
- Frontend: inline text editing, collapsible TTS panel, session history, vocabulary panel, practice modal.
- Agentic bounded context: architecture planning and deployment workflows via OpenAI Agents SDK.

## Public APIs

- `POST /api/ocr` — process image → OCR + Markdown
- `GET /api/health` — health check returning `{ paddleOcrReachable, paddleOcrModels, paddleOcrDevice, lmStudioReachable, lmStudioModels, superToneReachable, kokoroReachable, f5TtsReachable, f5TtsDevice }`
- `POST /api/tts` — synthesize text to WAV; `engine` selects Supertone (default) / Piper / Kokoro / F5
- `POST /api/documents` — save OCR result as document
- `GET /api/documents` — list saved documents
- `GET /api/documents/:id` — get document by ID
- `PUT /api/documents/:id` — update document markdown
- `DELETE /api/documents/:id` — delete document
- `POST /api/vocabulary` — add vocabulary word
- `GET /api/vocabulary` — list vocabulary (filter by language pair)
- `PUT /api/vocabulary/:id` — update translation/context
- `DELETE /api/vocabulary/:id` — delete word
- `POST /api/practice/start` — start a practice session
- `POST /api/practice/answer` — submit an exercise answer
- `POST /api/practice/complete` — complete session + get LLM analysis
- `GET /api/practice/sessions` — recent sessions
- `GET /api/practice/stats/:vocabularyId` — attempt history for a word
- `POST /api/agents/architecture` — run 3-phase planning
- `POST /api/agents/deploy` — materialize agent ecosystem on disk

## Current Agentic State

- A separate bounded context `backend/src/agentic` is present in the backend.
- Phase-based planning flow and deployment flow are implemented.
- Phase results are validated through `zod` schemas and guardrails.
- Deployment flow materialises the bundle into `AGENT_DEPLOY_ROOT`.

## Constraints

- OpenAI API key may be absent; agentic runtime must not be a required dependency for the base OCR scenario. At present the base OCR/TTS app stays alive, while `/api/agents/*` returns 5xx when the key is absent.
- The production path must support local-first or graceful fallback approaches.
- Documentation must describe actual API contracts, not assumed roles.
