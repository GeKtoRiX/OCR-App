import { HealthCheckUseCase } from './health-check.use-case';
import { ILmStudioHealthPort } from '../../domain/ports/lm-studio-health.port';
import { IPaddleOcrHealthPort } from '../../domain/ports/paddle-ocr-health.port';
import { ISupertonePort } from '../../domain/ports/supertone.port';
import { IKokoroPort } from '../../domain/ports/kokoro.port';
import { IQwenTtsPort } from '../../domain/ports/qwen-tts.port';

describe('HealthCheckUseCase', () => {
  let useCase: HealthCheckUseCase;
  let mockLmStudioHealth: jest.Mocked<ILmStudioHealthPort>;
  let mockPaddleOcrHealth: jest.Mocked<IPaddleOcrHealthPort>;
  let mockSupertone: jest.Mocked<ISupertonePort>;
  let mockKokoro: jest.Mocked<IKokoroPort>;
  let mockQwenTts: jest.Mocked<IQwenTtsPort>;

  beforeEach(() => {
    mockLmStudioHealth = {
      isReachable: jest.fn(),
      listModels: jest.fn(),
    } as unknown as jest.Mocked<ILmStudioHealthPort>;
    mockPaddleOcrHealth = {
      isReachable: jest.fn(),
      listModels: jest.fn(),
      getDevice: jest.fn(),
    } as unknown as jest.Mocked<IPaddleOcrHealthPort>;
    mockSupertone = {
      checkHealth: jest.fn().mockResolvedValue(false),
      synthesize: jest.fn(),
    } as unknown as jest.Mocked<ISupertonePort>;
    mockKokoro = {
      checkHealth: jest.fn().mockResolvedValue(false),
      synthesize: jest.fn(),
    } as unknown as jest.Mocked<IKokoroPort>;
    mockQwenTts = {
      getHealth: jest.fn().mockResolvedValue({ reachable: false, device: null }),
      synthesize: jest.fn(),
    } as unknown as jest.Mocked<IQwenTtsPort>;

    useCase = new HealthCheckUseCase(
      mockLmStudioHealth,
      mockPaddleOcrHealth,
      mockSupertone,
      mockKokoro,
      mockQwenTts,
    );
  });

  it('should return both services as reachable with models when both are up', async () => {
    mockPaddleOcrHealth.isReachable.mockResolvedValue(true);
    mockPaddleOcrHealth.listModels.mockResolvedValue(['det', 'rec']);
    mockPaddleOcrHealth.getDevice.mockResolvedValue('gpu');
    mockLmStudioHealth.isReachable.mockResolvedValue(true);
    mockLmStudioHealth.listModels.mockResolvedValue(['qwen/qwen3.5-9b']);
    mockSupertone.checkHealth.mockResolvedValue(true);
    mockKokoro.checkHealth.mockResolvedValue(true);
    mockQwenTts.getHealth.mockResolvedValue({
      reachable: true,
      device: 'gpu',
    });

    const result = await useCase.execute();

    expect(result.paddleOcrReachable).toBe(true);
    expect(result.paddleOcrModels).toEqual(['det', 'rec']);
    expect(result.paddleOcrDevice).toBe('gpu');
    expect(result.lmStudioReachable).toBe(true);
    expect(result.lmStudioModels).toEqual(['qwen/qwen3.5-9b']);
    expect(result.superToneReachable).toBe(true);
    expect(result.kokoroReachable).toBe(true);
    expect(result.qwenTtsReachable).toBe(true);
    expect(result.qwenTtsDevice).toBe('gpu');
  });

  it('should return empty model lists for services that are not reachable', async () => {
    mockPaddleOcrHealth.isReachable.mockResolvedValue(false);
    mockLmStudioHealth.isReachable.mockResolvedValue(true);
    mockLmStudioHealth.listModels.mockResolvedValue(['qwen/qwen3.5-9b']);

    const result = await useCase.execute();

    expect(result.paddleOcrReachable).toBe(false);
    expect(result.paddleOcrModels).toEqual([]);
    expect(result.lmStudioReachable).toBe(true);
    expect(result.lmStudioModels).toEqual(['qwen/qwen3.5-9b']);
    expect(result.kokoroReachable).toBe(false);
    expect(result.qwenTtsReachable).toBe(false);
    expect(mockPaddleOcrHealth.listModels).not.toHaveBeenCalled();
  });

  it('should treat reachability errors as service unavailable', async () => {
    mockPaddleOcrHealth.isReachable.mockRejectedValue(
      new Error('Network error'),
    );
    mockLmStudioHealth.isReachable.mockRejectedValue(new Error('Network error'));

    const result = await useCase.execute();

    expect(result.paddleOcrReachable).toBe(false);
    expect(result.paddleOcrModels).toEqual([]);
    expect(result.lmStudioReachable).toBe(false);
    expect(result.lmStudioModels).toEqual([]);
    expect(result.kokoroReachable).toBe(false);
    expect(result.qwenTtsReachable).toBe(false);
    expect(result.qwenTtsDevice).toBeNull();
  });

  it('should keep reachability true even when listModels throws', async () => {
    mockPaddleOcrHealth.isReachable.mockResolvedValue(true);
    mockPaddleOcrHealth.listModels.mockRejectedValue(new Error('timeout'));
    mockPaddleOcrHealth.getDevice.mockResolvedValue('cpu');
    mockLmStudioHealth.isReachable.mockResolvedValue(true);
    mockLmStudioHealth.listModels.mockRejectedValue(new Error('timeout'));

    const result = await useCase.execute();

    expect(result.paddleOcrReachable).toBe(true);
    expect(result.paddleOcrModels).toEqual([]);
    expect(result.lmStudioReachable).toBe(true);
    expect(result.lmStudioModels).toEqual([]);
    expect(result.kokoroReachable).toBe(false);
    expect(result.qwenTtsReachable).toBe(false);
  });
});
