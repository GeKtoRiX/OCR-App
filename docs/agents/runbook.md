# Runbook

Release baseline: `v0.1.0-alpha.1`

## Install

```bash
npm install
```

Set up the required Python sidecars manually under:

- `services/ocr/paddleocr-service/.venv`
- `services/nlp/stanza-service/.venv`
- `services/tts/supertone-service/.venv`
- `services/tts/kokoro-service/.venv`
- `services/tts/f5-service/.venv`
- `services/tts/voxtral-service/.venv`

## Development Commands

```bash
npm run dev:frontend
npm run dev:paddleocr
npm run dev:stanza
npm run dev:supertone
npm run dev:kokoro
npm run dev:f5
npm run dev:voxtral

npm run smoke:paddleocr
npm run smoke:stanza
npm run smoke:supertone
npm run smoke:kokoro
npm run smoke:f5
npm run smoke:voxtral
npm run smoke:lmstudio
npm run smoke:all
```

## Build

```bash
npm run build
```

## Tests

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

## Perf

```bash
npm run perf:api
npm run perf:browser
npm run perf:phase4
```

`test:e2e:browser` and `perf:phase4` may run with `LM_STUDIO_SMOKE_ONLY=true`.

`test:e2e:browser:vocab` is the lightweight browser e2e for the `Save Vocabulary` review/editor flow. It starts only `document`, `vocabulary`, and `gateway`.

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

## Launcher Scripts

```bash
./scripts/linux/ocr.sh
./scripts/linux/tts.sh
./scripts/linux/ocr-tts.sh
./scripts/linux/stack.sh
```

Lifecycle:

```bash
./scripts/linux/ocr.sh stop
./scripts/linux/tts.sh stop
./scripts/linux/ocr-tts.sh stop

./scripts/linux/ocr.sh status
./scripts/linux/tts.sh status
./scripts/linux/ocr-tts.sh status

./scripts/linux/ocr-tts.sh wipe
```

Notes:

- launcher defaults are controlled in `scripts/linux/tts-models.conf`
- current default is Voxtral only
- logs go to `logs/`
- pid files go to `.pids/`

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

### TTS - Supertone

```bash
curl -X POST http://localhost:3000/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world","engine":"supertone","voice":"M1","lang":"en","speed":1.05,"totalSteps":5}' \
  --output speech.wav
```

### TTS - Piper

```bash
curl -X POST http://localhost:3000/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world","engine":"piper","voice":"en_US-amy-medium","speed":1.05}' \
  --output speech.wav
```

### TTS - Kokoro

```bash
curl -X POST http://localhost:3000/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world","engine":"kokoro","voice":"af_heart","speed":1.0}' \
  --output speech.wav
```

### TTS - F5

```bash
curl -X POST http://localhost:3000/api/tts \
  -F "text=Hello world" \
  -F "engine=f5" \
  -F "refText=Reference transcript" \
  -F "refAudio=@reference.wav" \
  --output speech.wav
```

### TTS - Voxtral

```bash
curl -X POST http://localhost:3000/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world","engine":"voxtral","voice":"casual_female","format":"wav"}' \
  --output speech.wav
```

### Documents

```bash
curl -X POST http://localhost:3000/api/documents \
  -H "Content-Type: application/json" \
  -d '{"markdown":"# Hello","filename":"scan.png"}'

curl http://localhost:3000/api/documents
curl http://localhost:3000/api/documents/<id>

curl -X PUT http://localhost:3000/api/documents/<id> \
  -H "Content-Type: application/json" \
  -d '{"markdown":"# Updated"}'

curl -X DELETE http://localhost:3000/api/documents/<id>

curl -X POST http://localhost:3000/api/documents/<id>/vocabulary/prepare \
  -H "Content-Type: application/json" \
  -d '{"llmReview":true,"targetLang":"en","nativeLang":"ru"}'

curl -X POST http://localhost:3000/api/documents/<id>/vocabulary/confirm \
  -H "Content-Type: application/json" \
  -d '{"targetLang":"en","nativeLang":"ru","items":[{"candidateId":"<candidate-id>","word":"give up","vocabType":"phrasal_verb","translation":"сдаваться","contextSentence":"She gave up too early."}]}'
```

### Vocabulary

```bash
curl -X POST http://localhost:3000/api/vocabulary \
  -H "Content-Type: application/json" \
  -d '{"word":"beautiful","vocabType":"word","translation":"krasivyy","targetLang":"en","nativeLang":"ru","contextSentence":"The sunset was beautiful."}'

curl "http://localhost:3000/api/vocabulary?targetLang=en&nativeLang=ru"
curl "http://localhost:3000/api/vocabulary/review/due?limit=20"

curl -X PUT http://localhost:3000/api/vocabulary/<id> \
  -H "Content-Type: application/json" \
  -d '{"translation":"krasivyy","contextSentence":"updated context"}'

curl -X DELETE http://localhost:3000/api/vocabulary/<id>
```

### Practice

```bash
curl -X POST http://localhost:3000/api/practice/start \
  -H "Content-Type: application/json" \
  -d '{"targetLang":"en","nativeLang":"ru","wordLimit":10}'

curl -X POST http://localhost:3000/api/practice/answer \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<id>","vocabularyId":"<id>","exerciseType":"spelling","prompt":"Spell: krasivyy","correctAnswer":"beautiful","userAnswer":"beatiful"}'

curl -X POST http://localhost:3000/api/practice/complete \
  -H "Content-Type: application/json" \
  -d '{"sessionId":"<id>"}'

curl http://localhost:3000/api/practice/sessions
curl http://localhost:3000/api/practice/stats/<vocabularyId>
```

### Agentic

```bash
curl -X POST http://localhost:3000/api/agents/architecture \
  -H "Content-Type: application/json" \
  -d '{"request":"Design an autonomous agent ecosystem"}'

curl -X POST http://localhost:3000/api/agents/deploy \
  -H "Content-Type: application/json" \
  -d '{"request":"Design an autonomous agent ecosystem","workspaceName":"demo-workspace"}'
```

## Operational Notes

- base OCR requires PaddleOCR and LM Studio
- TTS is optional for OCR, but the TTS service process still starts in backend-enabled stacks
- Voxtral is optional and may remain unavailable on unsupported ROCm setups
- F5 is treated as GPU-only in this project
- Piper is served through the Supertone sidecar
- frontend currently exposes only English Voxtral presets
- Kokoro rejects Cyrillic text on the frontend
