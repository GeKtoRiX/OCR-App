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
      uploadExtractEndpoint: 'http://localhost:8000/api/extract/upload',
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

    it('should reject null image input before making a request', async () => {
      global.fetch = jest.fn();

      await expect(service.extractText(null as unknown as ImageData)).rejects.toThrow(
        'Invalid image data provided',
      );

      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should reject image input without a buffer', async () => {
      global.fetch = jest.fn();

      await expect(
        service.extractText({ buffer: undefined } as unknown as ImageData),
      ).rejects.toThrow('Invalid image data provided');

      expect(global.fetch).not.toHaveBeenCalled();
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

    it('should throw when API returns error status', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Service unavailable',
      });

      await expect(service.extractText(mockImage)).rejects.toThrow(
        'PaddleOCR API error (503)',
      );
    });

    it('should throw when fetch throws network error', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      await expect(service.extractText(mockImage)).rejects.toThrow(
        'Network error',
      );
    });

    it('should rethrow non-Error failures from response parsing', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => {
          throw 'invalid json payload';
        },
      });

      await expect(service.extractText(mockImage)).rejects.toBe(
        'invalid json payload',
      );
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

    it('should send image as multipart/form-data', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ text: 'OCR result' }),
        text: async () => '',
      });

      await service.extractText(mockImage);

      const fetchCall = (global.fetch as jest.Mock).mock.calls[0];
      expect(fetchCall[0]).toBe('http://localhost:8000/api/extract/upload');
      expect(fetchCall[1].body).toBeInstanceOf(FormData);
    });
  });
});
