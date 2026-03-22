import { AgentEcosystemConfig } from './agent-ecosystem.config';

describe('AgentEcosystemConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.OPENAI_AGENT_SUPERVISOR_MODEL;
    delete process.env.OPENAI_AGENT_PLANNER_MODEL;
    delete process.env.OPENAI_AGENT_SCAFFOLD_MODEL;
    delete process.env.OPENAI_AGENT_MAPPER_MODEL;
    delete process.env.AGENT_TRACE_WORKFLOW_NAME;
    delete process.env.AGENT_DEPLOY_ROOT;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('provides default model allocation and tracing settings', () => {
    const config = new AgentEcosystemConfig();

    expect(config.getSettings()).toEqual({
      models: {
        supervisor: 'gpt-5',
        planner: 'gpt-5',
        scaffold: 'gpt-5-mini',
        mapper: 'gpt-5-nano',
      },
      tracingWorkflowName: 'autonomous-agent-ecosystem',
      deploymentRoot: expect.stringContaining('generated-agent-ecosystems'),
    });
  });

  it('reads custom model allocation and deployment settings from the environment', () => {
    process.env.OPENAI_AGENT_SUPERVISOR_MODEL = 'gpt-5-supervisor';
    process.env.OPENAI_AGENT_PLANNER_MODEL = 'gpt-5-planner';
    process.env.OPENAI_AGENT_SCAFFOLD_MODEL = 'gpt-5-mini-scaffold';
    process.env.OPENAI_AGENT_MAPPER_MODEL = 'gpt-5-nano-mapper';
    process.env.AGENT_TRACE_WORKFLOW_NAME = 'custom-trace';
    process.env.AGENT_DEPLOY_ROOT = 'tmp/agent-output';

    const config = new AgentEcosystemConfig();

    expect(config.getSettings()).toEqual({
      models: {
        supervisor: 'gpt-5-supervisor',
        planner: 'gpt-5-planner',
        scaffold: 'gpt-5-mini-scaffold',
        mapper: 'gpt-5-nano-mapper',
      },
      tracingWorkflowName: 'custom-trace',
      deploymentRoot: expect.stringContaining('tmp/agent-output'),
    });
  });
});
