import { Injectable } from '@nestjs/common';

@Injectable()
export class QwenTtsConfig {
  readonly host: string = process.env.QWEN_TTS_HOST || 'localhost';
  readonly port: number =
    parseInt(process.env.QWEN_TTS_PORT || '8300', 10) || 8300;

  readonly baseUrl: string = `http://${this.host}:${this.port}`;
  readonly ttsEndpoint: string = `${this.baseUrl}/api/tts`;
  readonly healthEndpoint: string = `${this.baseUrl}/health`;

  readonly timeoutMs: number =
    parseInt(process.env.QWEN_TTS_TIMEOUT || '180000', 10) || 180000;
}
