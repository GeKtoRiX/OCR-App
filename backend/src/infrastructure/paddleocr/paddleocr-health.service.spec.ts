import { PaddleOCRHealthService } from './paddleocr-health.service';
import { PaddleOCRConfig } from '../config/paddleocr.config';

describe('PaddleOCRHealthService', () => {
  let service: PaddleOCRHealthService;

  beforeEach(() => {
    const config = Object.assign(new PaddleOCRConfig(), {
      healthEndpoint: 'http://localhost:8000/health',
      modelsEndpoint: 'http://localhost:8000/models',
    });
    service = new PaddleOCRHealthService(config);
  });

  describe('isReachable', () => {
    it('should return true when health endpoint responds OK', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: true });

      expect(await service.isReachable()).toBe(true);
    });

    it('should return false when health endpoint responds not-OK', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });

      expect(await service.isReachable()).toBe(false);
    });

    it('should return false on network error', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

      expect(await service.isReachable()).toBe(false);
    });
  });

  describe('getDevice', () => {
    it('should return "gpu" when response reports gpu device', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ device: 'gpu' }),
      });

      expect(await service.getDevice()).toBe('gpu');
    });

    it('should return "cpu" when response reports cpu device', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ device: 'cpu' }),
      });

      expect(await service.getDevice()).toBe('cpu');
    });

    it('should return "cpu" for unrecognised device values', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ device: 'npu' }),
      });

      expect(await service.getDevice()).toBe('cpu');
    });

    it('should return null when response is not OK', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 503 });

      expect(await service.getDevice()).toBeNull();
    });

    it('should return null on network error', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('timeout'));

      expect(await service.getDevice()).toBeNull();
    });
  });

  describe('listModels', () => {
    it('should return model names from response', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ models: { det: 'det_v3', rec: 'rec_v3' } }),
      });

      expect(await service.listModels()).toEqual(['det_v3', 'rec_v3']);
    });

    it('should return empty array when models object is absent', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({}),
      });

      expect(await service.listModels()).toEqual([]);
    });

    it('should filter out null and undefined model values', async () => {
      global.fetch = jest.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          models: { det: 'det_v3', cls: null, rec: undefined },
        }),
      });

      expect(await service.listModels()).toEqual(['det_v3']);
    });

    it('should throw when endpoint returns non-OK status', async () => {
      global.fetch = jest.fn().mockResolvedValue({ ok: false, status: 500 });

      await expect(service.listModels()).rejects.toThrow(
        'Could not connect to PaddleOCR sidecar',
      );
    });

    it('should throw when fetch throws', async () => {
      global.fetch = jest.fn().mockRejectedValue(new Error('Network error'));

      await expect(service.listModels()).rejects.toThrow(
        'Could not connect to PaddleOCR sidecar',
      );
    });
  });
});
