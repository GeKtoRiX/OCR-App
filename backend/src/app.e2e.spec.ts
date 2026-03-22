import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './presentation/app.module';
import { IOCRService } from './domain/ports/ocr-service.port';
import { ITextStructuringService } from './domain/ports/text-structuring-service.port';
import { AgentEcosystemService } from './agentic/application/agent-ecosystem.service';
import { HealthCheckUseCase } from './application/use-cases/health-check.use-case';

const mockOCRService = {
  extractText: jest.fn().mockResolvedValue('Hello from OCR'),
};

const mockStructuringService = {
  structureAsMarkdown: jest.fn().mockResolvedValue('# Hello from OCR'),
};

const mockHealthCheckService = {
  execute: jest.fn().mockResolvedValue({
    paddleOcrReachable: true,
    paddleOcrModels: ['det', 'rec'],
    paddleOcrDevice: 'gpu',
    lmStudioReachable: true,
    lmStudioModels: ['qwen/qwen3.5-9b'],
    superToneReachable: true,
    kokoroReachable: true,
    f5TtsReachable: true,
    f5TtsDevice: 'gpu',
  }),
};

const mockAgentEcosystemService = {
  execute: jest.fn().mockResolvedValue({
    request: 'Design a multi-agent system',
    analysis: {
      stage: 'analyze',
      summary: 'Analysis complete',
      dependencyTree: [
        {
          id: 'chief-architect',
          description: 'Supervises the workflow',
          dependsOn: [],
        },
      ],
      scaffold: [],
      agentBlueprints: [
        {
          name: 'Dependency Mapper',
          role: 'Maps dependencies',
          instructionsSummary: 'Analyze dependencies',
          model: 'gpt-5-nano',
          reasoningEffort: 'low',
          handoffTargets: [],
          guardrails: ['analyze-phase-output'],
        },
      ],
      decisions: ['Use handoffs for phase routing'],
    },
    scaffold: {
      stage: 'scaffold',
      summary: 'Scaffold ready',
      dependencyTree: [],
      scaffold: [
        {
          path: 'backend/src/agentic/core',
          purpose: 'Core runtime types',
        },
      ],
      agentBlueprints: [
        {
          name: 'Scaffold Planner',
          role: 'Builds filesystem plan',
          instructionsSummary: 'Define directories',
          model: 'gpt-5-mini',
          reasoningEffort: 'low',
          handoffTargets: [],
          guardrails: ['scaffold-phase-output'],
        },
      ],
      decisions: ['Keep the module isolated under backend/src/agentic'],
    },
    initialization: {
      stage: 'initialize',
      summary: 'Initialization designed',
      dependencyTree: [],
      scaffold: [],
      agentBlueprints: [
        {
          name: 'Initialization Architect',
          role: 'Defines model allocation and tracing',
          instructionsSummary: 'Wire agents and tracing',
          model: 'gpt-5',
          reasoningEffort: 'high',
          handoffTargets: [],
          guardrails: ['initialize-phase-output'],
        },
      ],
      decisions: ['Wrap the workflow in withTrace'],
    },
    tracing: {
      enabled: true,
      workflowName: 'autonomous-agent-ecosystem',
    },
  }),
  deploy: jest.fn().mockResolvedValue({
    plan: {
      request: 'Design a multi-agent system',
      analysis: {
        stage: 'analyze',
        summary: 'Analysis complete',
        dependencyTree: [
          {
            id: 'chief-architect',
            description: 'Supervises the workflow',
            dependsOn: [],
          },
        ],
        scaffold: [],
        agentBlueprints: [
          {
            name: 'Dependency Mapper',
            role: 'Maps dependencies',
            instructionsSummary: 'Analyze dependencies',
            model: 'gpt-5-nano',
            reasoningEffort: 'low',
            handoffTargets: [],
            guardrails: ['analyze-phase-output'],
          },
        ],
        decisions: ['Use handoffs for phase routing'],
      },
      scaffold: {
        stage: 'scaffold',
        summary: 'Scaffold ready',
        dependencyTree: [],
        scaffold: [
          {
            path: 'backend/src/agentic/core',
            purpose: 'Core runtime types',
          },
        ],
        agentBlueprints: [
          {
            name: 'Scaffold Planner',
            role: 'Builds filesystem plan',
            instructionsSummary: 'Define directories',
            model: 'gpt-5-mini',
            reasoningEffort: 'low',
            handoffTargets: [],
            guardrails: ['scaffold-phase-output'],
          },
        ],
        decisions: ['Keep the module isolated under backend/src/agentic'],
      },
      initialization: {
        stage: 'initialize',
        summary: 'Initialization designed',
        dependencyTree: [],
        scaffold: [],
        agentBlueprints: [
          {
            name: 'Initialization Architect',
            role: 'Defines model allocation and tracing',
            instructionsSummary: 'Wire agents and tracing',
            model: 'gpt-5',
            reasoningEffort: 'high',
            handoffTargets: [],
            guardrails: ['initialize-phase-output'],
          },
        ],
        decisions: ['Wrap the workflow in withTrace'],
      },
      tracing: {
        enabled: true,
        workflowName: 'autonomous-agent-ecosystem',
      },
    },
    deployment: {
      workspaceName: 'demo-workspace',
      rootDir: 'generated-agent-ecosystems/demo-workspace',
      summary: 'Generated Agent Ecosystem',
      artifacts: [
        {
          path: 'generated-agent-ecosystems/demo-workspace',
          kind: 'directory',
          status: 'created',
        },
      ],
      generatedFiles: ['generated-agent-ecosystems/demo-workspace/README.md'],
    },
  }),
};

describe('App E2E (Image Processing)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(IOCRService)
      .useValue(mockOCRService)
      .overrideProvider(ITextStructuringService)
      .useValue(mockStructuringService)
      .overrideProvider(HealthCheckUseCase)
      .useValue(mockHealthCheckService)
      .overrideProvider(AgentEcosystemService)
      .useValue(mockAgentEcosystemService)
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    jest.clearAllMocks();
    mockOCRService.extractText.mockResolvedValue('Hello from OCR');
    mockStructuringService.structureAsMarkdown.mockResolvedValue(
      '# Hello from OCR',
    );
    mockHealthCheckService.execute.mockResolvedValue({
      paddleOcrReachable: true,
      paddleOcrModels: ['det', 'rec'],
      paddleOcrDevice: 'gpu',
      lmStudioReachable: true,
      lmStudioModels: ['qwen/qwen3.5-9b'],
      superToneReachable: true,
      kokoroReachable: true,
      f5TtsReachable: true,
      f5TtsDevice: 'gpu',
    });
    mockAgentEcosystemService.execute.mockResolvedValue({
      request: 'Design a multi-agent system',
      analysis: {
        stage: 'analyze',
        summary: 'Analysis complete',
        dependencyTree: [
          {
            id: 'chief-architect',
            description: 'Supervises the workflow',
            dependsOn: [],
          },
        ],
        scaffold: [],
        agentBlueprints: [
          {
            name: 'Dependency Mapper',
            role: 'Maps dependencies',
            instructionsSummary: 'Analyze dependencies',
            model: 'gpt-5-nano',
            reasoningEffort: 'low',
            handoffTargets: [],
            guardrails: ['analyze-phase-output'],
          },
        ],
        decisions: ['Use handoffs for phase routing'],
      },
      scaffold: {
        stage: 'scaffold',
        summary: 'Scaffold ready',
        dependencyTree: [],
        scaffold: [
          {
            path: 'backend/src/agentic/core',
            purpose: 'Core runtime types',
          },
        ],
        agentBlueprints: [
          {
            name: 'Scaffold Planner',
            role: 'Builds filesystem plan',
            instructionsSummary: 'Define directories',
            model: 'gpt-5-mini',
            reasoningEffort: 'low',
            handoffTargets: [],
            guardrails: ['scaffold-phase-output'],
          },
        ],
        decisions: ['Keep the module isolated under backend/src/agentic'],
      },
      initialization: {
        stage: 'initialize',
        summary: 'Initialization designed',
        dependencyTree: [],
        scaffold: [],
        agentBlueprints: [
          {
            name: 'Initialization Architect',
            role: 'Defines model allocation and tracing',
            instructionsSummary: 'Wire agents and tracing',
            model: 'gpt-5',
            reasoningEffort: 'high',
            handoffTargets: [],
            guardrails: ['initialize-phase-output'],
          },
        ],
        decisions: ['Wrap the workflow in withTrace'],
      },
      tracing: {
        enabled: true,
        workflowName: 'autonomous-agent-ecosystem',
      },
    });
    mockAgentEcosystemService.deploy.mockResolvedValue({
      plan: {
        request: 'Design a multi-agent system',
        analysis: {
          stage: 'analyze',
          summary: 'Analysis complete',
          dependencyTree: [
            {
              id: 'chief-architect',
              description: 'Supervises the workflow',
              dependsOn: [],
            },
          ],
          scaffold: [],
          agentBlueprints: [
            {
              name: 'Dependency Mapper',
              role: 'Maps dependencies',
              instructionsSummary: 'Analyze dependencies',
              model: 'gpt-5-nano',
              reasoningEffort: 'low',
              handoffTargets: [],
              guardrails: ['analyze-phase-output'],
            },
          ],
          decisions: ['Use handoffs for phase routing'],
        },
        scaffold: {
          stage: 'scaffold',
          summary: 'Scaffold ready',
          dependencyTree: [],
          scaffold: [
            {
              path: 'backend/src/agentic/core',
              purpose: 'Core runtime types',
            },
          ],
          agentBlueprints: [
            {
              name: 'Scaffold Planner',
              role: 'Builds filesystem plan',
              instructionsSummary: 'Define directories',
              model: 'gpt-5-mini',
              reasoningEffort: 'low',
              handoffTargets: [],
              guardrails: ['scaffold-phase-output'],
            },
          ],
          decisions: ['Keep the module isolated under backend/src/agentic'],
        },
        initialization: {
          stage: 'initialize',
          summary: 'Initialization designed',
          dependencyTree: [],
          scaffold: [],
          agentBlueprints: [
            {
              name: 'Initialization Architect',
              role: 'Defines model allocation and tracing',
              instructionsSummary: 'Wire agents and tracing',
              model: 'gpt-5',
              reasoningEffort: 'high',
              handoffTargets: [],
              guardrails: ['initialize-phase-output'],
            },
          ],
          decisions: ['Wrap the workflow in withTrace'],
        },
        tracing: {
          enabled: true,
          workflowName: 'autonomous-agent-ecosystem',
        },
      },
      deployment: {
        workspaceName: 'demo-workspace',
        rootDir: 'generated-agent-ecosystems/demo-workspace',
        summary: 'Generated Agent Ecosystem',
        artifacts: [
          {
            path: 'generated-agent-ecosystems/demo-workspace',
            kind: 'directory',
            status: 'created',
          },
        ],
        generatedFiles: ['generated-agent-ecosystems/demo-workspace/README.md'],
      },
    });
  });

  describe('POST /api/ocr - Image Processing', () => {
    it('should process image and return OCR result', async () => {
      const testBuffer = Buffer.from('fake-image-data');

      const response = await request(app.getHttpServer())
        .post('/api/ocr')
        .attach('image', testBuffer, {
          filename: 'test.png',
          contentType: 'image/png',
        })
        .expect(201);

      expect(response.body).toHaveProperty('rawText');
      expect(response.body).toHaveProperty('markdown');
      expect(response.body).toHaveProperty('filename');
      expect(response.body.filename).toBe('test.png');
      expect(response.body.rawText).toBe('Hello from OCR');
      expect(response.body.markdown).toBe('# Hello from OCR');
      expect(mockOCRService.extractText).toHaveBeenCalledTimes(1);
      expect(mockStructuringService.structureAsMarkdown).toHaveBeenCalledWith(
        'Hello from OCR',
      );
    });

    it('should return 400 when no file is sent', async () => {
      await request(app.getHttpServer()).post('/api/ocr').expect(400);
    });

    it('should return 400 for unsupported file type', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/ocr')
        .attach('image', Buffer.from('not-an-image'), {
          filename: 'test.txt',
          contentType: 'text/plain',
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });

    it('should return 502 when OCR service throws', async () => {
      mockOCRService.extractText.mockRejectedValue(
        new Error('OCR service down'),
      );

      await request(app.getHttpServer())
        .post('/api/ocr')
        .attach('image', Buffer.from('fake-image'), {
          filename: 'test.png',
          contentType: 'image/png',
        })
        .expect(502);
    });
  });

  describe('GET /api/health - Health Check', () => {
    it('should return health status', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/health')
        .expect(200);

      expect(response.body).toEqual({
        paddleOcrReachable: true,
        paddleOcrModels: ['det', 'rec'],
        paddleOcrDevice: 'gpu',
        lmStudioReachable: true,
        lmStudioModels: ['qwen/qwen3.5-9b'],
        superToneReachable: true,
        kokoroReachable: true,
        f5TtsReachable: true,
        f5TtsDevice: 'gpu',
      });
    });

    it('should not be throttled under repeated polling', async () => {
      for (let i = 0; i < 40; i += 1) {
        const response = await request(app.getHttpServer()).get('/api/health');
        expect(response.status).toBe(200);
        expect(response.body).toHaveProperty('paddleOcrReachable');
      }
    });
  });

  describe('POST /api/agents/architecture - Agent Ecosystem', () => {
    it('should return the autonomous architecture plan', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/agents/architecture')
        .send({ request: 'Design an autonomous agent ecosystem' })
        .expect(201);

      expect(response.body).toHaveProperty('analysis');
      expect(response.body).toHaveProperty('scaffold');
      expect(response.body).toHaveProperty('initialization');
      expect(response.body.tracing).toEqual({
        enabled: true,
        workflowName: 'autonomous-agent-ecosystem',
      });
      expect(mockAgentEcosystemService.execute).toHaveBeenCalledWith(
        'Design an autonomous agent ecosystem',
      );
    });

    it('should return 400 for an empty request body', async () => {
      await request(app.getHttpServer())
        .post('/api/agents/architecture')
        .send({ request: '   ' })
        .expect(400);
    });
  });

  describe('POST /api/agents/deploy - Agent Deployment', () => {
    it('should return the deployment result', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/agents/deploy')
        .send({
          request: 'Design an autonomous agent ecosystem',
          workspaceName: 'demo-workspace',
        })
        .expect(201);

      expect(response.body).toHaveProperty('plan');
      expect(response.body).toHaveProperty('deployment');
      expect(response.body.deployment.workspaceName).toBe('demo-workspace');
      expect(mockAgentEcosystemService.deploy).toHaveBeenCalledWith({
        request: 'Design an autonomous agent ecosystem',
        workspaceName: 'demo-workspace',
      });
    });

    it('should return 400 for an empty deploy request', async () => {
      await request(app.getHttpServer())
        .post('/api/agents/deploy')
        .send({ request: '' })
        .expect(400);
    });
  });
});
