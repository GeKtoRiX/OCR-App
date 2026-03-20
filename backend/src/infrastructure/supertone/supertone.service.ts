import { Injectable, Logger } from '@nestjs/common';
import {
  ISupertonePort,
  SupertoneSynthesisInput,
} from '../../domain/ports/supertone.port';
import { SupertoneConfig } from '../config/supertone.config';

@Injectable()
export class SupertoneService extends ISupertonePort {
  private readonly logger = new Logger(SupertoneService.name);

  constructor(private readonly config: SupertoneConfig) {
    super();
  }

  async synthesize(req: SupertoneSynthesisInput): Promise<Buffer> {
    this.logger.debug('Sending TTS request to Supertone sidecar...');

    const response = await fetch(this.config.ttsEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: req.text,
        engine: req.engine ?? 'supertone',
        voice: req.voice ?? 'M1',
        lang: req.lang ?? 'en',
        speed: req.speed ?? 1.05,
        total_steps: req.totalSteps ?? 5,
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Supertone API error (${response.status}): ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    this.logger.debug('TTS synthesis completed');
    return Buffer.from(arrayBuffer);
  }

  async checkHealth(): Promise<boolean> {
    try {
      const res = await fetch(this.config.healthEndpoint, {
        signal: AbortSignal.timeout(5000),
      });
      return res.ok;
    } catch {
      return false;
    }
  }
}
