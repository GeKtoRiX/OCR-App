import { Injectable } from '@nestjs/common';

@Injectable()
export class SupertoneConfig {
  readonly host: string = process.env.SUPERTONE_HOST || 'localhost';
  readonly port: number =
    parseInt(process.env.SUPERTONE_PORT || '8100', 10) || 8100;

  readonly baseUrl: string = `http://${this.host}:${this.port}`;
  readonly ttsEndpoint: string = `${this.baseUrl}/api/tts`;
  readonly healthEndpoint: string = `${this.baseUrl}/health`;

  readonly timeoutMs: number =
    parseInt(process.env.SUPERTONE_TIMEOUT || '120000', 10) || 120000;
}
