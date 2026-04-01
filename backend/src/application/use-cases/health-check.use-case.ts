import { Injectable } from '@nestjs/common';
import { HealthCheckOutput } from '../dto/health-check.dto';
import { ILmStudioHealthPort } from '../../domain/ports/lm-studio-health.port';
import { IOcrHealthPort } from '../../domain/ports/ocr-health.port';
import { ISupertonePort } from '../../domain/ports/supertone.port';
import { IKokoroPort } from '../../domain/ports/kokoro.port';

const CACHE_TTL_MS = 10_000;
const LM_STUDIO_SMOKE_ONLY = process.env.LM_STUDIO_SMOKE_ONLY === 'true';

@Injectable()
export class HealthCheckUseCase {
  private cachedResult: HealthCheckOutput | null = null;
  private cachedAt = 0;

  constructor(
    private readonly lmStudioHealth: ILmStudioHealthPort,
    private readonly ocrHealth: IOcrHealthPort,
    private readonly supertone: ISupertonePort,
    private readonly kokoro: IKokoroPort,
  ) {}

  async execute(): Promise<HealthCheckOutput> {
    const now = Date.now();
    if (this.cachedResult && now - this.cachedAt < CACHE_TTL_MS) {
      return this.cachedResult;
    }

    const [
      ocrReachable,
      lmStudioReachable,
      superToneReachable,
      kokoroReachable,
    ] =
      await Promise.all([
        this.safeIsReachable(this.ocrHealth),
        LM_STUDIO_SMOKE_ONLY
          ? Promise.resolve(false)
          : this.safeIsReachable(this.lmStudioHealth),
        this.supertone.checkHealth(),
        this.kokoro.checkHealth(),
      ]);

    const [ocrModels, lmStudioModels, ocrDevice] =
      await Promise.all([
        ocrReachable
          ? this.safeListModels(this.ocrHealth)
          : Promise.resolve([]),
        !LM_STUDIO_SMOKE_ONLY && lmStudioReachable
          ? this.safeListModels(this.lmStudioHealth)
          : Promise.resolve([]),
        ocrReachable
          ? this.ocrHealth.getDevice()
          : Promise.resolve(null),
      ]);

    const result: HealthCheckOutput = {
      ocrReachable,
      ocrModels,
      ocrDevice,
      lmStudioReachable,
      lmStudioModels,
      superToneReachable,
      kokoroReachable,
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
