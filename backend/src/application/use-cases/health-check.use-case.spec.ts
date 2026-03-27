import { HealthCheckUseCase } from './health-check.use-case';
import { ILmStudioHealthPort } from '../../domain/ports/lm-studio-health.port';
import { IPaddleOcrHealthPort } from '../../domain/ports/paddle-ocr-health.port';
import { ISupertonePort } from '../../domain/ports/supertone.port';
import { IKokoroPort } from '../../domain/ports/kokoro.port';
import { IF5TtsPort } from '../../domain/ports/f5-tts.port';
import { IVoxtralTtsPort } from '../../domain/ports/voxtral-tts.port';

describe('HealthCheckUseCase', () => {
  let useCase: HealthCheckUseCase;
  let mockLmStudioHealth: jest.Mocked<ILmStudioHealthPort>;
  let mockPaddleOcrHealth: jest.Mocked<IPaddleOcrHealthPort>;
  let mockSupertone: jest.Mocked<ISupertonePort>;
  let mockKokoro: jest.Mocked<IKokoroPort>;
  let mockF5Tts: jest.Mocked<IF5TtsPort>;
  let mockVoxtralTts: jest.Mocked<IVoxtralTtsPort>;

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
    mockF5Tts = {
      getHealth: jest.fn().mockResolvedValue({ reachable: false, device: null }),
      synthesize: jest.fn(),
    } as unknown as jest.Mocked<IF5TtsPort>;
    mockVoxtralTts = {
      getHealth: jest.fn().mockResolvedValue({ reachable: false, device: null }),
      synthesize: jest.fn(),
    } as unknown as jest.Mocked<IVoxtralTtsPort>;

    useCase = new HealthCheckUseCase(
      mockLmStudioHealth,
      mockPaddleOcrHealth,
      mockSupertone,
      mockKokoro,
      mockF5Tts,
      mockVoxtralTts,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should return both services as reachable with models when both are up', async () => {
    mockPaddleOcrHealth.isReachable.mockResolvedValue(true);
    mockPaddleOcrHealth.listModels.mockResolvedValue(['det', 'rec']);
    mockPaddleOcrHealth.getDevice.mockResolvedValue('gpu');
    mockLmStudioHealth.isReachable.mockResolvedValue(true);
    mockLmStudioHealth.listModels.mockResolvedValue(['qwen/qwen3.5-9b']);
    mockSupertone.checkHealth.mockResolvedValue(true);
    mockKokoro.checkHealth.mockResolvedValue(true);
    mockF5Tts.getHealth.mockResolvedValue({
      reachable: true,
      device: 'gpu',
    });
    mockVoxtralTts.getHealth.mockResolvedValue({
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
    expect(result.f5TtsReachable).toBe(true);
    expect(result.f5TtsDevice).toBe('gpu');
    expect(result.voxtralReachable).toBe(true);
    expect(result.voxtralDevice).toBe('gpu');
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
    expect(result.f5TtsReachable).toBe(false);
    expect(result.voxtralReachable).toBe(false);
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
    expect(result.f5TtsReachable).toBe(false);
    expect(result.f5TtsDevice).toBeNull();
    expect(result.voxtralReachable).toBe(false);
    expect(result.voxtralDevice).toBeNull();
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
    expect(result.f5TtsReachable).toBe(false);
    expect(result.voxtralReachable).toBe(false);
  });

  it('returns the cached result while the TTL is still valid', async () => {
    jest
      .spyOn(Date, 'now')
      .mockReturnValueOnce(1_000)
      .mockReturnValueOnce(5_000);

    mockPaddleOcrHealth.isReachable.mockResolvedValue(true);
    mockPaddleOcrHealth.listModels.mockResolvedValue(['det']);
    mockPaddleOcrHealth.getDevice.mockResolvedValue('gpu');
    mockLmStudioHealth.isReachable.mockResolvedValue(true);
    mockLmStudioHealth.listModels.mockResolvedValue(['qwen/qwen3.5-9b']);

    const first = await useCase.execute();
    const second = await useCase.execute();

    expect(second).toEqual(first);
    expect(mockPaddleOcrHealth.isReachable).toHaveBeenCalledTimes(1);
    expect(mockLmStudioHealth.isReachable).toHaveBeenCalledTimes(1);
    expect(mockF5Tts.getHealth).toHaveBeenCalledTimes(1);
    expect(mockVoxtralTts.getHealth).toHaveBeenCalledTimes(1);
  });
});
