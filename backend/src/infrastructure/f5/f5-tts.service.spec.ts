import { F5TtsService } from './f5-tts.service';
import { F5TtsConfig } from '../config/f5-tts.config';

describe('F5TtsService', () => {
  let service: F5TtsService;

  beforeEach(() => {
    const config = Object.assign(new F5TtsConfig(), {
      ttsEndpoint: 'http://localhost:8300/api/tts',
      healthEndpoint: 'http://localhost:8300/health',
      timeoutMs: 180000,
    });
    service = new F5TtsService(config);
  });

  describe('synthesize', () => {
    it('should return a Buffer on success', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(8),
      }) as any;

      const result = await service.synthesize({
        text: 'Hello',
        refText: 'Reference text',
        refAudio: {
          buffer: Buffer.from('wav'),
          mimetype: 'audio/wav',
          originalname: 'reference.wav',
          size: 3,
        },
      });

      expect(result).toBeInstanceOf(Buffer);
      expect(result.length).toBe(8);
    });

    it('should serialize refText, removeSilence, and refAudio into FormData', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(4),
      }) as any;

      await service.synthesize({
        text: 'Test',
        refText: 'Some reference',
        autoTranscribe: true,
        removeSilence: true,
        refAudio: {
          buffer: Buffer.from('wav'),
          mimetype: 'audio/wav',
          originalname: 'reference.wav',
          size: 3,
        },
      });

      const form = (global.fetch as jest.Mock).mock.calls[0][1].body as FormData;
      expect(form.get('text')).toBe('Test');
      expect(form.get('refText')).toBe('Some reference');
      expect(form.get('autoTranscribe')).toBe('true');
      expect(form.get('removeSilence')).toBe('true');
      expect(form.get('refAudio')).toBeInstanceOf(File);
    });

    it('should serialize default fallback values for optional F5 fields', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        arrayBuffer: async () => new ArrayBuffer(4),
      }) as any;

      await service.synthesize({
        text: 'Test',
        refAudio: {
          buffer: Buffer.from('wav'),
          size: 3,
        } as any,
      });

      const form = (global.fetch as jest.Mock).mock.calls[0][1].body as FormData;
      const file = form.get('refAudio') as File;
      expect(form.get('refText')).toBe('');
      expect(form.get('autoTranscribe')).toBe('false');
      expect(form.get('removeSilence')).toBe('false');
      expect(file.name).toBe('reference.wav');
      expect(file.type).toBe('application/octet-stream');
    });

    it('should throw when sidecar returns non-OK status', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: false,
        status: 503,
        text: async () => 'Service Unavailable',
      }) as any;

      await expect(
        service.synthesize({
          text: 'Hello',
          refText: 'Reference text',
          refAudio: {
            buffer: Buffer.from('wav'),
            mimetype: 'audio/wav',
            originalname: 'reference.wav',
          },
        }),
      ).rejects.toThrow('F5 TTS API error (503)');
    });

    it('should propagate network errors', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED')) as any;

      await expect(
        service.synthesize({
          text: 'Hello',
          refText: 'Reference text',
          refAudio: {
            buffer: Buffer.from('wav'),
            mimetype: 'audio/wav',
            originalname: 'reference.wav',
          },
        }),
      ).rejects.toThrow('ECONNREFUSED');
    });
  });

  describe('getHealth', () => {
    it('should return reachable=true and device from response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ready: true, device: 'gpu' }),
      }) as any;

      const health = await service.getHealth();

      expect(health.reachable).toBe(true);
      expect(health.device).toBe('gpu');
    });

    it('should return device=null when response body has no device field', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ready: true }),
      }) as any;

      const health = await service.getHealth();

      expect(health.reachable).toBe(true);
      expect(health.device).toBeNull();
    });

    it('should return reachable=false when sidecar health reports ready=false', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ready: false, device: 'gpu' }),
      }) as any;

      const health = await service.getHealth();

      expect(health.reachable).toBe(false);
      expect(health.device).toBe('gpu');
    });

    it('should return reachable=false and device=null when endpoint returns non-OK', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 }) as any;

      const health = await service.getHealth();

      expect(health.reachable).toBe(false);
      expect(health.device).toBeNull();
    });

    it('should return reachable=false on network error', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('timeout')) as any;

      const health = await service.getHealth();

      expect(health.reachable).toBe(false);
      expect(health.device).toBeNull();
    });
  });
});
