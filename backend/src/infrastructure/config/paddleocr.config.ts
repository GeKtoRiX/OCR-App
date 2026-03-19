import { Injectable } from '@nestjs/common';

/**
 * PaddleOCR Configuration Service
 *
 * Manages configuration for the PaddleOCR sidecar service.
 * Uses environment variables with sensible defaults.
 */
@Injectable()
export class PaddleOCRConfig {
  // Sidecar connection settings
  readonly host: string = process.env.PADDLEOCR_HOST || 'localhost';
  readonly port: number = parseInt(
    process.env.PADDLEOCR_PORT || '8000',
    10,
  ) || 8000;

  // API endpoint configuration
  readonly baseUrl: string = `http://${this.host}:${this.port}`;
  readonly base64ExtractEndpoint: string = `${this.baseUrl}/api/extract/base64`;
  readonly healthEndpoint: string = `${this.baseUrl}/health`;
  readonly modelsEndpoint: string = `${this.baseUrl}/models`;

  // Request settings
  readonly timeoutMs: number = parseInt(
    process.env.PADDLEOCR_TIMEOUT || '30000',
    10,
  ) || 30000;

  // Validation settings (matches frontend/backend validation)
  readonly maxFileSizeBytes: number = 10 * 1024 * 1024; // 10MB
  readonly allowedMimeTypes: readonly string[] = [
    'image/png',
    'image/jpeg',
    'image/jpg',
    'image/webp',
    'image/bmp',
    'image/tiff',
  ];

  /**
   * Get the full URL for a specific endpoint.
   */
  getEndpoint(path: string): string {
    return `${this.baseUrl}${path}`;
  }
}
