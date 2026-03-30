import { Inject, Injectable } from '@nestjs/common';
import { ILmStudioHealthPort } from '../../domain/ports/lm-studio-health.port';
import { IOcrHealthPort } from '../../domain/ports/ocr-health.port';

@Injectable()
export class LMStudioOcrHealthService extends IOcrHealthPort {
  constructor(
    @Inject(ILmStudioHealthPort)
    private readonly lmStudioHealth: ILmStudioHealthPort,
  ) {
    super();
  }

  async isReachable(): Promise<boolean> {
    return this.lmStudioHealth.isReachable();
  }

  async listModels(): Promise<string[]> {
    return this.lmStudioHealth.listModels();
  }

  async getDevice(): Promise<'gpu' | 'cpu' | null> {
    // LM Studio does not expose a stable device health API here.
    return null;
  }
}
