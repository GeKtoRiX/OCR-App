import { Controller, Get, Inject } from '@nestjs/common';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import {
  OCR_PATTERNS,
  OcrHealthResponse,
  TTS_PATTERNS,
  TtsHealthResponse,
} from '@ocr-app/shared';

@Controller('api')
export class GatewayHealthController {
  constructor(
    @Inject('OCR_SERVICE') private readonly ocrClient: ClientProxy,
    @Inject('TTS_SERVICE') private readonly ttsClient: ClientProxy,
  ) {}

  @Get('health')
  async getHealth(): Promise<{
    ocrReachable: boolean;
    ocrModels: string[];
    ocrDevice: 'gpu' | 'cpu' | null;
    lmStudioReachable: boolean;
    lmStudioModels: string[];
    superToneReachable: boolean;
    kokoroReachable: boolean;
    f5TtsReachable: boolean;
    f5TtsDevice: 'gpu' | 'cpu' | null;
    voxtralReachable: boolean;
    voxtralDevice: 'gpu' | 'cpu' | null;
  }> {
    const [ocrHealth, ttsHealth] = await Promise.all([
      lastValueFrom(
        this.ocrClient.send<OcrHealthResponse, object>(
          OCR_PATTERNS.CHECK_HEALTH,
          {},
        ),
      ),
      lastValueFrom(
        this.ttsClient.send<TtsHealthResponse, object>(
          TTS_PATTERNS.CHECK_HEALTH,
          {},
        ),
      ),
    ]);

    return {
      ...ocrHealth,
      ...ttsHealth,
    };
  }
}
