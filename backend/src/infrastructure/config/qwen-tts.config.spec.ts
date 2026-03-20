import { QwenTtsConfig } from './qwen-tts.config';

describe('QwenTtsConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should use default values when env vars are not set', () => {
    delete process.env.QWEN_TTS_HOST;
    delete process.env.QWEN_TTS_PORT;
    delete process.env.QWEN_TTS_TIMEOUT;

    const config = new QwenTtsConfig();

    expect(config.host).toBe('localhost');
    expect(config.port).toBe(8300);
    expect(config.baseUrl).toBe('http://localhost:8300');
    expect(config.ttsEndpoint).toBe('http://localhost:8300/api/tts');
    expect(config.healthEndpoint).toBe('http://localhost:8300/health');
    expect(config.timeoutMs).toBe(180000);
  });

  it('should read values from env vars', () => {
    process.env.QWEN_TTS_HOST = '10.0.0.2';
    process.env.QWEN_TTS_PORT = '8300';
    process.env.QWEN_TTS_TIMEOUT = '90000';

    const config = new QwenTtsConfig();

    expect(config.host).toBe('10.0.0.2');
    expect(config.port).toBe(8300);
    expect(config.baseUrl).toBe('http://10.0.0.2:8300');
    expect(config.ttsEndpoint).toBe('http://10.0.0.2:8300/api/tts');
    expect(config.timeoutMs).toBe(90000);
  });
});
