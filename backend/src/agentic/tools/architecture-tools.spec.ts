import {
  architectureTools,
  modelPolicyTool,
  projectContextTool,
} from './architecture-tools';

describe('architecture-tools', () => {
  it('returns repository context for the target bounded context', async () => {
    const result = await projectContextTool.invoke({} as any, '{}');

    expect(result).toEqual({
      projectName: 'ocr-web-app',
      backendFramework: 'NestJS 10',
      runtime: 'Node.js',
      targetBoundedContext: 'backend/src/agentic',
      targetFolders: [
        'backend/src/agentic/core',
        'backend/src/agentic/agents',
        'backend/src/agentic/guardrails',
        'backend/src/agentic/tools',
        'backend/src/agentic/application',
        'backend/src/agentic/presentation',
      ].join('\n'),
    });
  });

  it('returns the approved model policy', async () => {
    const result = await modelPolicyTool.invoke({} as any, '{}');

    expect(result).toEqual({
      simpleTasks: ['gpt-5-mini', 'gpt-5-nano'],
      decisionTasks: {
        model: 'gpt-5',
        reasoningEffort: 'high',
      },
      tracing: 'enabled-by-default-with-withTrace-wrapper',
    });
  });

  it('exports the architecture tools in the expected order', () => {
    expect(architectureTools.map((tool) => tool.name)).toEqual([
      'project_context',
      'model_policy',
    ]);
  });
});
