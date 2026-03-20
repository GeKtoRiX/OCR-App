import { QwenTtsService } from './qwen-tts.service';
import { QwenTtsConfig } from '../config/qwen-tts.config';

describe('QwenTtsService', () => {
  let service: QwenTtsService;

  beforeEach(() => {
    const config = Object.assign(new QwenTtsConfig(), {
      ttsEndpoint: 'http://localhost:8300/api/tts',
      healthEndpoint: 'http://localhost:8300/health',
      timeoutMs: 180000,
    });
    service = new QwenTtsService(config);
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
      expect(body.lang).toBe('English');
    });

    it('should forward explicit request fields to the sidecar', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(4),
      });

      await service.synthesize({
        text: 'Hi',
        lang: 'Korean',
        speaker: 'Ryan',
        instruct: 'Speak slowly',
      });

      const body = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[0][1].body,
      );
      expect(body.lang).toBe('Korean');
      expect(body.speaker).toBe('Ryan');
      expect(body.instruct).toBe('Speak slowly');
    });

    it('should throw when sidecar returns non-OK status', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      });

      await expect(service.synthesize({ text: 'Hello' })).rejects.toThrow(
        'Qwen TTS API error (503)',
      );
    });

    it('should propagate network errors', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      await expect(service.synthesize({ text: 'Hello' })).rejects.toThrow(
        'ECONNREFUSED',
      );
    });
  });

  describe('getHealth', () => {
    it('should return reachable=true and device from response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ready: true, device: 'gpu' }),
      });

      const health = await service.getHealth();

      expect(health.reachable).toBe(true);
      expect(health.device).toBe('gpu');
    });

    it('should return device=null when response body has no device field', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ready: true }),
      });

      const health = await service.getHealth();

      expect(health.reachable).toBe(true);
      expect(health.device).toBeNull();
    });

    it('should return reachable=false when sidecar health reports ready=false', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ready: false, device: 'gpu' }),
      });

      const health = await service.getHealth();

      expect(health.reachable).toBe(false);
      expect(health.device).toBe('gpu');
    });

    it('should return reachable=false and device=null when endpoint returns non-OK', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });

      const health = await service.getHealth();

      expect(health.reachable).toBe(false);
      expect(health.device).toBeNull();
    });

    it('should return reachable=false on network error', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));

      const health = await service.getHealth();

      expect(health.reachable).toBe(false);
      expect(health.device).toBeNull();
    });
  });
});
