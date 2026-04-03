# OCR-App

Alpha baseline: `v0.1.0-alpha.1`

OCR-App is a local-first OCR and study workflow. It extracts text from images, structures the result with LM Studio, lets you save documents, collect vocabulary with SM-2 scheduling, run practice sessions, and synthesize speech through local TTS engines.

The saved-document flow is split into:

- `Save Document` for persisting OCR/Markdown output
- `Save Vocabulary` for preparing document-scoped vocabulary candidates, optionally running LLM review, editing the final list in a confirmation overlay, and only then writing confirmed items into the shared vocabulary store

The only cloud-dependent area is the optional `agentic` API under `/api/agents/*`, which requires `OPENAI_API_KEY`.

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
- `frontend/`: React 18 + Vite 6 client.

## Current Launcher Defaults

Launcher-side TTS defaults live in `scripts/linux/tts-models.conf`.

Current default:

- `TTS_ENABLE_SUPERTONE=false`
- `TTS_ENABLE_KOKORO=true`

That means the shell launchers currently start Kokoro by default unless you enable other TTS sidecars in that config file.

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

### 3. Set up the LM Studio model

```bash
# Load this model in LM Studio before starting OCR-backed flows:
# qwen/qwen3.5-9b
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

Notes:

- Piper voices are served through the Supertone sidecar.
- The optional BERT scorer downloads and caches `prajjwal1/bert-tiny` under `services/nlp/bert-service/models/`, then loads it locally from there on later runs.

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
chmod +x scripts/linux/ocr.sh
./scripts/linux/ocr.sh
```

Supported launcher entry:

- `./scripts/linux/ocr.sh`: OCR-oriented stack, LM Studio required, TTS sidecars follow `tts-models.conf`

Launcher defaults are conservative about VRAM:

- LM Studio model loading is manual
- BERT and Stanza default to CPU
- Supertone is disabled by default in `scripts/linux/tts-models.conf`

Lifecycle helpers:

```bash
./scripts/linux/ocr.sh stop

./scripts/linux/ocr.sh status

./scripts/linux/ocr.sh wipe
```

VRAM cleanup helper:

- `./scripts/linux/clear-llm-vram.sh`: unloads LM Studio models, stops the LM Studio server when needed, terminates extra user-owned LLM processes, and reports VRAM usage before and after cleanup
- expects `rocm-smi` to be installed for primary VRAM telemetry, with `/sys/class/drm` used as a fallback

```bash
./scripts/linux/clear-llm-vram.sh
```

When a backend-enabled stack is running, the app is served at:

```text
http://localhost:3000
```

## Development Commands

```bash
npm run mcp:project
npm run dev:frontend
npm run dev:stanza
npm run dev:supertone
npm run dev:kokoro
npm run smoke:ocr
npm run smoke:stanza
npm run smoke:supertone
npm run smoke:kokoro
npm run smoke:lmstudio
```

## Project MCP

This repo ships a local stdio MCP server at `scripts/mcp-vocab-server.js`.

It is designed for practical day-to-day development work and exposes tools for:

- whole-project maps via `project_map`, `api_map`, `runtime_map`, `data_map`, `test_map`, and `entrypoint_map`
- architecture and documentation maps via `architecture_map` and `docs_map`
- dynamic route/config/service visibility via `discover_api_routes`, `route_trace`, `config_map`, and `service_inventory`
- codebase dependency visibility via `dependency_map`
- environment/runtime introspection via `env_map`, `process_snapshot`, and `port_status`
- bounded repo structure views via `repo_tree`
- targeted code discovery via `feature_map` and `import_graph`
- runtime health checks for the gateway and LM Studio
- high-signal runtime diagnosis via `project_doctor`
- git visibility via `git_status` and `git_diff_summary`
- recent history via `git_recent_commits`
- root script discovery via `list_npm_scripts`
- read-only JSON access to key gateway endpoints via `get_gateway_json`
- runtime/perf log inventory via `list_project_logs`
- launcher-oriented startup inspection via `launcher_status`
- saved document lookup and candidate inspection
- document incident triage via `debug_failed_document`
- vocabulary lookup, due-review queues, and word stats
- end-to-end word tracing via `trace_word_lifecycle`
- recent practice mistake inspection
- direct practice session inspection from SQLite
- SQLite schema and read-only query access via `db_overview` and `db_query`
- table/index/foreign-key inspection via `db_schema`
- repo navigation helpers for listing files, searching text, reading file slices, and mapping likely tests via `test_coverage_map` and `recommend_test_strategy`
- focused test runners for frontend Vitest, backend Jest, and Playwright e2e specs
- browser-e2e workflow helpers via `prepare_browser_e2e`, `stop_browser_e2e`, and `run_browser_e2e`
- Playwright artifact inspection via `list_test_results` and `read_test_artifact`
- quick `tmp/perf/logs` tailing for local runtime debugging
- quick `logs/*.log` tailing for startup/runtime failures
- whitelisted smoke-test execution
- launcher start/stop helpers via `stack_start` and `stack_stop`

Run it directly:

```bash
npm run mcp:project
```

Register it in Codex:

```bash
codex mcp add ocr-project -- node /mnt/HDD_Store/ocrProject/scripts/mcp-vocab-server.js
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

`test:e2e:browser` and `perf:phase4` expect a real local LM Studio server with `qwen/qwen3.5-9b` already loaded.

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

### TTS

Supertone / Piper / Kokoro use JSON:

```bash
curl -X POST http://localhost:3000/api/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Hello world","engine":"kokoro","voice":"af_heart","speed":1.0}' \
  --output speech.wav
```

Gateway validation:

- `text` is required
- max text length is `5000`

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
- TTS engine exposed in the result panel UI: `kokoro`.
- Kokoro is blocked in the frontend for Cyrillic input and will throw a client-side error for that text path.

## Health Lamp Semantics

- `red`: OCR unavailable
- `yellow`: OCR is reachable but running on CPU
- `blue`: OCR + LM Studio + Supertone + Kokoro are healthy
- `green`: OCR is healthy, but at least one other baseline dependency is missing

## Important Config

Root `.env` commonly includes:

```env
LM_STUDIO_BASE_URL=http://localhost:1234/v1
STRUCTURING_MODEL=qwen/qwen3.5-9b
OCR_MODEL=qwen/qwen3.5-9b
SUPERTONE_HOST=localhost
SUPERTONE_PORT=8100
KOKORO_HOST=localhost
KOKORO_PORT=8200
OPENAI_API_KEY=
```

Launcher-side TTS defaults are controlled separately in `scripts/linux/tts-models.conf`.

## Related Docs

- `CLAUDE.md`
- `agents.md`
- `docs/agents/architecture.md`
- `docs/agents/runbook.md`
- `docs/agents/context.md`
