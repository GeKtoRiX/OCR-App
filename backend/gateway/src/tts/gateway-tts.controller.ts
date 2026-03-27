import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import type { Response } from 'express';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import {
  TTS_PATTERNS,
  TtsSynthesizePayload,
  TtsSynthesizeResponse,
} from '@ocr-app/shared';
import { asUpstreamHttpError } from '../upstream-http-error';

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

@Controller('api')
export class GatewayTtsController {
  constructor(
    @Inject('TTS_SERVICE') private readonly ttsClient: ClientProxy,
  ) {}

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
    if (!body.text || !body.text.trim()) {
      throw new HttpException('text is required', HttpStatus.BAD_REQUEST);
    }
    if (body.text.length > 5000) {
      throw new HttpException(
        'text exceeds maximum length of 5000 characters',
        HttpStatus.BAD_REQUEST,
      );
    }

    const autoTranscribe =
      body.autoTranscribe === undefined
        ? undefined
        : typeof body.autoTranscribe === 'string'
          ? body.autoTranscribe.toLowerCase() === 'true'
          : Boolean(body.autoTranscribe);

    const removeSilence =
      typeof body.removeSilence === 'string'
        ? body.removeSilence.toLowerCase() === 'true'
        : body.removeSilence;

    const payload: TtsSynthesizePayload = {
      text: body.text,
      engine: body.engine,
      voice: body.voice,
      format: body.format,
      lang: body.lang,
      speed: body.speed,
      totalSteps: body.totalSteps,
      refText: body.refText?.trim(),
      refAudioBase64: refAudio?.buffer.toString('base64'),
      refAudioFilename: refAudio?.originalname,
      refAudioMimeType: refAudio?.mimetype,
      autoTranscribe,
      removeSilence,
    };

    let result: TtsSynthesizeResponse;
    try {
      result = await lastValueFrom(
        this.ttsClient.send(TTS_PATTERNS.SYNTHESIZE, payload),
      );
    } catch (error) {
      throw asUpstreamHttpError(error, 'TTS synthesis failed');
    }

    const wav = Buffer.from(result.audioBase64, 'base64');
    res
      .status(HttpStatus.OK)
      .set({
        'Content-Type': result.contentType,
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Content-Length': wav.length.toString(),
      })
      .send(wav);
  }
}
