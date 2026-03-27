import { Injectable, Logger } from '@nestjs/common';
import {
  IVoxtralTtsPort,
  VoxtralSynthesisInput,
  VoxtralTtsHealthResult,
} from '../../domain/ports/voxtral-tts.port';
import { VoxtralTtsConfig } from '../config/voxtral-tts.config';
import { validateVoxtralHealthResponse } from '../validation/sidecar-response.validator';

@Injectable()
export class VoxtralTtsService extends IVoxtralTtsPort {
  private readonly logger = new Logger(VoxtralTtsService.name);

  constructor(private readonly config: VoxtralTtsConfig) {
    super();
  }

  async synthesize(req: VoxtralSynthesisInput): Promise<Buffer> {
    this.logger.debug('Sending TTS request to Voxtral sidecar...');

    const response = await fetch(this.config.ttsEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: req.text,
        voice: req.voice ?? 'casual_male',
        format: req.format ?? 'wav',
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Voxtral API error (${response.status}): ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    this.logger.debug('Voxtral TTS synthesis completed');
    return Buffer.from(arrayBuffer);
  }

  async getHealth(): Promise<VoxtralTtsHealthResult> {
    try {
      const res = await fetch(this.config.healthEndpoint, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        return { reachable: false, device: null };
      }

      const body = validateVoxtralHealthResponse(await res.json());

      return {
        reachable: body.ready,
        device: body.device,
      };
    } catch {
      return { reachable: false, device: null };
    }
  }
}
