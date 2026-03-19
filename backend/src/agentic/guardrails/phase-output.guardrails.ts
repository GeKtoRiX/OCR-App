import { OutputGuardrail } from '@openai/agents';
import { z } from 'zod';
import { PhaseOutput, PhaseOutputSchema } from '../core/agent-ecosystem.schemas';

function hasDuplicateScaffoldPaths(output: PhaseOutput): boolean {
  const uniquePaths = new Set(output.scaffold.map((item) => item.path));
  return uniquePaths.size !== output.scaffold.length;
}

function createPhaseGuardrail(
  stage: PhaseOutput['stage'],
): OutputGuardrail<typeof PhaseOutputSchema> {
  return {
    name: `${stage}-phase-output`,
    execute: async ({ agentOutput }) => {
      const parsed = PhaseOutputSchema.safeParse(agentOutput);

      if (!parsed.success) {
        return {
          tripwireTriggered: true,
          outputInfo: z.treeifyError(parsed.error),
        };
      }

      const output = parsed.data;
      const stageMismatch = output.stage !== stage;
      const missingDependencies =
        stage === 'analyze' && output.dependencyTree.length === 0;
      const missingScaffold =
        stage === 'scaffold' && output.scaffold.length === 0;
      const missingBlueprints = output.agentBlueprints.length === 0;
      const duplicatePaths = hasDuplicateScaffoldPaths(output);

      return {
        tripwireTriggered:
          stageMismatch ||
          missingDependencies ||
          missingScaffold ||
          missingBlueprints ||
          duplicatePaths,
        outputInfo: {
          stageMismatch,
          missingDependencies,
          missingScaffold,
          missingBlueprints,
          duplicatePaths,
        },
      };
    },
  };
}

export const analyzePhaseGuardrail = createPhaseGuardrail('analyze');
export const scaffoldPhaseGuardrail = createPhaseGuardrail('scaffold');
export const initializePhaseGuardrail = createPhaseGuardrail('initialize');
