# Autonomous Agent Ecosystem

## Current Hosting Model

The agentic bounded context still lives in `backend/src/agentic/*`, but it is now hosted through the dedicated TCP service at `backend/services/agentic/*`.

Public HTTP flow:

```text
POST /api/agents/architecture
POST /api/agents/deploy
  -> gateway
  -> agentic TCP service
  -> backend/src/agentic application
```

## Source Layout

- `backend/src/agentic/core`
- `backend/src/agentic/agents`
- `backend/src/agentic/tools`
- `backend/src/agentic/guardrails`
- `backend/src/agentic/application`
- `backend/src/agentic/presentation`

## Execution Model

Phase flow:

1. `Analyze Supervisor` -> `Dependency Mapper`
2. `Scaffold Supervisor` -> `Scaffold Planner`
3. `Initialization Supervisor` -> `Initialization Architect`
4. optional deployment flow through `Deployment Supervisor` -> `Deployment Specialist`

All phases return structured outputs validated by Zod schemas and guardrails.

## Runtime Notes

- tracing remains wrapped with `withTrace(...)`
- decision-heavy roles default to `gpt-5`
- lighter specialist work uses `gpt-5-mini` or `gpt-5-nano`
- deployment output is written under `AGENT_DEPLOY_ROOT`

## Current Limitation

The base OCR/TTS runtime does not require `OPENAI_API_KEY`, but the agentic endpoints still do. Without the key, `/api/agents/*` currently fails instead of returning a graceful degraded response.
