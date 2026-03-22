import { Injectable, Logger } from '@nestjs/common';
import { NO_TEXT_DETECTED } from '../../domain/constants';
import { ImageData } from '../../domain/entities/image-data.entity';
import { IOCRService } from '../../domain/ports/ocr-service.port';
import { PaddleOCRConfig } from '../config/paddleocr.config';
import { validatePaddleOcrExtractResponse } from '../validation/sidecar-response.validator';

@Injectable()
export class PaddleOCRService extends IOCRService {
  private readonly logger = new Logger(PaddleOCRService.name);

  constructor(private readonly config: PaddleOCRConfig) {
    super();
  }

  async extractText(image: ImageData): Promise<string> {
    if (!image || !image.buffer) {
      throw new Error('Invalid image data provided');
    }

    try {
      this.logger.debug('Sending OCR request to PaddleOCR sidecar (multipart)...');

      // Send as multipart/form-data — avoids +33% base64 overhead
      const form = new FormData();
      form.append(
        'image',
        new Blob([image.buffer], { type: image.mimeType }),
        image.originalName,
      );

      const response = await fetch(this.config.uploadExtractEndpoint, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `PaddleOCR API error (${response.status}): ${errorText}`,
        );
      }

      const result = validatePaddleOcrExtractResponse(await response.json());

      this.logger.debug('OCR completed successfully');

      if (!result.text || result.text.trim().length === 0) {
        return NO_TEXT_DETECTED;
      }

      return result.text;
    } catch (error) {
      this.logger.error(
        `OCR extraction failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error && error.stack ? error.stack : undefined,
      );

      throw error;
    }
  }
}
