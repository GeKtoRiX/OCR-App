import { KokoroConfig } from './kokoro.config';

describe('KokoroConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should use default values when env vars are not set', () => {
    delete process.env.KOKORO_HOST;
    delete process.env.KOKORO_PORT;
    delete process.env.KOKORO_TIMEOUT;

    const config = new KokoroConfig();

    expect(config.host).toBe('localhost');
    expect(config.port).toBe(8200);
    expect(config.baseUrl).toBe('http://localhost:8200');
    expect(config.ttsEndpoint).toBe('http://localhost:8200/tts');
    expect(config.healthEndpoint).toBe('http://localhost:8200/health');
    expect(config.timeoutMs).toBe(60000);
  });

  it('should read values from env vars', () => {
    process.env.KOKORO_HOST = '10.0.0.3';
    process.env.KOKORO_PORT = '8400';
    process.env.KOKORO_TIMEOUT = '30000';

    const config = new KokoroConfig();

    expect(config.host).toBe('10.0.0.3');
    expect(config.port).toBe(8400);
    expect(config.baseUrl).toBe('http://10.0.0.3:8400');
    expect(config.ttsEndpoint).toBe('http://10.0.0.3:8400/tts');
    expect(config.timeoutMs).toBe(30000);
  });

  it('should fall back to numeric defaults when env values are invalid', () => {
    process.env.KOKORO_HOST = 'kokoro.internal';
    process.env.KOKORO_PORT = 'invalid';
    process.env.KOKORO_TIMEOUT = 'bad-timeout';

    const config = new KokoroConfig();

    expect(config.host).toBe('kokoro.internal');
    expect(config.port).toBe(8200);
    expect(config.baseUrl).toBe('http://kokoro.internal:8200');
    expect(config.timeoutMs).toBe(60000);
  });
});
