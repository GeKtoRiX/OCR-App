# Project Overview

## Summary

Full-stack OCR web application. The user uploads an image, the backend calls the OCR sidecar, optionally structures the text, and returns the result.

## Main Components

- `frontend/`: UI built with React 18 + Vite 6.
- `backend/`: API and orchestration built with NestJS 10.
- `paddleocr-service/`: Python sidecar for OCR extraction.
- `docs/`: project and agent documentation.

## Runtime Capabilities

- OCR extraction goes through the local PaddleOCR sidecar.
- LM Studio is used for post-processing and structuring raw text from PaddleOCR.
- The `agentic` bounded context in the backend provides architecture planning and deployment workflows.

## Public APIs

- `POST /api/ocr`
- `GET /api/health`
- `POST /api/agents/architecture`
- `POST /api/agents/deploy`

## Current Agentic State

- A separate bounded context `backend/src/agentic` is present in the backend.
- Phase-based planning flow and deployment flow are implemented.
- Phase results are validated through `zod` schemas and guardrails.
- Deployment flow materialises the bundle into `AGENT_DEPLOY_ROOT`.

## Constraints

- OpenAI API key may be absent.
- The production path must support local-first or graceful fallback approaches.
- Agentic runtime must not be treated as a required dependency for the base OCR scenario.
- Documentation must describe actual API contracts, not assumed roles.
