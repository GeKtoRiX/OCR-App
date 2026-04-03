# Runbook

Release baseline: `v0.1.0-alpha.1`

## Install

```bash
npm install
```

Python sidecars are optional but expected under:

- `services/nlp/stanza-service/.venv`
- `services/nlp/bert-service/.venv`
- `services/tts/supertone-service/.venv`
- `services/tts/kokoro-service/.venv`

## Core Commands

### Development

```bash
npm run mcp:project
npm run dev:frontend
npm run dev:stanza
npm run dev:bert
npm run dev:supertone
npm run dev:kokoro
```

### Smoke

```bash
npm run smoke:ocr
npm run smoke:stanza
npm run smoke:bert
npm run smoke:supertone
npm run smoke:kokoro
npm run smoke:lmstudio
```

### Build

```bash
npm run build
```

### Tests

```bash
npm run test:frontend
npm run test:backend
npm run test:cov:frontend
npm run test:cov:backend
npm run test:e2e:api
npm run test:e2e:integration
npm run test:e2e:launcher
npm run test:e2e:browser
npm run test:e2e:browser:vocab
```

### Perf

```bash
npm run perf:api
npm run perf:browser
npm run perf:phase4
```

`test:e2e:browser` and `perf:phase4` may run with `LM_STUDIO_SMOKE_ONLY=true`.

## Launcher

Primary stack launcher:

```bash
./scripts/linux/ocr.sh
```

Lifecycle:

```bash
./scripts/linux/ocr.sh stop
./scripts/linux/ocr.sh status
./scripts/linux/ocr.sh wipe
```

Current launcher facts:

- defaults come from `scripts/linux/tts-models.conf`
- current default is Kokoro on, Supertone off
- logs go to `logs/`
- pid files go to `.pids/`

## Production-Style Start

```bash
npm run build
node backend/dist/services/ocr/src/main.js
node backend/dist/services/tts/src/main.js
node backend/dist/services/document/src/main.js
node backend/dist/services/vocabulary/src/main.js
node backend/dist/services/agentic/src/main.js
node backend/dist/gateway/main.js
```

## Important Endpoints

### Health

```bash
curl http://localhost:3000/api/health
```

### OCR

```bash
curl -X POST http://localhost:3000/api/ocr \
  -F "image=@image_test.jpg"
```

### TTS

```bash
curl -X POST http://localhost:3000/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world","engine":"kokoro","voice":"af_heart","speed":1.0}' \
  --output speech.wav
```

### Documents

```bash
curl http://localhost:3000/api/documents
curl http://localhost:3000/api/documents/<id>
```

### Save Vocabulary

```bash
curl -X POST http://localhost:3000/api/documents/<id>/vocabulary/prepare \
  -H "Content-Type: application/json" \
  -d '{"llmReview":true,"targetLang":"en","nativeLang":"ru"}'

curl -X POST http://localhost:3000/api/documents/<id>/vocabulary/confirm \
  -H "Content-Type: application/json" \
  -d '{"targetLang":"en","nativeLang":"ru","items":[]}'
```

### Vocabulary And Practice

```bash
curl "http://localhost:3000/api/vocabulary?targetLang=en&nativeLang=ru"
curl "http://localhost:3000/api/vocabulary/review/due?limit=20"
curl http://localhost:3000/api/practice/sessions
```

## Local MCP

Project MCP server:

```bash
node scripts/mcp-vocab-server.js
```

High-value MCP tools now include:

- project and architecture maps
- route tracing and feature search
- repo tree, repo search, file reads
- dependency and import maps
- DB overview, schema, and read-only SQL
- focused test runners
- launcher status, stack start/stop, health, ports, processes
- runtime log tailing and diagnosis

## Operational Notes

- base OCR requires LM Studio on `:1234`
- document DB defaults to `data/documents.sqlite`
- vocabulary and practice DB default to `data/vocabulary.sqlite`
- Stanza and BERT are optional in the document vocabulary pipeline
- BERT scoring is English-only
- agentic endpoints require `OPENAI_API_KEY`
