import { Injectable, Logger } from '@nestjs/common';
import {
  IQwenTtsPort,
  QwenSynthesisInput,
  QwenTtsHealthResult,
} from '../../domain/ports/qwen-tts.port';
import { QwenTtsConfig } from '../config/qwen-tts.config';

export type QwenTtsMode = 'custom_voice' | 'voice_design';

@Injectable()
export class QwenTtsService extends IQwenTtsPort {
  private readonly logger = new Logger(QwenTtsService.name);

  constructor(private readonly config: QwenTtsConfig) {
    super();
  }

  async synthesize(req: QwenSynthesisInput): Promise<Buffer> {
    this.logger.debug('Sending TTS request to Qwen sidecar...');

    const response = await fetch(this.config.ttsEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: req.text,
        lang: req.lang ?? 'English',
        speaker: req.speaker,
        instruct: req.instruct,
      }),
      signal: AbortSignal.timeout(this.config.timeoutMs),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Qwen TTS API error (${response.status}): ${errorText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    this.logger.debug('Qwen TTS synthesis completed');
    return Buffer.from(arrayBuffer);
  }

  async getHealth(): Promise<QwenTtsHealthResult> {
    try {
      const res = await fetch(this.config.healthEndpoint, {
        signal: AbortSignal.timeout(5000),
      });
      if (!res.ok) {
        return { reachable: false, device: null };
      }

      const body = (await res.json()) as {
        ready?: boolean;
        device?: 'gpu' | 'cpu' | null;
      };

      if (body.ready !== true) {
        return { reachable: false, device: body.device ?? null };
      }

      return {
        reachable: true,
        device: body.device ?? null,
      };
    } catch {
      return { reachable: false, device: null };
    }
  }
}
