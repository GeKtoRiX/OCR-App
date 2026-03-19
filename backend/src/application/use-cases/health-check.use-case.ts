import { Injectable } from '@nestjs/common';
import { HealthCheckOutput } from '../dto/health-check.dto';
import { LMStudioClient } from '../../infrastructure/lm-studio/lm-studio.client';
import { PaddleOCRHealthService } from '../../infrastructure/paddleocr/paddleocr-health.service';

@Injectable()
export class HealthCheckUseCase {
  constructor(
    private readonly lmStudioClient: LMStudioClient,
    private readonly paddleOCRHealthService: PaddleOCRHealthService,
  ) {}

  async execute(): Promise<HealthCheckOutput> {
    const [paddleOcrReachable, lmStudioReachable] = await Promise.all([
      this.safeIsReachable(this.paddleOCRHealthService),
      this.safeIsReachable(this.lmStudioClient),
    ]);

    const [paddleOcrModels, lmStudioModels, paddleOcrDevice] =
      await Promise.all([
        paddleOcrReachable
          ? this.safeListModels(this.paddleOCRHealthService)
          : Promise.resolve([]),
        lmStudioReachable
          ? this.safeListModels(this.lmStudioClient)
          : Promise.resolve([]),
        paddleOcrReachable
          ? this.paddleOCRHealthService.getDevice()
          : Promise.resolve(null),
      ]);

    return {
      paddleOcrReachable,
      paddleOcrModels,
      paddleOcrDevice,
      lmStudioReachable,
      lmStudioModels,
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
