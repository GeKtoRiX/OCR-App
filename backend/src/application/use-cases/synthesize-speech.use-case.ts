import { Injectable } from '@nestjs/common';
import { ISupertonePort } from '../../domain/ports/supertone.port';
import { IKokoroPort } from '../../domain/ports/kokoro.port';
import { IQwenTtsPort } from '../../domain/ports/qwen-tts.port';
import {
  SynthesizeSpeechInput,
  SynthesizeSpeechOutput,
} from '../dto/synthesize-speech.dto';

@Injectable()
export class SynthesizeSpeechUseCase {
  constructor(
    private readonly supertone: ISupertonePort,
    private readonly kokoro: IKokoroPort,
    private readonly qwenTts: IQwenTtsPort,
  ) {}

  async execute(input: SynthesizeSpeechInput): Promise<SynthesizeSpeechOutput> {
    if (input.engine === 'qwen') {
      const wav = await this.qwenTts.synthesize({
        text: input.text,
        lang: input.lang,
        speaker: input.speaker,
        instruct: input.instruct,
      });
      return { wav };
    }

    if (input.engine === 'kokoro') {
      const wav = await this.kokoro.synthesize({
        text: input.text,
        voice: input.voice,
        speed: input.speed,
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
