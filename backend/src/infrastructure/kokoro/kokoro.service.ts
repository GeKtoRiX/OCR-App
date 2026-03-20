import { Injectable, Logger } from '@nestjs/common';
import {
  IKokoroPort,
  KokoroSynthesisInput,
} from '../../domain/ports/kokoro.port';
import { KokoroConfig } from '../config/kokoro.config';

@Injectable()
export class KokoroService extends IKokoroPort {
  private readonly logger = new Logger(KokoroService.name);

  constructor(private readonly config: KokoroConfig) {
    super();
  }

  async synthesize(req: KokoroSynthesisInput): Promise<Buffer> {
    this.logger.debug('Sending TTS request to Kokoro sidecar...');

    const response = await fetch(this.config.ttsEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: req.text,
        voice: req.voice ?? 'af_heart',
        speed: req.speed ?? 1.0,
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Kokoro API error (${response.status}): ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    this.logger.debug('Kokoro TTS synthesis completed');
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
