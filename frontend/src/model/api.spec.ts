import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  processImage,
  checkHealth,
  generateSpeech,
  createDocument,
  fetchDocuments,
  fetchDocument,
  updateDocument,
  deleteDocument,
} from './api';

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
        paddleOcrDevice: 'gpu',
        lmStudioReachable: true,
        lmStudioModels: ['qwen/qwen3.5-9b'],
        superToneReachable: true,
        kokoroReachable: true,
        qwenTtsReachable: true,
        qwenTtsDevice: 'gpu',
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

  describe('generateSpeech', () => {
    const settings = {
      engine: 'supertone' as const,
      voice: 'M1',
      lang: 'en',
      speed: 1.0,
      totalSteps: 5,
    };

    it('should POST to /api/tts with serialized settings and return a Blob', async () => {
      const fakeBlob = new Blob(['audio'], { type: 'audio/wav' });
      global.fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => fakeBlob });

      const result = await generateSpeech('hello world', settings);

      expect(result).toBe(fakeBlob);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/tts',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: 'hello world', ...settings }),
        }),
      );
    });

    it('should pass AbortSignal when provided', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true, blob: async () => new Blob() });

      const controller = new AbortController();
      await generateSpeech('text', settings, controller.signal);

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/tts',
        expect.objectContaining({ signal: controller.signal }),
      );
    });

    it('should throw Error with message from API on failure', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        json: async () => ({ message: 'TTS sidecar down' }),
      });

      await expect(generateSpeech('text', settings)).rejects.toThrow('TTS sidecar down');
    });

    it('should fall back to statusText when json parsing fails', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        json: async () => { throw new Error('not json'); },
      });

      await expect(generateSpeech('text', settings)).rejects.toThrow('Internal Server Error');
    });
  });

  describe('createDocument', () => {
    it('should POST to /api/documents and return saved document', async () => {
      const mockDoc = { id: '1', markdown: '# Hi', filename: 'a.png', createdAt: '', updatedAt: '' };
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockDoc });

      const result = await createDocument('# Hi', 'a.png');

      expect(result).toEqual(mockDoc);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/documents',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markdown: '# Hi', filename: 'a.png' }),
        }),
      );
    });

    it('should throw on error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false, status: 400, statusText: 'Bad Request',
        json: async () => ({ message: 'markdown is required' }),
      });

      await expect(createDocument('', 'a.png')).rejects.toThrow('markdown is required');
    });
  });

  describe('fetchDocuments', () => {
    it('should GET /api/documents and return list', async () => {
      const mockDocs = [{ id: '1', markdown: '# Hi', filename: 'a.png', createdAt: '', updatedAt: '' }];
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockDocs });

      const result = await fetchDocuments();

      expect(result).toEqual(mockDocs);
      expect(global.fetch).toHaveBeenCalledWith('/api/documents');
    });
  });

  describe('fetchDocument', () => {
    it('should GET /api/documents/:id and return document', async () => {
      const mockDoc = { id: '1', markdown: '# Hi', filename: 'a.png', createdAt: '', updatedAt: '' };
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockDoc });

      const result = await fetchDocument('1');

      expect(result).toEqual(mockDoc);
      expect(global.fetch).toHaveBeenCalledWith('/api/documents/1');
    });

    it('should throw 404', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false, status: 404, statusText: 'Not Found',
        json: async () => ({ message: 'Document not found' }),
      });

      await expect(fetchDocument('missing')).rejects.toThrow('Document not found');
    });
  });

  describe('updateDocument', () => {
    it('should PUT to /api/documents/:id and return updated document', async () => {
      const mockDoc = { id: '1', markdown: '# Updated', filename: 'a.png', createdAt: '', updatedAt: '' };
      global.fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => mockDoc });

      const result = await updateDocument('1', '# Updated');

      expect(result).toEqual(mockDoc);
      expect(global.fetch).toHaveBeenCalledWith(
        '/api/documents/1',
        expect.objectContaining({
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markdown: '# Updated' }),
        }),
      );
    });
  });

  describe('deleteDocument', () => {
    it('should DELETE /api/documents/:id', async () => {
      global.fetch = vi.fn().mockResolvedValue({ ok: true });

      await deleteDocument('1');

      expect(global.fetch).toHaveBeenCalledWith(
        '/api/documents/1',
        expect.objectContaining({ method: 'DELETE' }),
      );
    });

    it('should throw on error', async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false, status: 404, statusText: 'Not Found',
        json: async () => ({ message: 'Document not found' }),
      });

      await expect(deleteDocument('missing')).rejects.toThrow('Document not found');
    });
  });
});
