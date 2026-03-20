import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Res,
} from '@nestjs/common';
import { Response } from 'express';
import { SynthesizeSpeechUseCase } from '../../application/use-cases/synthesize-speech.use-case';

type QwenTtsMode = 'custom_voice' | 'voice_design';

interface TtsRequestDto {
  text: string;
  engine?: string;
  voice?: string;
  lang?: string;
  speed?: number;
  totalSteps?: number;
  qwenMode?: QwenTtsMode;
  speaker?: string;
  instruct?: string;
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
    if (body.engine === 'qwen' && body.qwenMode === 'voice_design') {
      throw new HttpException(
        'qwen voice design mode is no longer supported',
        HttpStatus.BAD_REQUEST,
      );
    }
    if (
      body.engine === 'qwen' &&
      body.qwenMode !== undefined &&
      body.qwenMode !== 'custom_voice'
    ) {
      throw new HttpException(
        `unsupported qwenMode: ${body.qwenMode}`,
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
        speaker: body.speaker,
        instruct: body.instruct,
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
      throw new HttpException(
        `TTS synthesis failed: ${e instanceof Error ? e.message : String(e)}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
