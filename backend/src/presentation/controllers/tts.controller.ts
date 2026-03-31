import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import {
  SynthesizeSpeechUseCase,
} from '../../application/use-cases/synthesize-speech.use-case';

interface TtsRequestDto {
  text: string;
  engine?: string;
  voice?: string;
  lang?: string;
  speed?: number;
  totalSteps?: number;
}

@Controller('api')
export class TtsController {
  constructor(private readonly synthesizeSpeech: SynthesizeSpeechUseCase) {}

  @Post('tts')
  async synthesize(
    @Body() body: TtsRequestDto,
    @Res() res: Response,
  ): Promise<void> {
    if (!body.text || body.text.trim().length === 0) {
      throw new HttpException('text is required', HttpStatus.BAD_REQUEST);
    }
    if (body.text.length > 5000) {
      throw new HttpException(
        'text exceeds maximum length of 5000 characters',
        HttpStatus.BAD_REQUEST,
      );
    }

    try {
      const { wav } = await this.synthesizeSpeech.execute({
        text: body.text,
        engine: body.engine,
        voice: body.voice,
        lang: body.lang,
        speed: body.speed,
        totalSteps: body.totalSteps,
      });

      res
        .status(HttpStatus.OK)
        .set({
          'Content-Type': 'audio/wav',
          'Content-Disposition': 'attachment; filename="speech.wav"',
          'Content-Length': wav.length.toString(),
        })
        .send(wav);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      throw new HttpException(
        `TTS synthesis failed: ${message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
