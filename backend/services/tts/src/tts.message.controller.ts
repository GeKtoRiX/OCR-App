import { Controller } from '@nestjs/common';
import { MessagePattern, RpcException } from '@nestjs/microservices';
import {
  IKokoroPort,
  ISupertonePort,
  TTS_PATTERNS,
  TtsHealthResponse,
  TtsSynthesizePayload,
  TtsSynthesizeResponse,
} from '@ocr-app/shared';
import {
  SynthesizeSpeechUseCase,
} from '@backend/application/use-cases/synthesize-speech.use-case';

@Controller()
export class TtsMessageController {
  constructor(
    private readonly synthesizeSpeech: SynthesizeSpeechUseCase,
    private readonly supertone: ISupertonePort,
    private readonly kokoro: IKokoroPort,
  ) {}

  @MessagePattern(TTS_PATTERNS.SYNTHESIZE)
  async synthesize(
    payload: TtsSynthesizePayload,
  ): Promise<TtsSynthesizeResponse> {
    if (!payload?.text?.trim()) {
      throw new RpcException({
        statusCode: 400,
        message: 'text is required',
      });
    }

    try {
      const { wav } = await this.synthesizeSpeech.execute({
        text: payload.text,
        engine: payload.engine,
        voice: payload.voice,
        lang: payload.lang,
        speed: payload.speed,
        totalSteps: payload.totalSteps,
      });

      return {
        audioBase64: wav.toString('base64'),
        contentType: 'audio/wav',
        filename: 'speech.wav',
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'TTS synthesis failed';
      throw new RpcException({ statusCode: 502, message });
    }
  }

  @MessagePattern(TTS_PATTERNS.CHECK_HEALTH)
  async healthCheck(): Promise<TtsHealthResponse> {
    const [superToneReachable, kokoroReachable] = await Promise.all([
      this.supertone.checkHealth(),
      this.kokoro.checkHealth(),
    ]);

    return {
      superToneReachable,
      kokoroReachable,
    };
  }
}
