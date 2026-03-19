import { HealthController } from './health.controller';
import { HealthCheckUseCase } from '../../application/use-cases/health-check.use-case';

describe('HealthController', () => {
  let controller: HealthController;
  let mockHealthCheck: jest.Mocked<HealthCheckUseCase>;
  let mockRes: any;

  beforeEach(() => {
    mockHealthCheck = { execute: jest.fn() } as any;
    controller = new HealthController(mockHealthCheck);
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
  });

  it('should return 200 when both PaddleOCR and LM Studio are reachable', async () => {
    const result = {
      paddleOcrReachable: true,
      paddleOcrModels: ['det'],
      paddleOcrDevice: 'gpu' as const,
      lmStudioReachable: true,
      lmStudioModels: ['qwen/qwen3.5-9b'],
    };
    mockHealthCheck.execute.mockResolvedValue(result);

    await controller.getHealth(mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(200);
    expect(mockRes.json).toHaveBeenCalledWith(result);
  });

  it('should return 503 when a required dependency is not reachable', async () => {
    const result = {
      paddleOcrReachable: false,
      paddleOcrModels: [],
      paddleOcrDevice: null,
      lmStudioReachable: true,
      lmStudioModels: ['qwen/qwen3.5-9b'],
    };
    mockHealthCheck.execute.mockResolvedValue(result);

    await controller.getHealth(mockRes);

    expect(mockRes.status).toHaveBeenCalledWith(503);
    expect(mockRes.json).toHaveBeenCalledWith(result);
  });
});
