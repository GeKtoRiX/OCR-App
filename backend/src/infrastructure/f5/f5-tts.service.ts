import { Injectable, Logger } from '@nestjs/common';
import {
  F5SynthesisInput,
  F5TtsHealthResult,
  IF5TtsPort,
} from '../../domain/ports/f5-tts.port';
import { F5TtsConfig } from '../config/f5-tts.config';
import { validateF5HealthResponse } from '../validation/sidecar-response.validator';

@Injectable()
export class F5TtsService extends IF5TtsPort {
  private readonly logger = new Logger(F5TtsService.name);

  constructor(private readonly config: F5TtsConfig) {
    super();
  }

  async synthesize(req: F5SynthesisInput): Promise<Buffer> {
    this.logger.debug('Sending TTS request to F5 sidecar...');

    const form = new FormData();
    form.set('text', req.text);
    form.set('refText', req.refText ?? '');
    form.set('autoTranscribe', String(req.autoTranscribe ?? false));
    form.set('removeSilence', String(req.removeSilence ?? false));
    form.set(
      'refAudio',
      new Blob([req.refAudio.buffer], {
        type: req.refAudio.mimetype || 'application/octet-stream',
      }),
      req.refAudio.originalname || 'reference.wav',
    );

    const response = await fetch(this.config.ttsEndpoint, {
      method: 'POST',
      body: form,
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`F5 TTS API error (${response.status}): ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    this.logger.debug('F5 TTS synthesis completed');
    return Buffer.from(arrayBuffer);
  }

  async getHealth(): Promise<F5TtsHealthResult> {
    try {
      const res = await fetch(this.config.healthEndpoint, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        return { reachable: false, device: null };
      }

      const body = validateF5HealthResponse(await res.json());

      return {
        reachable: body.ready,
        device: body.device,
      };
    } catch {
      return { reachable: false, device: null };
    }
  }
}
