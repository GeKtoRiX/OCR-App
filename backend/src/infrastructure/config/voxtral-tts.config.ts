import { Injectable } from '@nestjs/common';

@Injectable()
export class VoxtralTtsConfig {
  readonly host: string = process.env.VOXTRAL_HOST || 'localhost';
  readonly port: number =
    parseInt(process.env.VOXTRAL_PORT || '8400', 10) || 8400;

  readonly baseUrl: string = `http://${this.host}:${this.port}`;
  readonly ttsEndpoint: string = `${this.baseUrl}/api/tts`;
  readonly healthEndpoint: string = `${this.baseUrl}/health`;

  readonly timeoutMs: number =
    parseInt(process.env.VOXTRAL_TIMEOUT || '180000', 10) || 180000;
}
