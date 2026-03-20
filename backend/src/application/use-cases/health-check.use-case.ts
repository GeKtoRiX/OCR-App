import { Injectable } from '@nestjs/common';
import { HealthCheckOutput } from '../dto/health-check.dto';
import { IPaddleOcrHealthPort } from '../../domain/ports/paddle-ocr-health.port';
import { ILmStudioHealthPort } from '../../domain/ports/lm-studio-health.port';
import { ISupertonePort } from '../../domain/ports/supertone.port';
import { IKokoroPort } from '../../domain/ports/kokoro.port';
import { IQwenTtsPort } from '../../domain/ports/qwen-tts.port';

@Injectable()
export class HealthCheckUseCase {
  constructor(
    private readonly lmStudioHealth: ILmStudioHealthPort,
    private readonly paddleOcrHealth: IPaddleOcrHealthPort,
    private readonly supertone: ISupertonePort,
    private readonly kokoro: IKokoroPort,
    private readonly qwenTts: IQwenTtsPort,
  ) {}

  async execute(): Promise<HealthCheckOutput> {
    const [paddleOcrReachable, lmStudioReachable, superToneReachable, kokoroReachable, qwenHealth] =
      await Promise.all([
        this.safeIsReachable(this.paddleOcrHealth),
        this.safeIsReachable(this.lmStudioHealth),
        this.supertone.checkHealth(),
        this.kokoro.checkHealth(),
        this.qwenTts.getHealth(),
      ]);

    const [paddleOcrModels, lmStudioModels, paddleOcrDevice] =
      await Promise.all([
        paddleOcrReachable
          ? this.safeListModels(this.paddleOcrHealth)
          : Promise.resolve([]),
        lmStudioReachable
          ? this.safeListModels(this.lmStudioHealth)
          : Promise.resolve([]),
        paddleOcrReachable
          ? this.paddleOcrHealth.getDevice()
          : Promise.resolve(null),
      ]);

    return {
      paddleOcrReachable,
      paddleOcrModels,
      paddleOcrDevice,
      lmStudioReachable,
      lmStudioModels,
      superToneReachable,
      kokoroReachable,
      qwenTtsReachable: qwenHealth.reachable,
      qwenTtsDevice: qwenHealth.device,
    };
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
