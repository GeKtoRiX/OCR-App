import { LMStudioConfig } from './lm-studio.config';

describe('LMStudioConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should use default values when env vars are not set', () => {
    delete process.env.LM_STUDIO_BASE_URL;
    delete process.env.OCR_MODEL;
    delete process.env.STRUCTURING_MODEL;
    delete process.env.LM_STUDIO_TIMEOUT;

    const config = new LMStudioConfig();

    expect(config.baseUrl).toBe('http://localhost:1234/v1');
    expect(config.ocrModel).toBe('paddleocr-vl-0.9b');
    expect(config.structuringModel).toBe('qwen/qwen3.5-9b');
    expect(config.timeoutMs).toBe(120000);
  });

  it('should read values from env vars', () => {
    process.env.LM_STUDIO_BASE_URL = 'http://custom:5555/v1';
    process.env.OCR_MODEL = 'custom-ocr';
    process.env.STRUCTURING_MODEL = 'custom-struct';
    process.env.LM_STUDIO_TIMEOUT = '30000';

    const config = new LMStudioConfig();

    expect(config.baseUrl).toBe('http://custom:5555/v1');
    expect(config.ocrModel).toBe('custom-ocr');
    expect(config.structuringModel).toBe('custom-struct');
    expect(config.timeoutMs).toBe(30000);
  });
});
