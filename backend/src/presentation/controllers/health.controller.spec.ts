import { HealthController } from './health.controller';
import { HealthCheckUseCase } from '../../application/use-cases/health-check.use-case';

describe('HealthController', () => {
  let controller: HealthController;
  let mockHealthCheck: jest.Mocked<HealthCheckUseCase>;

  beforeEach(() => {
    mockHealthCheck = { execute: jest.fn() } as any;
    controller = new HealthController(mockHealthCheck);
  });

  it('should return health data when all services are reachable', async () => {
    const result = {
      paddleOcrReachable: true,
      paddleOcrModels: ['det'],
      paddleOcrDevice: 'gpu' as const,
      lmStudioReachable: true,
      lmStudioModels: ['qwen/qwen3.5-9b'],
      superToneReachable: true,
      kokoroReachable: true,
      f5TtsReachable: true,
      f5TtsDevice: 'gpu' as const,
    };
    mockHealthCheck.execute.mockResolvedValue(result);

    const response = await controller.getHealth();

    expect(response).toEqual(result);
  });

  it('should return health data with unreachable services (always 200)', async () => {
    const result = {
      paddleOcrReachable: false,
      paddleOcrModels: [],
      paddleOcrDevice: null,
      lmStudioReachable: false,
      lmStudioModels: [],
      superToneReachable: false,
      kokoroReachable: false,
      f5TtsReachable: false,
      f5TtsDevice: null,
    };
    mockHealthCheck.execute.mockResolvedValue(result);

    const response = await controller.getHealth();

    expect(response).toEqual(result);
  });
});
