import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import {
  F5_TTS_REQUIRES_REF_AUDIO_ERROR,
  F5_TTS_REQUIRES_REF_TEXT_ERROR,
  SynthesizeSpeechUseCase,
} from '../../application/use-cases/synthesize-speech.use-case';

interface TtsRequestDto {
  text: string;
  engine?: string;
  voice?: string;
  format?: 'wav';
  lang?: string;
  speed?: number;
  totalSteps?: number;
  refText?: string;
  autoTranscribe?: string | boolean;
  removeSilence?: string | boolean;
}

function parseBooleanParam(
  value: string | boolean | undefined,
): boolean | undefined {
  if (value === undefined) {
    return undefined;
  }

  return typeof value === 'string'
    ? value.toLowerCase() === 'true'
    : Boolean(value);
}

@Controller('api')
export class TtsController {
  constructor(private readonly synthesizeSpeech: SynthesizeSpeechUseCase) {}

  @Post('tts')
  @UseInterceptors(
    FileInterceptor('refAudio', {
      storage: memoryStorage(),
      limits: { fileSize: 50 * 1024 * 1024 },
    }),
  )
  async synthesize(
    @Body() body: TtsRequestDto,
    @Res() res: Response,
    @UploadedFile() refAudio?: Express.Multer.File,
  ): Promise<void> {
    const autoTranscribe = parseBooleanParam(body.autoTranscribe);

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
      const refAudioPayload = refAudio
        ? {
            buffer: refAudio.buffer,
            originalname: refAudio.originalname,
            mimetype: refAudio.mimetype,
            size: refAudio.size,
          }
        : undefined;

      const { wav } = await this.synthesizeSpeech.execute({
        text: body.text,
        engine: body.engine,
        voice: body.voice,
        format: body.format,
        lang: body.lang,
        speed: body.speed,
        totalSteps: body.totalSteps,
        refText: body.refText?.trim(),
        refAudio: refAudioPayload,
        autoTranscribe,
        removeSilence: parseBooleanParam(body.removeSilence),
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
      if (
        message === F5_TTS_REQUIRES_REF_AUDIO_ERROR ||
        message === F5_TTS_REQUIRES_REF_TEXT_ERROR
      ) {
        throw new HttpException(message, HttpStatus.BAD_REQUEST);
      }
      throw new HttpException(
        `TTS synthesis failed: ${message}`,
        HttpStatus.BAD_GATEWAY,
      );
    }
  }
}
