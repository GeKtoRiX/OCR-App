import {
  Controller,
  Post,
  UploadedFile,
  UseInterceptors,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { ProcessImageUseCase } from '../../application/use-cases/process-image.use-case';
import { OcrResponseDto } from '../dto/ocr-response.dto';
import { OcrConcurrencyService } from '../../infrastructure/concurrency/ocr-concurrency.service';

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/bmp',
  'image/tiff',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

const uploadDir = path.join(os.tmpdir(), 'ocr-uploads');
fs.mkdirSync(uploadDir, { recursive: true });

@Controller('api')
export class OcrController {
  constructor(
    private readonly processImage: ProcessImageUseCase,
    private readonly ocrConcurrency: OcrConcurrencyService,
  ) {}

  @Post('ocr')
  @UseInterceptors(
    FileInterceptor('image', {
      storage: diskStorage({
        destination: uploadDir,
        filename: (_req, file, cb) =>
          cb(null, `${Date.now()}-${file.originalname}`),
      }),
      limits: { fileSize: MAX_FILE_SIZE },
    }),
  )
  async processOcr(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<OcrResponseDto> {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }

    if (file.size > MAX_FILE_SIZE) {
      if (file.path) this.cleanupFile(file.path);
      throw new BadRequestException(
        `File too large. Maximum size: ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
      );
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      if (file.path) this.cleanupFile(file.path);
      throw new BadRequestException(
        `Unsupported file type: ${file.mimetype}. Allowed: ${[...ALLOWED_MIME_TYPES].join(', ')}`,
      );
    }

    // Backpressure: reject early if too many requests are queued
    if (this.ocrConcurrency.isBackpressured()) {
      if (file.path) this.cleanupFile(file.path);
      throw new HttpException(
        { statusCode: 429, message: 'Too many OCR requests in progress, try again later' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    try {
      const result = await this.ocrConcurrency.withLock(async () => {
        const buffer = file.path
          ? await fs.promises.readFile(file.path)
          : file.buffer;
        return this.processImage.execute({
          buffer,
          mimeType: file.mimetype,
          originalName: file.originalname,
        });
      });

      return {
        rawText: result.rawText,
        markdown: result.markdown,
        filename: file.originalname,
      };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Unknown processing error';
      throw new HttpException(
        { statusCode: 502, message: `OCR processing error: ${message}` },
        HttpStatus.BAD_GATEWAY,
      );
    } finally {
      if (file.path) this.cleanupFile(file.path);
    }
  }

  private cleanupFile(filePath: string): void {
    fs.promises.unlink(filePath).catch(() => {});
  }
}
