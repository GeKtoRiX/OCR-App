import {
  BadRequestException,
  Controller,
  Inject,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { ClientProxy } from '@nestjs/microservices';
import { lastValueFrom } from 'rxjs';
import {
  OCR_PATTERNS,
  ProcessImagePayload,
  ProcessImageResponse,
} from '@ocr-app/shared';
import { asUpstreamHttpError } from '../upstream-http-error';

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/bmp',
  'image/tiff',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024;

@Controller('api')
export class GatewayOcrController {
  constructor(
    @Inject('OCR_SERVICE') private readonly ocrClient: ClientProxy,
  ) {}

  @Post('ocr')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  async processOcr(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<ProcessImageResponse> {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }
    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File too large. Maximum size: ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
      );
    }
    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type: ${file.mimetype}. Allowed: ${[...ALLOWED_MIME_TYPES].join(', ')}`,
      );
    }

    const payload: ProcessImagePayload = {
      base64: file.buffer.toString('base64'),
      mimeType: file.mimetype,
      filename: file.originalname,
    };

    try {
      return await lastValueFrom(
        this.ocrClient.send(OCR_PATTERNS.PROCESS_IMAGE, payload),
      );
    } catch (error) {
      throw asUpstreamHttpError(error, 'OCR processing failed');
    }
  }
}
