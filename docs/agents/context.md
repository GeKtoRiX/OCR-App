# Current Context

## Snapshot Date

- `2026-04-03`

## Confirmed Runtime Facts

- backend is split into `gateway`, `services/*`, `shared`, and reusable logic in `backend/src`
- gateway remains the only HTTP entrypoint on `:3000`
- OCR, TTS, document, vocabulary, and agentic workloads are separate TCP service apps on `:3901-3905`
- LM Studio is the local LLM runtime on `:1234`
- launcher-side TTS defaults currently enable Kokoro and disable Supertone
- document vocabulary extraction prefers the optional Stanza sidecar on `:8501`
- English candidate scoring may use the optional BERT sidecar on `:8502`
- `Save Vocabulary` prepares document-scoped candidates before confirm-time writes to the shared vocabulary store
- browser and perf automation may run with `LM_STUDIO_SMOKE_ONLY=true`

## Current Local Status

Observed on `2026-04-03`:

- local project MCP is reachable
- LM Studio is reachable and currently exposes `qwen/qwen3.5-9b`
- gateway and service ports were not running during the last inspection
- document and vocabulary SQLite databases are present and readable

## Agent-Facing Documentation Set

The maintained agent doc set is intentionally small:

- `agents.md`
- `docs/agents/architecture.md`
- `docs/agents/runbook.md`
- `docs/agents/context.md`

Deleted or consolidated docs should not be recreated unless they restore clearly missing operational value.

## Local MCP Status

`scripts/mcp-vocab-server.js` has been expanded beyond basic lookup and now covers:

- project, architecture, runtime, data, test, and entrypoint maps
- documentation and dependency maps
- route tracing, feature search, import graph, and test coverage map
- repo navigation and read-only SQLite access
- focused test runners and safe root script execution
- launcher status plus stack start and stop
- process, port, and health inspection
- runtime log tailing and log diagnosis

Current MCP server version in code: `2.6.0`

## Open Risks

- `/api/agents/*` still depends on `OPENAI_API_KEY` and does not represent a fully local path
- launcher defaults can drift from docs if `scripts/linux/tts-models.conf` changes without doc updates
- checked-in runtime companions in some backend areas can confuse readers if treated as primary edit targets
- reverse-import matching in MCP helper tools is heuristic and should be treated as navigation help, not compiler truth

## Update Rules

- update this file after meaningful runtime, launcher, MCP, or operational workflow changes
- keep it factual and current-state oriented
- prefer replacing stale bullets over accumulating long history here
