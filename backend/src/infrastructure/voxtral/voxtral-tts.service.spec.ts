import { VoxtralTtsConfig } from '../config/voxtral-tts.config';
import { VoxtralTtsService } from './voxtral-tts.service';

describe('VoxtralTtsService', () => {
  let service: VoxtralTtsService;

  beforeEach(() => {
    const config = Object.assign(new VoxtralTtsConfig(), {
      ttsEndpoint: 'http://localhost:8400/api/tts',
      healthEndpoint: 'http://localhost:8400/health',
      timeoutMs: 180000,
    });
    service = new VoxtralTtsService(config);
  });

  describe('synthesize', () => {
    it('returns a Buffer on success', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      }) as any;

      const result = await service.synthesize({
        text: 'Hello',
        voice: 'casual_male',
        format: 'wav',
      });

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(8);
    });

    it('serializes default fallback values for optional fields', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(4),
      }) as any;

      await service.synthesize({
        text: 'Test',
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'http://localhost:8400/api/tts',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            text: 'Test',
            voice: 'casual_male',
            format: 'wav',
          }),
        }),
      );
    });

    it('throws when sidecar returns non-OK status', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      }) as any;

      await expect(
        service.synthesize({
          text: 'Hello',
          voice: 'casual_male',
        }),
      ).rejects.toThrow('Voxtral API error (503)');
    });
  });

  describe('getHealth', () => {
    it('returns reachable=true and device from response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ready: true, device: 'gpu' }),
      }) as any;

      const health = await service.getHealth();

      expect(health.reachable).toBe(true);
      expect(health.device).toBe('gpu');
    });

    it('returns reachable=false when sidecar health reports ready=false', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ready: false, device: 'gpu' }),
      }) as any;

      const health = await service.getHealth();

      expect(health.reachable).toBe(false);
      expect(health.device).toBe('gpu');
    });

    it('returns reachable=false and device=null on network error', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('timeout')) as any;

      const health = await service.getHealth();

      expect(health.reachable).toBe(false);
      expect(health.device).toBeNull();
    });
  });
});
