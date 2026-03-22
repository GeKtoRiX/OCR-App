import { Agent } from '@openai/agents';
import {
  createAnalyzeCoordinator,
  createDeploymentCoordinator,
  createInitializationCoordinator,
  createScaffoldCoordinator,
} from './agent-factory';

const models = {
  supervisor: 'gpt-5',
  planner: 'gpt-5',
  scaffold: 'gpt-5-mini',
  mapper: 'gpt-5-nano',
};

describe('agent-factory', () => {
  it('creates the analyze supervisor with the dependency mapper handoff', () => {
    const coordinator = createAnalyzeCoordinator(models);

    expect(coordinator).toBeInstanceOf(Agent);
    expect(coordinator.name).toBe('Analyze Supervisor');
    expect(coordinator.model).toBe('gpt-5');
    expect(coordinator.handoffs).toHaveLength(1);

    const mapper = coordinator.handoffs[0] as Agent;
    expect(mapper.name).toBe('Dependency Mapper');
    expect(mapper.model).toBe('gpt-5-nano');
    expect(mapper.tools.map((tool) => tool.name)).toEqual([
      'project_context',
      'model_policy',
    ]);
    expect(mapper.outputGuardrails.map((guardrail) => guardrail.name)).toEqual([
      'analyze-phase-output',
    ]);
  });

  it('creates the scaffold supervisor with the scaffold planner handoff', () => {
    const coordinator = createScaffoldCoordinator(models);

    expect(coordinator.name).toBe('Scaffold Supervisor');
    expect(coordinator.model).toBe('gpt-5');
    expect(coordinator.handoffs).toHaveLength(1);

    const planner = coordinator.handoffs[0] as Agent;
    expect(planner.name).toBe('Scaffold Planner');
    expect(planner.model).toBe('gpt-5-mini');
    expect(planner.tools.map((tool) => tool.name)).toEqual([
      'project_context',
      'model_policy',
    ]);
    expect(planner.outputGuardrails.map((guardrail) => guardrail.name)).toEqual([
      'scaffold-phase-output',
    ]);
  });

  it('creates the initialization supervisor with the initialization architect handoff', () => {
    const coordinator = createInitializationCoordinator(models);

    expect(coordinator.name).toBe('Initialization Supervisor');
    expect(coordinator.model).toBe('gpt-5');
    expect(coordinator.handoffs).toHaveLength(1);

    const architect = coordinator.handoffs[0] as Agent;
    expect(architect.name).toBe('Initialization Architect');
    expect(architect.model).toBe('gpt-5');
    expect(architect.tools.map((tool) => tool.name)).toEqual([
      'project_context',
      'model_policy',
    ]);
    expect(architect.outputGuardrails.map((guardrail) => guardrail.name)).toEqual([
      'initialize-phase-output',
    ]);
  });

  it('creates the deployment supervisor with deployment tools and guardrails', () => {
    const coordinator = createDeploymentCoordinator(models);

    expect(coordinator.name).toBe('Deployment Supervisor');
    expect(coordinator.model).toBe('gpt-5');
    expect(coordinator.handoffs).toHaveLength(1);

    const specialist = coordinator.handoffs[0] as Agent;
    expect(specialist.name).toBe('Deployment Specialist');
    expect(specialist.model).toBe('gpt-5-mini');
    expect(specialist.modelSettings.toolChoice).toBe('required');
    expect(specialist.tools.map((tool) => tool.name)).toEqual([
      'create_workspace_scaffold',
      'write_runtime_bundle',
      'summarize_runtime_bundle',
    ]);
    expect(
      specialist.outputGuardrails.map((guardrail) => guardrail.name),
    ).toEqual(['deployment-output']);
  });
});
