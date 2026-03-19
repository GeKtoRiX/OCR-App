# Runbook

## Development

```bash
npm run dev:paddleocr
npm run smoke:paddleocr
npm run dev:backend
npm run dev:frontend
```

## Build

```bash
npm run build
```

## Backend Tests

```bash
npm test --workspace=backend
npm run test:e2e --workspace=backend
```

## Frontend Tests

```bash
npm test --workspace=frontend
```

## Production

```bash
npm run build
node backend/dist/main.js
```

## Lifecycle Script (Linux/macOS)

```bash
bash scripts/linux/ocr.sh start   # build if needed, start backend
bash scripts/linux/ocr.sh stop    # stop backend
bash scripts/linux/ocr.sh wipe    # stop + remove all build artifacts
bash scripts/linux/ocr.sh status  # env, service health, process state
```

## Public Endpoints

### OCR

```bash
curl -X POST http://localhost:3000/api/ocr \
  -F "image=@image_test.jpg"
```

### Health

```bash
curl http://localhost:3000/api/health
```

### Agentic Architecture

```bash
curl -X POST http://localhost:3000/api/agents/architecture \
  -H "Content-Type: application/json" \
  -d "{\"request\":\"Design an autonomous agent ecosystem\"}"
```

### Agentic Deploy

```bash
curl -X POST http://localhost:3000/api/agents/deploy \
  -H "Content-Type: application/json" \
  -d "{\"request\":\"Design an autonomous agent ecosystem\",\"workspaceName\":\"demo-workspace\"}"
```

## Operational Notes

- The base OCR runtime must go through the local PaddleOCR sidecar; LM Studio is needed for structuring text after OCR.
- PaddleOCR must be running on the host at `http://localhost:8000` before starting the app.
- `agentic` endpoints depend on `@openai/agents` and require a separate environment check.
- Build artifacts are present in the workspace but are not the source of truth; look only at source files during audits.
