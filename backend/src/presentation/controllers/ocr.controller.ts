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
import { ProcessImageUseCase } from '../../application/use-cases/process-image.use-case';
import { OcrResponseDto } from '../dto/ocr-response.dto';

const ALLOWED_MIME_TYPES = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/bmp',
  'image/tiff',
]);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

@Controller('api')
export class OcrController {
  constructor(private readonly processImage: ProcessImageUseCase) {}

  @Post('ocr')
  @UseInterceptors(FileInterceptor('image'))
  async processOcr(
    @UploadedFile() file: Express.Multer.File,
  ): Promise<OcrResponseDto> {
    if (!file) {
      throw new BadRequestException('No image file provided');
    }

    if (!ALLOWED_MIME_TYPES.has(file.mimetype)) {
      throw new BadRequestException(
        `Unsupported file type: ${file.mimetype}. Allowed: ${[...ALLOWED_MIME_TYPES].join(', ')}`,
      );
    }

    if (file.size > MAX_FILE_SIZE) {
      throw new BadRequestException(
        `File too large. Maximum size: ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
      );
    }

    try {
      const result = await this.processImage.execute({
        buffer: file.buffer,
        mimeType: file.mimetype,
        originalName: file.originalname,
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
    }
  }
}
