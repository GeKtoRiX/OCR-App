jest.mock('@openai/agents', () => ({
  run: jest.fn(),
  withTrace: jest.fn(async (_name: string, fn: () => unknown) => fn()),
}));

jest.mock('../agents/agent-factory', () => ({
  createAnalyzeCoordinator: jest.fn(),
  createScaffoldCoordinator: jest.fn(),
  createInitializationCoordinator: jest.fn(),
  createDeploymentCoordinator: jest.fn(),
}));

import { run, withTrace } from '@openai/agents';
import {
  createAnalyzeCoordinator,
  createDeploymentCoordinator,
  createInitializationCoordinator,
  createScaffoldCoordinator,
} from '../agents/agent-factory';
import { AgentEcosystemService } from './agent-ecosystem.service';
import { AgentEcosystemConfig } from '../core/agent-ecosystem.config';
import type {
  AutonomousArchitecturePlan,
  DeploymentReport,
  PhaseOutput,
} from '../core/agent-ecosystem.schemas';

const runMock = run as jest.MockedFunction<typeof run>;
const withTraceMock = withTrace as jest.Mock;
const createAnalyzeCoordinatorMock =
  createAnalyzeCoordinator as jest.MockedFunction<typeof createAnalyzeCoordinator>;
const createScaffoldCoordinatorMock =
  createScaffoldCoordinator as jest.MockedFunction<typeof createScaffoldCoordinator>;
const createInitializationCoordinatorMock =
  createInitializationCoordinator as jest.MockedFunction<typeof createInitializationCoordinator>;
const createDeploymentCoordinatorMock =
  createDeploymentCoordinator as jest.MockedFunction<typeof createDeploymentCoordinator>;

function createPhaseOutput(stage: PhaseOutput['stage']): PhaseOutput {
  return {
    stage,
    summary: `${stage} summary`,
    dependencyTree: [
      {
        id: `${stage}-node`,
        description: `${stage} dependency`,
        dependsOn: [],
      },
    ],
    scaffold: [
      {
        path: `backend/src/agentic/${stage}`,
        purpose: `${stage} folder`,
      },
    ],
    agentBlueprints: [
      {
        name: `${stage}-agent`,
        role: `${stage} role`,
        instructionsSummary: `${stage} instructions`,
        model: 'gpt-5',
        reasoningEffort: 'high',
        handoffTargets: [],
        guardrails: [`${stage}-guardrail`],
      },
    ],
    decisions: [`${stage} decision`],
  };
}

describe('AgentEcosystemService', () => {
  const settings = {
    models: {
      supervisor: 'gpt-5',
      planner: 'gpt-5',
      scaffold: 'gpt-5-mini',
      mapper: 'gpt-5-nano',
    },
    tracingWorkflowName: 'agent-trace',
    deploymentRoot: '/tmp/generated-agent-ecosystems',
  };

  const analysisOutput = createPhaseOutput('analyze');
  const scaffoldOutput = createPhaseOutput('scaffold');
  const initializationOutput = createPhaseOutput('initialize');

  let service: AgentEcosystemService;
  let config: jest.Mocked<AgentEcosystemConfig>;
  let analysisAgent: object;
  let scaffoldAgent: object;
  let initializationAgent: object;
  let deploymentAgent: object;

  beforeEach(() => {
    jest.clearAllMocks();

    config = {
      getSettings: jest.fn().mockReturnValue(settings),
    } as unknown as jest.Mocked<AgentEcosystemConfig>;

    analysisAgent = { id: 'analysis-agent' };
    scaffoldAgent = { id: 'scaffold-agent' };
    initializationAgent = { id: 'init-agent' };
    deploymentAgent = { id: 'deployment-agent' };

    createAnalyzeCoordinatorMock.mockReturnValue(analysisAgent as any);
    createScaffoldCoordinatorMock.mockReturnValue(scaffoldAgent as any);
    createInitializationCoordinatorMock.mockReturnValue(initializationAgent as any);
    createDeploymentCoordinatorMock.mockReturnValue(deploymentAgent as any);
    withTraceMock.mockImplementation(async (_name: string, fn: () => unknown) => fn());

    service = new AgentEcosystemService(config);
  });

  it('builds the architecture plan through analysis, scaffold, and initialization phases', async () => {
    runMock
      .mockResolvedValueOnce({ finalOutput: analysisOutput } as any)
      .mockResolvedValueOnce({ finalOutput: scaffoldOutput } as any)
      .mockResolvedValueOnce({ finalOutput: initializationOutput } as any);

    const result = await service.execute('Build an agent ecosystem for OCR workflows');

    expect(config.getSettings).toHaveBeenCalledTimes(1);
    expect(createAnalyzeCoordinatorMock).toHaveBeenCalledWith(settings.models);
    expect(createScaffoldCoordinatorMock).toHaveBeenCalledWith(settings.models);
    expect(createInitializationCoordinatorMock).toHaveBeenCalledWith(settings.models);
    expect(createDeploymentCoordinatorMock).not.toHaveBeenCalled();

    expect(withTraceMock).toHaveBeenCalledWith(
      'agent-trace',
      expect.any(Function),
      { name: 'agent-trace' },
    );

    expect(runMock).toHaveBeenNthCalledWith(
      1,
      analysisAgent,
      expect.stringContaining('Stage: analyze.'),
      {
        context: {
          projectName: 'ocr-web-app',
          runtime: 'node',
          framework: 'nestjs',
          requestedBy: 'chief-architect',
        },
      },
    );
    expect(runMock).toHaveBeenNthCalledWith(
      2,
      scaffoldAgent,
      expect.stringContaining(`Analysis phase output: ${JSON.stringify(analysisOutput)}`),
      expect.any(Object),
    );
    expect(runMock).toHaveBeenNthCalledWith(
      3,
      initializationAgent,
      expect.stringContaining(`Scaffold phase output: ${JSON.stringify(scaffoldOutput)}`),
      expect.any(Object),
    );

    expect(result).toEqual<AutonomousArchitecturePlan>({
      request: 'Build an agent ecosystem for OCR workflows',
      analysis: analysisOutput as AutonomousArchitecturePlan['analysis'],
      scaffold: scaffoldOutput as AutonomousArchitecturePlan['scaffold'],
      initialization:
        initializationOutput as AutonomousArchitecturePlan['initialization'],
      tracing: {
        enabled: true,
        workflowName: 'agent-trace',
      },
    });
  });

  it('deploys a generated plan with a sanitized explicit workspace name', async () => {
    const deployment: DeploymentReport = {
      workspaceName: 'bad-name--',
      rootDir: '/tmp/generated-agent-ecosystems/bad-name--',
      summary: 'Deployment summary',
      artifacts: [
        {
          path: '/tmp/generated-agent-ecosystems/bad-name--/README.md',
          kind: 'file',
          status: 'created',
        },
      ],
      generatedFiles: [
        '/tmp/generated-agent-ecosystems/bad-name--/README.md',
      ],
    };

    runMock
      .mockResolvedValueOnce({ finalOutput: analysisOutput } as any)
      .mockResolvedValueOnce({ finalOutput: scaffoldOutput } as any)
      .mockResolvedValueOnce({ finalOutput: initializationOutput } as any)
      .mockResolvedValueOnce({ finalOutput: deployment } as any);

    const result = await service.deploy({
      request: 'Deploy the generated ecosystem',
      workspaceName: ' bad name!* ',
    });

    expect(createDeploymentCoordinatorMock).toHaveBeenCalledWith(settings.models);
    expect(withTraceMock).toHaveBeenNthCalledWith(
      2,
      'agent-trace-deployment',
      expect.any(Function),
      { name: 'agent-trace-deployment' },
    );
    expect(runMock).toHaveBeenNthCalledWith(
      4,
      deploymentAgent,
      expect.stringContaining('Workspace name: bad-name--'),
      expect.any(Object),
    );
    expect(runMock).toHaveBeenNthCalledWith(
      4,
      deploymentAgent,
      expect.stringContaining(`Deployment root: ${settings.deploymentRoot}`),
      expect.any(Object),
    );
    expect(runMock).toHaveBeenNthCalledWith(
      4,
      deploymentAgent,
      expect.stringContaining(
        `Scaffold paths: ${JSON.stringify(scaffoldOutput.scaffold.map((item) => item.path))}`,
      ),
      expect.any(Object),
    );

    expect(result).toEqual({
      plan: {
        request: 'Deploy the generated ecosystem',
        analysis: analysisOutput,
        scaffold: scaffoldOutput,
        initialization: initializationOutput,
        tracing: {
          enabled: true,
          workflowName: 'agent-trace',
        },
      },
      deployment,
    });
  });

  it('falls back to a request-based workspace slug when no workspace name is provided', async () => {
    jest.spyOn(Date, 'now').mockReturnValue(1700000000000);
    const deployment: DeploymentReport = {
      workspaceName: 'ignored-by-service',
      rootDir: '/tmp/generated-agent-ecosystems/agent',
      summary: 'Deployment summary',
      artifacts: [
        {
          path: '/tmp/generated-agent-ecosystems/agent/README.md',
          kind: 'file',
          status: 'created',
        },
      ],
      generatedFiles: ['/tmp/generated-agent-ecosystems/agent/README.md'],
    };

    runMock
      .mockResolvedValueOnce({ finalOutput: analysisOutput } as any)
      .mockResolvedValueOnce({ finalOutput: scaffoldOutput } as any)
      .mockResolvedValueOnce({ finalOutput: initializationOutput } as any)
      .mockResolvedValueOnce({ finalOutput: deployment } as any);

    await service.deploy({
      request: 'Agent Ecosystem!!!',
      workspaceName: '   ',
    });

    expect(runMock).toHaveBeenNthCalledWith(
      4,
      deploymentAgent,
      expect.stringContaining('Workspace name: agent-ecosystem-1700000000000'),
      expect.any(Object),
    );
  });
});
