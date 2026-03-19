import { Injectable, Logger } from '@nestjs/common';
import { NO_TEXT_DETECTED } from '../../domain/constants';
import { ImageData } from '../../domain/entities/image-data.entity';
import { IOCRService } from '../../domain/ports/ocr-service.port';
import { PaddleOCRConfig } from '../config/paddleocr.config';

interface PaddleOCRExtractResponse {
  text?: string | null;
}

/**
 * PaddleOCR Service Implementation
 *
 * Communicates with the PaddleOCR sidecar service via HTTP API
 * to extract text from images. Implements the IOCRService port.
 */
@Injectable()
export class PaddleOCRService extends IOCRService {
  private readonly logger = new Logger(PaddleOCRService.name);

  constructor(private readonly config: PaddleOCRConfig) {
    super();
  }

  /**
   * Extract text from an image using the PaddleOCR sidecar.
   *
   * @param imageData - The image data to process
   * @returns Extracted text as a string
   */
  async extractText(image: ImageData): Promise<string> {
    // Validate image
    if (!image || !image.buffer) {
      throw new Error('Invalid image data provided');
    }

    try {
      // Encode image as base64 using Node.js Buffer
      const base64Data = this.encodeImageToBase64(image);

      this.logger.debug('Sending OCR request to PaddleOCR sidecar...');

      // Call the PaddleOCR API with base64-encoded image
      const response = await fetch(this.config.base64ExtractEndpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          image_b64: base64Data,
        }),
        signal: AbortSignal.timeout(this.config.timeoutMs),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(
          `PaddleOCR API error (${response.status}): ${errorText}`,
        );
      }

      const result = (await response.json()) as PaddleOCRExtractResponse;

      this.logger.debug('OCR completed successfully');

      // Return extracted text, or fallback if empty
      if (!result.text || result.text.trim().length === 0) {
        return NO_TEXT_DETECTED;
      }

      return result.text;
    } catch (error) {
      this.logger.error(
        `OCR extraction failed: ${error instanceof Error ? error.message : String(error)}`,
        error instanceof Error && error.stack ? error.stack : undefined,
      );

      // Return fallback text on failure
      return NO_TEXT_DETECTED;
    }
  }

  /**
   * Encode an ImageData object to base64 string.
   */
  private encodeImageToBase64(image: ImageData): string {
    // Buffer.toString('base64') is the standard Node.js way
    return image.buffer.toString('base64');
  }
}
