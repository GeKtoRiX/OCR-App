# ADR Register

## ADR-001: Keep OCR Backend In Clean/Hexagonal NestJS Structure

- Status: accepted
- Context: OCR API, health check and integrations must evolve without mixing domain logic and infrastructure.
- Decision: backend preserves the `domain`, `application`, `infrastructure`, `presentation` layers.
- Consequence: new services and controllers must fit into the existing layers and must not bypass them.

## ADR-002: Isolate Agentic Runtime In Separate Bounded Context

- Status: accepted
- Context: agent orchestration and deployment workflow must not blur the core OCR backend.
- Decision: all agent-related code lives in `backend/src/agentic/*`.
- Consequence: agentic changes must be documented separately and must not break the OCR runtime.

## ADR-003: Default OCR Path Is PaddleOCR Sidecar

- Status: accepted
- Context: the base OCR path must work locally without mandatory cloud key dependencies.
- Decision: OCR always goes through the PaddleOCR sidecar; LM Studio is used only to structure raw text after OCR.
- Consequence: production and dev runbooks must cover the sidecar scenario first.

## ADR-004: Agent Handoffs Must Be Schema-Driven

- Status: accepted
- Context: phase outputs between analyze/scaffold/initialize/deploy must be reproducible and validatable.
- Decision: handoff contracts are defined via `zod` schemas and DTOs.
- Consequence: any change to a phase payload requires simultaneous updates to both code and documentation.

## ADR-005: Documentation Is Part Of Runtime Safety

- Status: accepted
- Context: autonomous agent operation is impossible without explicit descriptions of structure, current status and decisions.
- Decision: `agents.md`, `structure.md`, `docs/agents/context.md`, `docs/agents/adr.md` are mandatory operational documents.
- Consequence: architectural changes are not considered complete without updating these files.
