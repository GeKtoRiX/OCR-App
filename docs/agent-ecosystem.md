# Autonomous Agent Ecosystem

## Dependency Tree

1. `Analyze Supervisor` hands off to `Dependency Mapper`.
2. `Scaffold Supervisor` hands off to `Scaffold Planner`.
3. `Initialization Supervisor` hands off to `Initialization Architect`.
4. Each specialist returns a structured phase object guarded by an output guardrail.
5. `AgentEcosystemService` executes all phases inside a single `withTrace(...)` workflow.

## Filesystem Scaffold

- `backend/src/agentic/core` for schemas, runtime types, and environment-driven model allocation.
- `backend/src/agentic/agents` for OpenAI Agents SDK initialization and handoff wiring.
- `backend/src/agentic/guardrails` for phase-level output validation.
- `backend/src/agentic/tools` for SDK function tools shared by specialists.
- `backend/src/agentic/application` for the NestJS orchestration service.
- `backend/src/agentic/presentation` for the REST controller and DTOs.

## Runtime Notes

- Simple specialist work defaults to `gpt-5-mini` and `gpt-5-nano`.
- Decision-heavy orchestration defaults to `gpt-5` with `reasoning.effort = high`.
- Built-in tracing is preserved and grouped through `withTrace(...)`.
- Endpoint: `POST /api/agents/architecture`
- Deployment endpoint: `POST /api/agents/deploy`
- Generated bundles are written under `AGENT_DEPLOY_ROOT` (default `generated-agent-ecosystems/`).
