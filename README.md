# OCR-App

Alpha baseline: `v0.1.0-alpha.1`

OCR-App is a local-first OCR and study workflow. It extracts text from images, structures the result with LM Studio, lets you save documents, collect vocabulary with SM-2 scheduling, run practice sessions, and synthesize speech through several local TTS engines.

The saved-document flow is split into:

- `Save Document` for persisting OCR/Markdown output
- `Save Vocabulary` for preparing document-scoped vocabulary candidates, optionally running LLM review, editing the final list in a confirmation overlay, and only then writing confirmed items into the shared vocabulary store

The only cloud-dependent area is the optional `agentic` API under `/api/agents/*`, which requires `OPENAI_API_KEY`.

For Docker-backed Voxtral runs, the project uses your existing Docker daemon configuration. If your Docker data root already lives on another disk, no additional project changes are required.

## Runtime Topology

```text
Frontend (React/Vite)
        |
        v
HTTP Gateway :3000
        |
        +--> OCR service       :3901 --> LM Studio vision OCR :1234
        +--> TTS service       :3902 --> Supertone/Piper :8100
        |                              Kokoro          :8200
        |                              F5 TTS          :8300
        |                              Voxtral         :8400
        +--> Document service  :3903 --> SQLite + optional Stanza :8501
        +--> Vocabulary service:3904 --> SQLite + LM Studio
        +--> Agentic service   :3905 --> OpenAI Agents SDK

OCR + vocabulary structuring/generation use LM Studio :1234
```

## Main Components

- `backend/gateway/`: HTTP entrypoint, static frontend hosting, throttling, upstream error mapping.
- `backend/services/*`: TCP microservices for OCR, TTS, documents, vocabulary/practice, and agentic workflows.
- `backend/shared/`: shared contracts and domain abstractions used across processes.
- `services/nlp/stanza-service/`: optional Stanza FastAPI sidecar for document vocabulary extraction.
- `services/tts/supertone-service/`: Supertone + Piper FastAPI sidecar.
- `services/tts/kokoro-service/`: Kokoro FastAPI sidecar.
- `services/tts/f5-service/`: F5 TTS FastAPI sidecar.
- `services/tts/voxtral-service/`: Voxtral FastAPI adapter over `vLLM + vLLM-Omni`.
- `frontend/`: React 18 + Vite 6 client.

## Current Launcher Defaults

Launcher-side TTS defaults live in `scripts/linux/tts-models.conf`.

Current default:

- `TTS_ENABLE_SUPERTONE=false`
- `TTS_ENABLE_KOKORO=false`
- `TTS_ENABLE_F5=false`
- `TTS_ENABLE_VOXTRAL=true`

That means the shell launchers currently start only Voxtral by default unless you enable the other TTS sidecars in that config file.

## Requirements

- Node.js `20+`
- Python `3.10+`
- LM Studio running locally at `http://localhost:1234`
- AMD GPU with ROCm if you want the accelerated TTS paths and faster local inference

Without a supported GPU the project can still run partially on CPU, but some TTS engines are intentionally degraded or unavailable.

## Quick Start

### 1. Clone and install JS dependencies

```bash
git clone https://github.com/GeKtoRiX/OCR-App.git
cd OCR-App
npm install
```

### 2. Set up LM Studio

1. Install and open [LM Studio](https://lmstudio.ai/).
2. Download `qwen/qwen3.5-9b`.
3. Start the local server in the Developer tab.

Expected base URL:

```text
http://localhost:1234/v1
```

### 3. Set up the OCR model in LM Studio

```bash
# Load an OCR-capable vision model in LM Studio, for example:
# OCR_MODEL=paddleocr-vl-0.9b
```

### 4. Set up the TTS sidecars you need

Supertone + Piper:

```bash
cd services/tts/supertone-service
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip uninstall -y onnxruntime
pip install onnxruntime-rocm==1.22.2
pip install -r requirements.txt
```

Kokoro:

```bash
cd services/tts/kokoro-service
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
pip uninstall -y onnxruntime
pip install onnxruntime-rocm==1.22.2.post1
```

F5:

```bash
cd services/tts/f5-service
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

Voxtral:

```bash
cd services/tts/voxtral-service
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

Notes:

- Voxtral is optional and stays in explicit no-go mode if the local ROCm stack cannot start it cleanly.
- Voxtral caches live under `services/tts/voxtral-service/models/`.
- F5 is treated as GPU-only in this project.
- Piper voices are served through the Supertone sidecar.

### 4b. Set up the optional Stanza sidecar

`Save Vocabulary` can use a lightweight heuristic fallback, but the preferred extractor is the Stanza sidecar.

```bash
cd services/nlp/stanza-service
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 5. Start a stack

```bash
chmod +x scripts/linux/ocr.sh scripts/linux/tts.sh scripts/linux/ocr-tts.sh
./scripts/linux/ocr-tts.sh
```

Available launcher modes:

- `./scripts/linux/ocr.sh`: OCR-oriented stack, LM Studio required, TTS sidecars follow `tts-models.conf`
- `./scripts/linux/tts.sh`: TTS-oriented stack, LM Studio skipped
- `./scripts/linux/ocr-tts.sh`: full stack
- `./scripts/linux/stack.sh`: interactive menu for start/stop/status/switch

Lifecycle helpers:

```bash
./scripts/linux/ocr.sh stop
./scripts/linux/tts.sh stop
./scripts/linux/ocr-tts.sh stop

./scripts/linux/ocr.sh status
./scripts/linux/tts.sh status
./scripts/linux/ocr-tts.sh status

./scripts/linux/ocr-tts.sh wipe
```

When a backend-enabled stack is running, the app is served at:

```text
http://localhost:3000
```

## Development Commands

```bash
npm run dev:frontend
npm run dev:stanza
npm run dev:supertone
npm run dev:kokoro
npm run dev:f5
npm run dev:voxtral
npm run smoke:ocr
npm run smoke:stanza
npm run smoke:supertone
npm run smoke:kokoro
npm run smoke:f5
npm run smoke:voxtral
npm run smoke:lmstudio
```

## Build And Test

```bash
npm run build
npm run test:frontend
npm run test:backend
npm run test:e2e:api
npm run test:e2e:integration
npm run test:e2e:launcher
npm run test:e2e:browser
npm run test:e2e:browser:vocab
npm run perf:api
npm run perf:browser
npm run perf:phase4
```

`test:e2e:browser` and `perf:phase4` expect a real local LM Studio server with the OCR and structuring models already loaded.

`test:e2e:browser:vocab` is a lightweight browser e2e for the `Save Vocabulary` review/editor flow. It starts only `document`, `vocabulary`, and `gateway`, seeds a real saved document, and does not require OCR or TTS sidecars.

## Public API

### OCR

```bash
curl -X POST http://localhost:3000/api/ocr \
  -F "image=@image_test.jpg"
```

Response:

```json
{ "rawText": "...", "markdown": "...", "filename": "image_test.jpg" }
```

### Health

```bash
curl http://localhost:3000/api/health
```

Response fields:

- `ocrReachable`
- `ocrModels`
- `ocrDevice`
- `lmStudioReachable`
- `lmStudioModels`
- `superToneReachable`
- `kokoroReachable`
- `f5TtsReachable`
- `f5TtsDevice`
- `voxtralReachable`
- `voxtralDevice`

### TTS

Supertone / Piper / Kokoro / Voxtral use JSON:

```bash
curl -X POST http://localhost:3000/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world","engine":"voxtral","voice":"casual_female","format":"wav"}' \
  --output speech.wav
```

F5 uses multipart:

```bash
curl -X POST http://localhost:3000/api/tts \
  -F "text=Hello world" \
  -F "engine=f5" \
  -F "refText=Reference transcript" \
  -F "refAudio=@reference.wav" \
  --output speech.wav
```

Gateway validation:

- `text` is required
- max text length is `5000`
- `refAudio` upload limit for F5 is `50 MB`

### Documents

- `POST /api/documents`
- `GET /api/documents`
- `GET /api/documents/:id`
- `PUT /api/documents/:id`
- `DELETE /api/documents/:id`
- `POST /api/documents/:id/vocabulary/prepare`
- `POST /api/documents/:id/vocabulary/confirm`

`POST /api/documents/:id/vocabulary/prepare` runs document-scoped candidate extraction and optional LLM review.

```bash
curl -X POST http://localhost:3000/api/documents/<id>/vocabulary/prepare \
  -H "Content-Type: application/json" \
  -d '{"llmReview":true,"targetLang":"en","nativeLang":"ru"}'
```

`POST /api/documents/:id/vocabulary/confirm` writes the confirmed items into the normal vocabulary store.

```bash
curl -X POST http://localhost:3000/api/documents/<id>/vocabulary/confirm \
  -H "Content-Type: application/json" \
  -d '{"targetLang":"en","nativeLang":"ru","items":[{"candidateId":"<id>","word":"give up","vocabType":"phrasal_verb","translation":"сдаваться","contextSentence":"She gave up too early."}]}'
```

### Vocabulary

- `POST /api/vocabulary`
- `GET /api/vocabulary`
- `GET /api/vocabulary/review/due`
- `PUT /api/vocabulary/:id`
- `DELETE /api/vocabulary/:id`

### Practice

- `POST /api/practice/start`
- `POST /api/practice/answer`
- `POST /api/practice/complete`
- `GET /api/practice/sessions`
- `GET /api/practice/stats/:vocabularyId`

### Agentic

- `POST /api/agents/architecture`
- `POST /api/agents/deploy`

These routes require `OPENAI_API_KEY`.

## Frontend Notes

- OCR results are stored in a session history store.
- Saved documents, vocabulary, practice state, and health state each have their own Zustand store.
- Saved results expose separate `Save Document` and `Save Vocabulary` actions.
- `Save Vocabulary` always opens a review overlay with an embedded editor before writing anything to the DB.
- TTS engines exposed in the UI: `supertone`, `piper`, `kokoro`, `f5`, `voxtral`.
- The frontend currently exposes only English Voxtral preset voices, even though the backend/runtime supports a wider multilingual preset set.
- Kokoro is blocked in the frontend for Cyrillic input and will throw a client-side error for that text path.

## Health Lamp Semantics

- `red`: OCR unavailable
- `yellow`: OCR is reachable but running on CPU
- `blue`: OCR + LM Studio + Supertone + Kokoro + F5 all healthy; Voxtral is reported but does not block blue
- `green`: OCR is healthy, but at least one other baseline dependency is missing

## Important Config

Root `.env` commonly includes:

```env
LM_STUDIO_BASE_URL=http://localhost:1234/v1
STRUCTURING_MODEL=qwen/qwen3.5-9b
OCR_MODEL=paddleocr-vl-0.9b
SUPERTONE_HOST=localhost
SUPERTONE_PORT=8100
KOKORO_HOST=localhost
KOKORO_PORT=8200
F5_TTS_HOST=localhost
F5_TTS_PORT=8300
VOXTRAL_HOST=localhost
VOXTRAL_PORT=8400
OPENAI_API_KEY=
```

Launcher-side TTS defaults are controlled separately in `scripts/linux/tts-models.conf`.

## Related Docs

- `CLAUDE.md`
- `agents.md`
- `structure.md`
- `docs/agents/project-overview.md`
- `docs/agents/runbook.md`
