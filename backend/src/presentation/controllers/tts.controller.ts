import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { Response } from 'express';
import { SynthesizeSpeechUseCase } from '../../application/use-cases/synthesize-speech.use-case';

interface TtsRequestDto {
  text: string;
  engine?: string;
  voice?: string;
  lang?: string;
  speed?: number;
  totalSteps?: number;
  refText?: string;
  autoTranscribe?: string | boolean;
  removeSilence?: string | boolean;
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
    const autoTranscribe =
      body.autoTranscribe === undefined
        ? undefined
        : typeof body.autoTranscribe === 'string'
          ? body.autoTranscribe.toLowerCase() === 'true'
          : Boolean(body.autoTranscribe);

    if (!body.text || body.text.trim().length === 0) {
      throw new HttpException('text is required', HttpStatus.BAD_REQUEST);
    }
    if (body.text.length > 5000) {
      throw new HttpException(
        'text exceeds maximum length of 5000 characters',
        HttpStatus.BAD_REQUEST,
      );
    }

    if (body.engine === 'f5') {
      if (!refAudio) {
        throw new BadRequestException('refAudio is required for engine=f5');
      }
      if (!autoTranscribe && (!body.refText || body.refText.trim().length === 0)) {
        throw new BadRequestException('refText is required for engine=f5');
      }
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
        lang: body.lang,
        speed: body.speed,
        totalSteps: body.totalSteps,
        refText: body.refText?.trim(),
        refAudio: refAudioPayload,
        autoTranscribe,
        removeSilence:
          typeof body.removeSilence === 'string'
            ? body.removeSilence.toLowerCase() === 'true'
            : body.removeSilence,
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
