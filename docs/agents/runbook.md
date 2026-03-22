# Runbook

Release baseline: `v0.1.0-alpha.1` (alpha)

## Development

```bash
npm run dev:paddleocr    # Start PaddleOCR sidecar (port 8000)
npm run smoke:paddleocr  # Smoke-test PaddleOCR

npm run dev:supertone    # Start Supertone + Piper sidecar (port 8100)
npm run smoke:supertone  # Smoke-test Supertone + Piper

npm run dev:kokoro       # Start Kokoro TTS sidecar (port 8200, ONNX Runtime with ROCm->CPU fallback)
npm run smoke:kokoro     # Smoke-test Kokoro TTS
npm run dev:f5           # Start F5 TTS sidecar (port 8300, GPU enabled)
npm run smoke:f5         # Smoke-test F5 TTS
npm run smoke:lmstudio   # Backend LM Studio structuring smoke
npm run smoke:all        # Run all sidecar smokes

npm run dev:backend      # NestJS watch mode (port 3000)
npm run dev:frontend     # Vite dev server (port 5173)
```

## Build

```bash
npm run build
```

## Backend Tests

```bash
npm test --workspace=backend
npm run test:cov --workspace=backend
npm run test:e2e:api
npm run test:e2e:integration
```

## Frontend Tests

```bash
npm test --workspace=frontend
npm run test:cov --workspace=frontend
```

## Browser E2E And Perf

```bash
npm run test:e2e:browser
npm run perf:api
npm run perf:browser
npm run perf:phase4
```

`test:e2e:browser` and `perf:phase4` rebuild frontend/backend, reset `tmp/test-db/browser-e2e.sqlite`, and run with `LM_STUDIO_SMOKE_ONLY=true`.

## Production

```bash
npm run build
node backend/dist/main.js
```

## Lifecycle Script (Linux/macOS)

```bash
./scripts/linux/ocr.sh              # start OCR mode (PaddleOCR + Kokoro + LM Studio + backend) + live lamp
./scripts/linux/tts.sh              # start TTS mode (PaddleOCR + Supertone/Piper + Kokoro + F5 + backend) + live lamp
./scripts/linux/ocr-tts.sh          # start full stack + live lamp
./scripts/linux/ocr-tts.sh stop     # stop all services gracefully
./scripts/linux/ocr-tts.sh wipe     # stop + remove all build artifacts
./scripts/linux/ocr-tts.sh status   # env, service health, process state
```

The script writes service logs to `.logs/` and PID files to `.pids/`. A live status lamp (🔵🟢🟡🔴) polls `/api/health` every 5 seconds while running.

## Public Endpoints

### OCR

```bash
curl -X POST http://localhost:3000/api/ocr \
  -F "image=@image_test.jpg"
# → { rawText, markdown, filename }
```

### Health

```bash
curl http://localhost:3000/api/health
# → { paddleOcrReachable, paddleOcrModels, paddleOcrDevice,
#      lmStudioReachable, lmStudioModels,
#      superToneReachable, kokoroReachable,
#      f5TtsReachable, f5TtsDevice }
```

### TTS — Supertone (default)

```bash
curl -X POST http://localhost:3000/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world","voice":"M1","lang":"en","speed":1.05,"totalSteps":5}' \
  --output speech.wav
# Voices: M1–M5, F1–F5. Languages: en, ko, es, pt, fr. Returns audio/wav (44100 Hz).
```

### TTS — Piper

```bash
curl -X POST http://localhost:3000/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world","engine":"piper","voice":"en_US-hfc_female-medium","speed":1.05}' \
  --output speech.wav
```

### TTS — Kokoro

```bash
curl -X POST http://localhost:3000/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world","engine":"kokoro","voice":"af_heart","speed":1.0}' \
  --output speech.wav
```

### TTS — F5

```bash
curl -X POST http://localhost:3000/api/tts \
  -F "text=Hello world" \
  -F "refText=Reference transcript" \
  -F "refAudio=@reference.wav" \
  --output speech.wav
```

### Documents

```bash
# Save document
curl -X POST http://localhost:3000/api/documents \
  -H "Content-Type: application/json" \
  -d '{"markdown":"# Hello\nWorld","filename":"scan.png"}'

# List documents
curl http://localhost:3000/api/documents

# Update document
curl -X PUT http://localhost:3000/api/documents/<id> \
  -H "Content-Type: application/json" \
  -d '{"markdown":"# Updated"}'

# Delete document
curl -X DELETE http://localhost:3000/api/documents/<id>
```

### Vocabulary

```bash
# Add word
curl -X POST http://localhost:3000/api/vocabulary \
  -H "Content-Type: application/json" \
  -d '{"word":"beautiful","vocabType":"word","translation":"красивый","targetLang":"en","nativeLang":"ru","contextSentence":"The sunset was beautiful."}'

# List vocabulary (with optional language filter)
curl "http://localhost:3000/api/vocabulary?targetLang=en&nativeLang=ru"

# Words due for review
curl "http://localhost:3000/api/vocabulary/review/due?limit=20"

# Update word
curl -X PUT http://localhost:3000/api/vocabulary/<id> \
  -H "Content-Type: application/json" \
  -d '{"translation":"красивый","contextSentence":"updated context"}'

# Delete word
curl -X DELETE http://localhost:3000/api/vocabulary/<id>
```

### Practice

```bash
# Start session
curl -X POST http://localhost:3000/api/practice/start \
  -H "Content-Type: application/json" \
  -d '{"targetLang":"en","nativeLang":"ru","wordLimit":10}'

# Submit answer
curl -X POST http://localhost:3000/api/practice/answer \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<id>","vocabularyId":"<id>","exerciseType":"spelling","prompt":"Spell: красивый","correctAnswer":"beautiful","userAnswer":"beatiful"}'

# Complete session
curl -X POST http://localhost:3000/api/practice/complete \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<id>"}'

# Recent sessions
curl http://localhost:3000/api/practice/sessions

# Word attempt history
curl http://localhost:3000/api/practice/stats/<vocabularyId>
```

### Agentic Architecture

```bash
curl -X POST http://localhost:3000/api/agents/architecture \
  -H "Content-Type: application/json" \
  -d '{"request":"Design an autonomous agent ecosystem"}'
```

### Agentic Deploy

```bash
curl -X POST http://localhost:3000/api/agents/deploy \
  -H "Content-Type: application/json" \
  -d '{"request":"Design an autonomous agent ecosystem","workspaceName":"demo-workspace"}'
```

## Operational Notes

- The base OCR runtime must go through the local PaddleOCR sidecar; LM Studio is needed for structuring text after OCR.
- Vocabulary capture from the result panel is supported only in the normal rendered Markdown view. It is intentionally disabled in edit mode.
- Session-history screenshots and saved documents are both removable from their sidebar tabs via the hover trash control.
- PaddleOCR must be running on the host at `http://localhost:8000` before starting the app.
- TTS sidecars are optional — the OCR pipeline works without them.
- Supertone requires `onnxruntime-rocm` for GPU; falls back to CPU automatically if GPU provider fails real inference.
- Piper shares the Supertone sidecar and downloads voices on first use.
- `LD_LIBRARY_PATH` must include the PyTorch ROCm lib dir for GPU sidecars (the launcher scripts set this automatically).
- SQLite database file location defaults to `./data/ocr-app.db` (configurable via `SQLITE_DB_PATH` env var).
- `agentic` endpoints depend on `@openai/agents` and require `OPENAI_API_KEY` to be set; without it they currently return 5xx while the main app remains alive.
- Build artifacts are present in the workspace but are not the source of truth; look only at source files during audits.
