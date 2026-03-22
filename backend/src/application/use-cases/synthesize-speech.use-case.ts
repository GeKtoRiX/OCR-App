import { Injectable } from '@nestjs/common';
import { ISupertonePort } from '../../domain/ports/supertone.port';
import { IKokoroPort } from '../../domain/ports/kokoro.port';
import { IF5TtsPort } from '../../domain/ports/f5-tts.port';
import {
  SynthesizeSpeechInput,
  SynthesizeSpeechOutput,
} from '../dto/synthesize-speech.dto';

@Injectable()
export class SynthesizeSpeechUseCase {
  constructor(
    private readonly supertone: ISupertonePort,
    private readonly kokoro: IKokoroPort,
    private readonly f5Tts: IF5TtsPort,
  ) {}

  async execute(input: SynthesizeSpeechInput): Promise<SynthesizeSpeechOutput> {
    if (input.engine === 'f5') {
      if (!input.refAudio) {
        throw new Error('F5 TTS requires refAudio');
      }
      if (!input.autoTranscribe && !input.refText) {
        throw new Error('F5 TTS requires refText unless autoTranscribe is enabled');
      }
      const wav = await this.f5Tts.synthesize({
        text: input.text,
        refText: input.refText,
        refAudio: input.refAudio,
        autoTranscribe: input.autoTranscribe,
        removeSilence: input.removeSilence,
      });
      return { wav };
    }

    if (input.engine === 'kokoro') {
      const wav = await this.kokoro.synthesize({
        text: input.text,
        voice: input.voice,
        speed: input.speed,
        lang: input.lang,
      });
      return { wav };
    }

    const wav = await this.supertone.synthesize({
      text: input.text,
      engine: input.engine,
      voice: input.voice,
      lang: input.lang,
      speed: input.speed,
      totalSteps: input.totalSteps,
    });
    return { wav };
  }
}
