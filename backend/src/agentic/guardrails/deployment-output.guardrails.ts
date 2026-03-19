import { existsSync } from 'fs';
import { OutputGuardrail } from '@openai/agents';
import {
  DeploymentReport,
  DeploymentReportSchema,
} from '../core/agent-ecosystem.schemas';

function allArtifactsExist(report: DeploymentReport): boolean {
  return report.artifacts.every((artifact) => existsSync(artifact.path));
}

export const deploymentOutputGuardrail: OutputGuardrail<
  typeof DeploymentReportSchema
> = {
  name: 'deployment-output',
  execute: async ({ agentOutput }) => {
    const parsed = DeploymentReportSchema.safeParse(agentOutput);

    if (!parsed.success) {
      return {
        tripwireTriggered: true,
        outputInfo: parsed.error.flatten(),
      };
    }

    const report = parsed.data;
    const artifactsExist = allArtifactsExist(report);

    return {
      tripwireTriggered:
        report.generatedFiles.length === 0 || report.artifacts.length === 0 || !artifactsExist,
      outputInfo: {
        artifactsExist,
        generatedFiles: report.generatedFiles.length,
        artifacts: report.artifacts.length,
      },
    };
  },
};
