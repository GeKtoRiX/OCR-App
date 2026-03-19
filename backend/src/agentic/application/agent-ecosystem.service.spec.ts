import { AgentEcosystemConfig } from '../core/agent-ecosystem.config';

describe('AgentEcosystemConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should provide default model allocation and tracing settings', () => {
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
});
