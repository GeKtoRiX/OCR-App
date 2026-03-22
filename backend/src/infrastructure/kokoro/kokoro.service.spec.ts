import { KokoroService } from './kokoro.service';
import { KokoroConfig } from '../config/kokoro.config';

describe('KokoroService', () => {
  let service: KokoroService;

  beforeEach(() => {
    const config = Object.assign(new KokoroConfig(), {
      ttsEndpoint: 'http://localhost:8200/tts',
      healthEndpoint: 'http://localhost:8200/health',
      timeoutMs: 60000,
    });
    service = new KokoroService(config);
  });

  describe('synthesize', () => {
    it('should return a Buffer on success', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      });

      const result = await service.synthesize({ text: 'Hello' });

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(8);
    });

    it('should apply default values for omitted optional fields', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(4),
      });

      await service.synthesize({ text: 'Test' });

      const body = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[0][1].body,
      );
      expect(body.text).toBe('Test');
      expect(body.voice).toBe('af_heart');
      expect(body.speed).toBe(1.0);
      expect(body.lang).toBe('en-us');
    });

    it('should forward explicit voice, speed, and lang to the sidecar', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(4),
      });

      await service.synthesize({ text: 'Hi', voice: 'am_michael', speed: 1.5, lang: 'en-gb' });

      const body = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[0][1].body,
      );
      expect(body.voice).toBe('am_michael');
      expect(body.speed).toBe(1.5);
      expect(body.lang).toBe('en-gb');
    });

    it('should throw when sidecar returns non-OK status', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Error',
      });

      await expect(service.synthesize({ text: 'Hello' })).rejects.toThrow(
        'Kokoro API error (500)',
      );
    });

    it('should propagate network errors', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.synthesize({ text: 'Hello' })).rejects.toThrow(
        'ECONNREFUSED',
      );
    });
  });

  describe('checkHealth', () => {
    it('should return true when sidecar responds OK', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      expect(await service.checkHealth()).toBe(true);
    });

    it('should return false when sidecar responds not-OK', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false });

      expect(await service.checkHealth()).toBe(false);
    });

    it('should return false on network error', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));

      expect(await service.checkHealth()).toBe(false);
    });
  });
});
