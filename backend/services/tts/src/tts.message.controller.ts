import { Controller } from '@nestjs/common';
import { MessagePattern, RpcException } from '@nestjs/microservices';
import {
  IF5TtsPort,
  IKokoroPort,
  ISupertonePort,
  TTS_PATTERNS,
  TtsHealthResponse,
  TtsSynthesizePayload,
  TtsSynthesizeResponse,
  UploadedFile,
  IVoxtralTtsPort,
} from '@ocr-app/shared';
import {
  F5_TTS_REQUIRES_REF_AUDIO_ERROR,
  F5_TTS_REQUIRES_REF_TEXT_ERROR,
  SynthesizeSpeechUseCase,
} from '@backend/application/use-cases/synthesize-speech.use-case';

@Controller()
export class TtsMessageController {
  constructor(
    private readonly synthesizeSpeech: SynthesizeSpeechUseCase,
    private readonly supertone: ISupertonePort,
    private readonly kokoro: IKokoroPort,
    private readonly f5Tts: IF5TtsPort,
    private readonly voxtralTts: IVoxtralTtsPort,
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

    const refAudio: UploadedFile | undefined = payload.refAudioBase64
      ? {
          buffer: Buffer.from(payload.refAudioBase64, 'base64'),
          originalname: payload.refAudioFilename ?? 'reference.wav',
          mimetype: payload.refAudioMimeType ?? 'audio/wav',
          size: Buffer.byteLength(payload.refAudioBase64, 'base64'),
        }
      : undefined;

    try {
      const { wav } = await this.synthesizeSpeech.execute({
        text: payload.text,
        engine: payload.engine,
        voice: payload.voice,
        format: payload.format,
        lang: payload.lang,
        speed: payload.speed,
        totalSteps: payload.totalSteps,
        refText: payload.refText,
        refAudio,
        autoTranscribe: payload.autoTranscribe,
        removeSilence: payload.removeSilence,
      });

      return {
        audioBase64: wav.toString('base64'),
        contentType: 'audio/wav',
        filename: 'speech.wav',
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'TTS synthesis failed';
      if (
        message === F5_TTS_REQUIRES_REF_AUDIO_ERROR ||
        message === F5_TTS_REQUIRES_REF_TEXT_ERROR
      ) {
        throw new RpcException({ statusCode: 400, message });
      }
      throw new RpcException({ statusCode: 502, message });
    }
  }

  @MessagePattern(TTS_PATTERNS.CHECK_HEALTH)
  async healthCheck(): Promise<TtsHealthResponse> {
    const [superToneReachable, kokoroReachable, f5Health, voxtralHealth] = await Promise.all([
      this.supertone.checkHealth(),
      this.kokoro.checkHealth(),
      this.f5Tts.getHealth(),
      this.voxtralTts.getHealth(),
    ]);

    return {
      superToneReachable,
      kokoroReachable,
      f5TtsReachable: f5Health.reachable,
      f5TtsDevice: f5Health.device,
      voxtralReachable: voxtralHealth.reachable,
      voxtralDevice: voxtralHealth.device,
    };
  }
}
