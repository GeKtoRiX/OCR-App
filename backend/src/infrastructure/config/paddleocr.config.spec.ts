import { PaddleOCRConfig } from './paddleocr.config';

describe('PaddleOCRConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should use default values when env vars are not set', () => {
    delete process.env.PADDLEOCR_HOST;
    delete process.env.PADDLEOCR_PORT;
    delete process.env.PADDLEOCR_TIMEOUT;

    const config = new PaddleOCRConfig();

    expect(config.host).toBe('localhost');
    expect(config.port).toBe(8000);
    expect(config.baseUrl).toBe('http://localhost:8000');
    expect(config.base64ExtractEndpoint).toBe('http://localhost:8000/api/extract/base64');
    expect(config.healthEndpoint).toBe('http://localhost:8000/health');
    expect(config.modelsEndpoint).toBe('http://localhost:8000/models');
    expect(config.timeoutMs).toBe(30000);
    expect(config.maxFileSizeBytes).toBe(10 * 1024 * 1024);
  });

  it('should read values from env vars', () => {
    process.env.PADDLEOCR_HOST = '10.0.0.1';
    process.env.PADDLEOCR_PORT = '9000';
    process.env.PADDLEOCR_TIMEOUT = '15000';

    const config = new PaddleOCRConfig();

    expect(config.host).toBe('10.0.0.1');
    expect(config.port).toBe(9000);
    expect(config.baseUrl).toBe('http://10.0.0.1:9000');
    expect(config.base64ExtractEndpoint).toBe('http://10.0.0.1:9000/api/extract/base64');
    expect(config.timeoutMs).toBe(15000);
  });

  it('should list all allowed MIME types', () => {
    const config = new PaddleOCRConfig();

    expect(config.allowedMimeTypes).toContain('image/png');
    expect(config.allowedMimeTypes).toContain('image/jpeg');
    expect(config.allowedMimeTypes).toContain('image/jpg');
    expect(config.allowedMimeTypes).toContain('image/webp');
    expect(config.allowedMimeTypes).toContain('image/bmp');
    expect(config.allowedMimeTypes).toContain('image/tiff');
    expect(config.allowedMimeTypes).toHaveLength(6);
  });

  it('getEndpoint should return full URL for a given path', () => {
    delete process.env.PADDLEOCR_HOST;
    delete process.env.PADDLEOCR_PORT;

    const config = new PaddleOCRConfig();

    expect(config.getEndpoint('/custom/path')).toBe('http://localhost:8000/custom/path');
  });
});
