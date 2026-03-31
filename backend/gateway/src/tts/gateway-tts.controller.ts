import {
  Body,
  Controller,
  HttpException,
  HttpStatus,
  Inject,
  Post,
  Res,
} from '@nestjs/common';
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
  lang?: string;
  speed?: number;
  totalSteps?: number;
}

@Controller('api')
export class GatewayTtsController {
  constructor(
    @Inject('TTS_SERVICE') private readonly ttsClient: ClientProxy,
  ) {}

  @Post('tts')
  async synthesize(
    @Body() body: TtsRequestDto,
    @Res() res: Response,
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

    const payload: TtsSynthesizePayload = {
      text: body.text,
      engine: body.engine,
      voice: body.voice,
      lang: body.lang,
      speed: body.speed,
      totalSteps: body.totalSteps,
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
