import { F5TtsConfig } from './f5-tts.config';

describe('F5TtsConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should use default values when env vars are not set', () => {
    delete process.env.F5_TTS_HOST;
    delete process.env.F5_TTS_PORT;
    delete process.env.F5_TTS_TIMEOUT;

    const config = new F5TtsConfig();

    expect(config.host).toBe('localhost');
    expect(config.port).toBe(8300);
    expect(config.baseUrl).toBe('http://localhost:8300');
    expect(config.ttsEndpoint).toBe('http://localhost:8300/api/tts');
    expect(config.healthEndpoint).toBe('http://localhost:8300/health');
    expect(config.timeoutMs).toBe(180000);
  });

  it('should read values from env vars', () => {
    process.env.F5_TTS_HOST = '10.0.0.2';
    process.env.F5_TTS_PORT = '8300';
    process.env.F5_TTS_TIMEOUT = '90000';

    const config = new F5TtsConfig();

    expect(config.host).toBe('10.0.0.2');
    expect(config.port).toBe(8300);
    expect(config.baseUrl).toBe('http://10.0.0.2:8300');
    expect(config.ttsEndpoint).toBe('http://10.0.0.2:8300/api/tts');
    expect(config.timeoutMs).toBe(90000);
  });

  it('should fall back to numeric defaults when env values are invalid', () => {
    process.env.F5_TTS_HOST = 'f5.internal';
    process.env.F5_TTS_PORT = 'not-a-number';
    process.env.F5_TTS_TIMEOUT = 'NaN';

    const config = new F5TtsConfig();

    expect(config.host).toBe('f5.internal');
    expect(config.port).toBe(8300);
    expect(config.baseUrl).toBe('http://f5.internal:8300');
    expect(config.timeoutMs).toBe(180000);
  });
});
