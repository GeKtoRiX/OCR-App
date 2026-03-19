import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processImage, checkHealth } from './api';

describe('API service', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe('processImage', () => {
    it('should send FormData with image and return response', async () => {
      const mockResponse = {
        rawText: 'Hello',
        markdown: '# Hello',
        filename: 'test.png',
      };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const file = new File(['data'], 'test.png', { type: 'image/png' });
      const result = await processImage(file);

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/ocr',
        expect.objectContaining({
          method: 'POST',
          body: expect.any(FormData),
        }),
      );

      const form = (global.fetch as any).mock.calls[0][1].body as FormData;
      expect(form.get('image')).toBeInstanceOf(File);
    });

    it('should pass AbortSignal when provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          rawText: 'Hello',
          markdown: '# Hello',
          filename: 'test.png',
        }),
      });

      const controller = new AbortController();
      const file = new File(['data'], 'test.png', { type: 'image/png' });

      await processImage(file, controller.signal);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/ocr',
        expect.objectContaining({
          signal: controller.signal,
        }),
      );
    });

    it('should throw Error with message from API on failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        json: async () => ({ message: 'No image file provided' }),
      });

      const file = new File(['data'], 'test.png', { type: 'image/png' });
      await expect(processImage(file)).rejects.toThrow('No image file provided');
    });

    it('should fall back to statusText when json parsing fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => {
          throw new Error('not json');
        },
      });

      const file = new File(['data'], 'test.png', { type: 'image/png' });
      await expect(processImage(file)).rejects.toThrow('Internal Server Error');
    });
  });

  describe('checkHealth', () => {
    it('should fetch /api/health and return response', async () => {
      const mockResponse = {
        paddleOcrReachable: true,
        paddleOcrModels: ['det', 'rec'],
        lmStudioReachable: true,
        lmStudioModels: ['qwen/qwen3.5-9b'],
      };
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => mockResponse,
      });

      const result = await checkHealth();

      expect(result).toEqual(mockResponse);
      expect(global.fetch).toHaveBeenCalledWith('/api/health');
    });

    it('should throw Error with message from API on failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({ message: 'OCR backend unavailable' }),
      });

      await expect(checkHealth()).rejects.toThrow('OCR backend unavailable');
    });
  });
});
