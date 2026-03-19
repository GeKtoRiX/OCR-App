import { HealthCheckUseCase } from './health-check.use-case';
import { LMStudioClient } from '../../infrastructure/lm-studio/lm-studio.client';
import { PaddleOCRHealthService } from '../../infrastructure/paddleocr/paddleocr-health.service';

describe('HealthCheckUseCase', () => {
  let useCase: HealthCheckUseCase;
  let mockLmStudioClient: jest.Mocked<LMStudioClient>;
  let mockPaddleOCRHealthService: jest.Mocked<PaddleOCRHealthService>;

  beforeEach(() => {
    mockLmStudioClient = {
      isReachable: jest.fn(),
      listModels: jest.fn(),
    } as unknown as jest.Mocked<LMStudioClient>;
    mockPaddleOCRHealthService = {
      isReachable: jest.fn(),
      listModels: jest.fn(),
      getDevice: jest.fn(),
    } as unknown as jest.Mocked<PaddleOCRHealthService>;

    useCase = new HealthCheckUseCase(
      mockLmStudioClient,
      mockPaddleOCRHealthService,
    );
  });

  it('should return both services as reachable with models when both are up', async () => {
    mockPaddleOCRHealthService.isReachable.mockResolvedValue(true);
    mockPaddleOCRHealthService.listModels.mockResolvedValue(['det', 'rec']);
    mockPaddleOCRHealthService.getDevice.mockResolvedValue('gpu');
    mockLmStudioClient.isReachable.mockResolvedValue(true);
    mockLmStudioClient.listModels.mockResolvedValue(['qwen/qwen3.5-9b']);

    const result = await useCase.execute();

    expect(result.paddleOcrReachable).toBe(true);
    expect(result.paddleOcrModels).toEqual(['det', 'rec']);
    expect(result.paddleOcrDevice).toBe('gpu');
    expect(result.lmStudioReachable).toBe(true);
    expect(result.lmStudioModels).toEqual(['qwen/qwen3.5-9b']);
  });

  it('should return empty model lists for services that are not reachable', async () => {
    mockPaddleOCRHealthService.isReachable.mockResolvedValue(false);
    mockLmStudioClient.isReachable.mockResolvedValue(true);
    mockLmStudioClient.listModels.mockResolvedValue(['qwen/qwen3.5-9b']);

    const result = await useCase.execute();

    expect(result.paddleOcrReachable).toBe(false);
    expect(result.paddleOcrModels).toEqual([]);
    expect(result.lmStudioReachable).toBe(true);
    expect(result.lmStudioModels).toEqual(['qwen/qwen3.5-9b']);
    expect(mockPaddleOCRHealthService.listModels).not.toHaveBeenCalled();
  });

  it('should treat reachability errors as service unavailable', async () => {
    mockPaddleOCRHealthService.isReachable.mockRejectedValue(
      new Error('Network error'),
    );
    mockLmStudioClient.isReachable.mockRejectedValue(new Error('Network error'));

    const result = await useCase.execute();

    expect(result.paddleOcrReachable).toBe(false);
    expect(result.paddleOcrModels).toEqual([]);
    expect(result.lmStudioReachable).toBe(false);
    expect(result.lmStudioModels).toEqual([]);
  });

  it('should keep reachability true even when listModels throws', async () => {
    mockPaddleOCRHealthService.isReachable.mockResolvedValue(true);
    mockPaddleOCRHealthService.listModels.mockRejectedValue(new Error('timeout'));
    mockPaddleOCRHealthService.getDevice.mockResolvedValue('cpu');
    mockLmStudioClient.isReachable.mockResolvedValue(true);
    mockLmStudioClient.listModels.mockRejectedValue(new Error('timeout'));

    const result = await useCase.execute();

    expect(result.paddleOcrReachable).toBe(true);
    expect(result.paddleOcrModels).toEqual([]);
    expect(result.lmStudioReachable).toBe(true);
    expect(result.lmStudioModels).toEqual([]);
  });
});
