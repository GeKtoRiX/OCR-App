import { Injectable } from '@nestjs/common';

@Injectable()
export class KokoroConfig {
  readonly host: string = process.env.KOKORO_HOST || 'localhost';
  readonly port: number =
    parseInt(process.env.KOKORO_PORT || '8200', 10) || 8200;

  readonly baseUrl: string = `http://${this.host}:${this.port}`;
  readonly ttsEndpoint: string = `${this.baseUrl}/tts`;
  readonly healthEndpoint: string = `${this.baseUrl}/health`;

  readonly timeoutMs: number =
    parseInt(process.env.KOKORO_TIMEOUT || '60000', 10) || 60000;
}
