# Current Context

## Snapshot Date

- `2026-03-31`

## System Status

- backend is split into `gateway`, `services/*`, and `shared`
- gateway is the only HTTP entrypoint
- OCR, TTS, document, vocabulary, and agentic workloads are hosted as separate TCP service apps
- reusable business logic still lives in `backend/src`
- frontend uses a feature/store/view layout with Zustand stores
- launcher-side TTS defaults are now controlled through `scripts/linux/tts-models.conf`
- current launcher default enables Kokoro
- BERT MLM scorer sidecar added at `:8502` (`bert-large-cased`, English-only, optional)
- vocabulary extraction pipeline: Stanza → BERT scoring → candidate build → optional LLM review
- documentation has been refreshed to match the current repo shape

## Confirmed Facts

- `POST /api/tts` supports:
  - `supertone`
  - `piper`
  - `kokoro`
- gateway validates TTS text length at `5000`
- browser/perf automation may use `LM_STUDIO_SMOKE_ONLY=true`
- the result panel currently exposes Kokoro
- Kokoro is rejected client-side for Cyrillic text
- SQLite persistence is split:
  - `data/documents.sqlite`
  - `data/vocabulary.sqlite`

## Current Risks

- `agentic` still lacks a graceful degraded response when `OPENAI_API_KEY` is absent
- checked-in runtime companion files inside `backend/shared/src` can confuse readers if treated as primary source
- launcher defaults can surprise operators if `scripts/linux/tts-models.conf` drifts from the docs
- build artifacts and caches can accumulate quickly if not cleaned periodically

## Confirmed Facts (added 2026-03-31)

- BERT sidecar exposes `GET /health` (`modelReady`, `modelName`, `supportedLanguage: "en"`) and `POST /score`
- scoring uses geometric-mean MLM probability across subwords; `bertProb >= 0.15` → `selectedByDefault: false`
- BERT sidecar is started by the launcher as Step 1e (after Stanza), with a 120 s startup window; failure is non-fatal
- `BERT_SERVICE_URL`, `BERT_SERVICE_TIMEOUT`, `BERT_MODEL_NAME`, `BERT_USE_GPU`, `BERT_MODEL_DIR` are all configurable via env
- model cache is at `services/nlp/bert-service/models/`, excluded from git

## Recommended Next Actions

- do not edit generated artifacts under `dist/` or checked-in JS companions when the TS source is the true edit target
- when changing public routes, update gateway docs and shared contracts together
- if the launcher defaults change, update `README.md`, `CLAUDE.md`, `agents.md`, and `docs/agents/runbook.md`
- implement explicit graceful degradation for `/api/agents/*`
- consider documenting or automating routine cache cleanup for large local runtime artifacts
