import { SupertoneService } from './supertone.service';
import { SupertoneConfig } from '../config/supertone.config';

describe('SupertoneService', () => {
  let service: SupertoneService;

  beforeEach(() => {
    const config = Object.assign(new SupertoneConfig(), {
      ttsEndpoint: 'http://localhost:8100/api/tts',
      healthEndpoint: 'http://localhost:8100/health',
      timeoutMs: 120000,
    });
    service = new SupertoneService(config);
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
      expect(body.engine).toBe('supertone');
      expect(body.voice).toBe('M1');
      expect(body.lang).toBe('en');
      expect(body.speed).toBe(1.05);
      expect(body.total_steps).toBe(5);
    });

    it('should forward explicit request fields to the sidecar', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(4),
      });

      await service.synthesize({
        text: 'Hi',
        engine: 'other',
        voice: 'F2',
        lang: 'ko',
        speed: 0.8,
        totalSteps: 10,
      });

      const body = JSON.parse(
        (global.fetch as jest.Mock).mock.calls[0][1].body,
      );
      expect(body.engine).toBe('other');
      expect(body.voice).toBe('F2');
      expect(body.lang).toBe('ko');
      expect(body.speed).toBe(0.8);
      expect(body.total_steps).toBe(10);
    });

    it('should throw when sidecar returns non-OK status', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: async () => 'Internal Server Error',
      });

      await expect(service.synthesize({ text: 'Hello' })).rejects.toThrow(
        'Supertone API error (500)',
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
