import { tool } from '@openai/agents';
import { z } from 'zod';

const PROJECT_LAYOUT = [
  'backend/src/agentic/core',
  'backend/src/agentic/agents',
  'backend/src/agentic/guardrails',
  'backend/src/agentic/tools',
  'backend/src/agentic/application',
  'backend/src/agentic/presentation',
].join('\n');

export const projectContextTool = tool({
  name: 'project_context',
  description:
    'Returns the current repository context and the target bounded context for the agent ecosystem.',
  parameters: z.object({}),
  execute: async () => ({
    projectName: 'ocr-web-app',
    backendFramework: 'NestJS 10',
    runtime: 'Node.js',
    targetBoundedContext: 'backend/src/agentic',
    targetFolders: PROJECT_LAYOUT,
  }),
});

export const modelPolicyTool = tool({
  name: 'model_policy',
  description:
    'Returns the approved model allocation strategy for simple vs decision-heavy work.',
  parameters: z.object({}),
  execute: async () => ({
    simpleTasks: ['gpt-5-mini', 'gpt-5-nano'],
    decisionTasks: {
      model: 'gpt-5',
      reasoningEffort: 'high',
    },
    tracing: 'enabled-by-default-with-withTrace-wrapper',
  }),
});

export const architectureTools = [projectContextTool, modelPolicyTool];
