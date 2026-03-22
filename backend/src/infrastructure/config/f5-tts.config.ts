import { Injectable } from '@nestjs/common';

@Injectable()
export class F5TtsConfig {
  readonly host: string = process.env.F5_TTS_HOST || 'localhost';
  readonly port: number =
    parseInt(process.env.F5_TTS_PORT || '8300', 10) || 8300;

  readonly baseUrl: string = `http://${this.host}:${this.port}`;
  readonly ttsEndpoint: string = `${this.baseUrl}/api/tts`;
  readonly healthEndpoint: string = `${this.baseUrl}/health`;

  readonly timeoutMs: number =
    parseInt(process.env.F5_TTS_TIMEOUT || '180000', 10) || 180000;
}
