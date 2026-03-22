import { Injectable } from '@nestjs/common';
import { HealthCheckOutput } from '../dto/health-check.dto';
import { IPaddleOcrHealthPort } from '../../domain/ports/paddle-ocr-health.port';
import { ILmStudioHealthPort } from '../../domain/ports/lm-studio-health.port';
import { ISupertonePort } from '../../domain/ports/supertone.port';
import { IKokoroPort } from '../../domain/ports/kokoro.port';
import { IF5TtsPort } from '../../domain/ports/f5-tts.port';

const CACHE_TTL_MS = 10_000;
const LM_STUDIO_SMOKE_ONLY = process.env.LM_STUDIO_SMOKE_ONLY === 'true';

@Injectable()
export class HealthCheckUseCase {
  private cachedResult: HealthCheckOutput | null = null;
  private cachedAt = 0;

  constructor(
    private readonly lmStudioHealth: ILmStudioHealthPort,
    private readonly paddleOcrHealth: IPaddleOcrHealthPort,
    private readonly supertone: ISupertonePort,
    private readonly kokoro: IKokoroPort,
    private readonly f5Tts: IF5TtsPort,
  ) {}

  async execute(): Promise<HealthCheckOutput> {
    const now = Date.now();
    if (this.cachedResult && now - this.cachedAt < CACHE_TTL_MS) {
      return this.cachedResult;
    }

    const [paddleOcrReachable, lmStudioReachable, superToneReachable, kokoroReachable, f5Health] =
      await Promise.all([
        this.safeIsReachable(this.paddleOcrHealth),
        LM_STUDIO_SMOKE_ONLY
          ? Promise.resolve(false)
          : this.safeIsReachable(this.lmStudioHealth),
        this.supertone.checkHealth(),
        this.kokoro.checkHealth(),
        this.f5Tts.getHealth(),
      ]);

    const [paddleOcrModels, lmStudioModels, paddleOcrDevice] =
      await Promise.all([
        paddleOcrReachable
          ? this.safeListModels(this.paddleOcrHealth)
          : Promise.resolve([]),
        !LM_STUDIO_SMOKE_ONLY && lmStudioReachable
          ? this.safeListModels(this.lmStudioHealth)
          : Promise.resolve([]),
        paddleOcrReachable
          ? this.paddleOcrHealth.getDevice()
          : Promise.resolve(null),
      ]);

    const result: HealthCheckOutput = {
      paddleOcrReachable,
      paddleOcrModels,
      paddleOcrDevice,
      lmStudioReachable,
      lmStudioModels,
      superToneReachable,
      kokoroReachable,
      f5TtsReachable: f5Health.reachable,
      f5TtsDevice: f5Health.device,
    };

    this.cachedResult = result;
    this.cachedAt = now;
    return result;
  }

  private async safeIsReachable(service: {
    isReachable(): Promise<boolean>;
  }): Promise<boolean> {
    try {
      return await service.isReachable();
    } catch {
      return false;
    }
  }

  private async safeListModels(service: {
    listModels(): Promise<string[]>;
  }): Promise<string[]> {
    try {
      return await service.listModels();
    } catch {
      return [];
    }
  }
}
