import { Injectable } from '@nestjs/common';
import { IHealthCheckPort } from '../../domain/ports/health-check.port';
import { PaddleOCRConfig } from '../config/paddleocr.config';

interface PaddleOCRHealthResponse {
  status?: string;
  model_loaded?: boolean;
  device?: string;
}

interface PaddleOCRModelsResponse {
  models?: Record<string, string | null | undefined>;
}

@Injectable()
export class PaddleOCRHealthService extends IHealthCheckPort {
  constructor(private readonly config: PaddleOCRConfig) {
    super();
  }

  async isReachable(): Promise<boolean> {
    try {
      const response = await fetch(this.config.healthEndpoint, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async getDevice(): Promise<'gpu' | 'cpu' | null> {
    try {
      const response = await fetch(this.config.healthEndpoint, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as PaddleOCRHealthResponse;
      return data.device === 'gpu' ? 'gpu' : 'cpu';
    } catch {
      return null;
    }
  }

  async listModels(): Promise<string[]> {
    try {
      const response = await fetch(this.config.modelsEndpoint, {
        method: 'GET',
        signal: AbortSignal.timeout(5000),
      });

      if (!response.ok) {
        throw new Error(`Failed to list models: ${response.status}`);
      }

      const data = (await response.json()) as PaddleOCRModelsResponse;

      if (!data.models) {
        return [];
      }

      return Object.values(data.models).filter(
        (model): model is string => Boolean(model),
      );
    } catch {
      throw new Error('Could not connect to PaddleOCR sidecar');
    }
  }
}
