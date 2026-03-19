import { NO_TEXT_DETECTED } from '../../domain/constants';
import { PaddleOCRService } from './paddleocr-ocr.service';
import { PaddleOCRConfig } from '../config/paddleocr.config';
import { ImageData } from '../../domain/entities/image-data.entity';

describe('PaddleOCRService', () => {
  let service: PaddleOCRService;
  let config: PaddleOCRConfig;

  beforeEach(() => {
    // Mock config with test values
    config = Object.assign(new PaddleOCRConfig(), {
      baseUrl: 'http://localhost:8000',
      base64ExtractEndpoint: 'http://localhost:8000/api/extract/base64',
      timeoutMs: 30000,
    });
    service = new PaddleOCRService(config);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('extractText', () => {
    let mockImage: ImageData;

    beforeEach(() => {
      const testBuffer = Buffer.from('test image data');
      mockImage = new ImageData(testBuffer, 'image/png', 'test.png');
    });

    it('should return fallback text when API returns empty result', async () => {
      // Mock fetch to return empty response
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: '' }),
        text: async () => '',
      });

      const result = await service.extractText(mockImage);

      expect(result).toBe(NO_TEXT_DETECTED);
    });

    it('should return extracted text from API response', async () => {
      // Mock fetch to return successful OCR result
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          text: 'Extracted text from image\nLine 2 of text',
        }),
        text: async () => '',
      });

      const result = await service.extractText(mockImage);

      expect(result).toBe('Extracted text from image\nLine 2 of text');
    });

    it('should return fallback when API returns error status', async () => {
      // Mock fetch to return error response
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Service unavailable',
      });

      const result = await service.extractText(mockImage);

      expect(result).toBe(NO_TEXT_DETECTED);
    });

    it('should return fallback when fetch throws network error', async () => {
      // Mock fetch to throw an error (network unreachable)
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      const result = await service.extractText(mockImage);

      expect(result).toBe(NO_TEXT_DETECTED);
    });

    it('should return fallback when API returns null text', async () => {
      // Mock fetch to return null text
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: null }),
        text: async () => '',
      });

      const result = await service.extractText(mockImage);

      expect(result).toBe(NO_TEXT_DETECTED);
    });

    it('should return fallback when API returns undefined text', async () => {
      // Mock fetch to return undefined text
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: undefined }),
        text: async () => '',
      });

      const result = await service.extractText(mockImage);

      expect(result).toBe(NO_TEXT_DETECTED);
    });

    it('should handle whitespace-only text from API', async () => {
      // Mock fetch to return whitespace-only response
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: '   \n\t  ' }),
        text: async () => '',
      });

      const result = await service.extractText(mockImage);

      expect(result).toBe(NO_TEXT_DETECTED);
    });

    it('should encode buffer to base64 correctly', () => {
      const testBuffer = Buffer.from('Hello World!');
      const mockImage = new ImageData(testBuffer, 'image/png', 'test.png');
      
      // Access private method via any type assertion for testing
      const serviceAny = service as any;
      const base64Result = serviceAny.encodeImageToBase64(mockImage);

      expect(base64Result).toBe('SGVsbG8gV29ybGQh');
    });
  });
});
