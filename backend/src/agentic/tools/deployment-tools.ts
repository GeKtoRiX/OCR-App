import { mkdir, readFile, writeFile } from 'fs/promises';
import { existsSync } from 'fs';
import { relative, resolve, sep } from 'path';
import { tool } from '@openai/agents';
import { z } from 'zod';
import {
  AutonomousArchitecturePlan,
  AutonomousArchitecturePlanSchema,
  DeploymentArtifact,
} from '../core/agent-ecosystem.schemas';

function ensureInsideRoot(rootDir: string, targetPath: string): string {
  const resolvedRoot = resolve(rootDir);
  const resolvedTarget = resolve(targetPath);

  if (
    resolvedTarget !== resolvedRoot &&
    !resolvedTarget.startsWith(`${resolvedRoot}${sep}`)
  ) {
    throw new Error('Target path is outside the deployment root');
  }

  return resolvedTarget;
}

function statusForPath(path: string): 'created' | 'updated' {
  return existsSync(path) ? 'updated' : 'created';
}

function createRuntimeReadme(plan: AutonomousArchitecturePlan): string {
  const agentLines = plan.initialization.agentBlueprints
    .map(
      (agent) =>
        `- ${agent.name}: ${agent.role} | model=${agent.model} | reasoning=${agent.reasoningEffort}`,
    )
    .join('\n');

  return [
    '# Generated Agent Ecosystem',
    '',
    `Request: ${plan.request}`,
    '',
    '## Agents',
    agentLines,
    '',
    '## Tracing',
    `Workflow: ${plan.tracing.workflowName}`,
  ].join('\n');
}

function createAgentsBootstrap(plan: AutonomousArchitecturePlan): string {
  const blueprints = JSON.stringify(plan.initialization.agentBlueprints, null, 2);

  return [
    "export const generatedAgentBlueprints = ",
    `${blueprints} as const;`,
    '',
    'export function listGeneratedAgents() {',
    '  return generatedAgentBlueprints.map((agent) => agent.name);',
    '}',
  ].join('\n');
}

function createGuardrailsBootstrap(plan: AutonomousArchitecturePlan): string {
  const guardrails = plan.initialization.agentBlueprints.flatMap(
    (agent) => agent.guardrails,
  );

  return [
    'export const generatedGuardrails = [',
    ...guardrails.map((guardrail) => `  '${guardrail}',`),
    '] as const;',
  ].join('\n');
}

function createRuntimeConfig(plan: AutonomousArchitecturePlan): string {
  return [
    `export const tracingWorkflowName = '${plan.tracing.workflowName}';`,
    "export const defaultDecisionModel = 'gpt-5';",
    "export const defaultSimpleModels = ['gpt-5-mini', 'gpt-5-nano'] as const;",
  ].join('\n');
}

const createWorkspaceToolSchema = z.object({
  rootDir: z.string().min(1),
  workspaceName: z.string().min(1),
  scaffoldPaths: z.array(z.string().min(1)).min(1),
});

export const createWorkspaceTool = tool({
  name: 'create_workspace_scaffold',
  description:
    'Creates the deployment workspace and the requested directory scaffold under the safe deployment root.',
  parameters: createWorkspaceToolSchema,
  execute: async (input) => {
    const workspaceRoot = ensureInsideRoot(
      input.rootDir,
      resolve(input.rootDir, input.workspaceName),
    );

    const artifacts: DeploymentArtifact[] = [];
    const workspaceStatus = statusForPath(workspaceRoot);
    await mkdir(workspaceRoot, { recursive: true });
    artifacts.push({
      path: workspaceRoot,
      kind: 'directory',
      status: workspaceStatus,
    });

    for (const scaffoldPath of input.scaffoldPaths) {
      const normalizedPath = scaffoldPath.replace(/^backend\/src\/agentic[\\/]/, '');
      const targetPath = ensureInsideRoot(
        workspaceRoot,
        resolve(workspaceRoot, normalizedPath),
      );
      const status = statusForPath(targetPath);
      await mkdir(targetPath, { recursive: true });
      artifacts.push({
        path: targetPath,
        kind: 'directory',
        status,
      });
    }

    return {
      workspaceRoot,
      artifacts,
    };
  },
});

const writeBundleToolSchema = z.object({
  rootDir: z.string().min(1),
  workspaceName: z.string().min(1),
  plan: AutonomousArchitecturePlanSchema,
});

export const writeBundleTool = tool({
  name: 'write_runtime_bundle',
  description:
    'Writes the generated architecture plan, README, runtime config, guardrails, and bootstrap files into the workspace.',
  parameters: writeBundleToolSchema,
  execute: async (input) => {
    const workspaceRoot = ensureInsideRoot(
      input.rootDir,
      resolve(input.rootDir, input.workspaceName),
    );

    await mkdir(workspaceRoot, { recursive: true });

    const files = [
      {
        path: resolve(workspaceRoot, 'architecture-plan.json'),
        content: JSON.stringify(input.plan, null, 2),
      },
      {
        path: resolve(workspaceRoot, 'README.md'),
        content: createRuntimeReadme(input.plan),
      },
      {
        path: resolve(workspaceRoot, 'agents.ts'),
        content: createAgentsBootstrap(input.plan),
      },
      {
        path: resolve(workspaceRoot, 'guardrails.ts'),
        content: createGuardrailsBootstrap(input.plan),
      },
      {
        path: resolve(workspaceRoot, 'runtime-config.ts'),
        content: createRuntimeConfig(input.plan),
      },
    ];

    const artifacts: DeploymentArtifact[] = [];
    for (const file of files) {
      const target = ensureInsideRoot(workspaceRoot, file.path);
      const status = statusForPath(target);
      await writeFile(target, file.content, 'utf8');
      artifacts.push({
        path: target,
        kind: 'file',
        status,
      });
    }

    return {
      generatedFiles: files.map((file) => file.path),
      artifacts,
    };
  },
});

const summarizeBundleToolSchema = z.object({
  rootDir: z.string().min(1),
  workspaceName: z.string().min(1),
});

export const summarizeBundleTool = tool({
  name: 'summarize_runtime_bundle',
  description:
    'Reads the generated README and returns a deployment summary for the final report.',
  parameters: summarizeBundleToolSchema,
  execute: async (input) => {
    const workspaceRoot = ensureInsideRoot(
      input.rootDir,
      resolve(input.rootDir, input.workspaceName),
    );
    const readmePath = ensureInsideRoot(workspaceRoot, resolve(workspaceRoot, 'README.md'));
    const readme = await readFile(readmePath, 'utf8');

    return {
      rootDir: workspaceRoot,
      summary: readme.split('\n').slice(0, 6).join(' ').trim(),
      relativePath: relative(process.cwd(), workspaceRoot),
    };
  },
});

export const deploymentTools = [
  createWorkspaceTool,
  writeBundleTool,
  summarizeBundleTool,
];
