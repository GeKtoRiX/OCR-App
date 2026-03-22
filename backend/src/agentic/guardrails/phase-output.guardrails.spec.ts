import {
  analyzePhaseGuardrail,
  initializePhaseGuardrail,
  scaffoldPhaseGuardrail,
} from './phase-output.guardrails';
import type { PhaseOutput } from '../core/agent-ecosystem.schemas';

function createOutput(stage: PhaseOutput['stage']): PhaseOutput {
  return {
    stage,
    summary: `${stage} summary`,
    dependencyTree: [
      {
        id: 'node-1',
        description: 'dependency',
        dependsOn: [],
      },
    ],
    scaffold: [
      {
        path: 'backend/src/agentic/core',
        purpose: 'core folder',
      },
    ],
    agentBlueprints: [
      {
        name: 'agent-1',
        role: 'planner',
        instructionsSummary: 'summary',
        model: 'gpt-5',
        reasoningEffort: 'high',
        handoffTargets: [],
        guardrails: ['guardrail-1'],
      },
    ],
    decisions: ['decision-1'],
  };
}

describe('phase-output.guardrails', () => {
  it('allows a valid analyze phase output', async () => {
    await expect(
      analyzePhaseGuardrail.execute({ agentOutput: createOutput('analyze') } as any),
    ).resolves.toEqual({
      tripwireTriggered: false,
      outputInfo: {
        stageMismatch: false,
        missingDependencies: false,
        missingScaffold: false,
        missingBlueprints: false,
        duplicatePaths: false,
      },
    });
  });

  it('triggers when the schema is invalid', async () => {
    const result = await analyzePhaseGuardrail.execute({
      agentOutput: { stage: 'analyze' },
    } as any);

    expect(result.tripwireTriggered).toBe(true);
    expect(result.outputInfo).toBeTruthy();
  });

  it('triggers analyze guardrails for stage mismatches and missing dependencies', async () => {
    const result = await analyzePhaseGuardrail.execute({
      agentOutput: {
        ...createOutput('initialize'),
        dependencyTree: [],
      },
    } as any);

    expect(result).toEqual({
      tripwireTriggered: true,
      outputInfo: {
        stageMismatch: true,
        missingDependencies: true,
        missingScaffold: false,
        missingBlueprints: false,
        duplicatePaths: false,
      },
    });
  });

  it('triggers scaffold guardrails for missing scaffold items and duplicate paths', async () => {
    const result = await scaffoldPhaseGuardrail.execute({
      agentOutput: {
        ...createOutput('scaffold'),
        scaffold: [
          {
            path: 'backend/src/agentic/core',
            purpose: 'core folder',
          },
          {
            path: 'backend/src/agentic/core',
            purpose: 'duplicate core folder',
          },
        ],
      },
    } as any);

    expect(result).toEqual({
      tripwireTriggered: true,
      outputInfo: {
        stageMismatch: false,
        missingDependencies: false,
        missingScaffold: false,
        missingBlueprints: false,
        duplicatePaths: true,
      },
    });
  });

  it('triggers initialize guardrails when agent blueprints are missing', async () => {
    const result = await initializePhaseGuardrail.execute({
      agentOutput: {
        ...createOutput('initialize'),
        agentBlueprints: [],
      },
    } as any);

    expect(result).toEqual({
      tripwireTriggered: true,
      outputInfo: {
        stageMismatch: false,
        missingDependencies: false,
        missingScaffold: false,
        missingBlueprints: true,
        duplicatePaths: false,
      },
    });
  });
});
