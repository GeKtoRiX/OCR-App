import { VoxtralTtsConfig } from './voxtral-tts.config';

describe('VoxtralTtsConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses default values when env vars are not set', () => {
    delete process.env.VOXTRAL_HOST;
    delete process.env.VOXTRAL_PORT;
    delete process.env.VOXTRAL_TIMEOUT;

    const config = new VoxtralTtsConfig();

    expect(config.host).toBe('localhost');
    expect(config.port).toBe(8400);
    expect(config.baseUrl).toBe('http://localhost:8400');
    expect(config.ttsEndpoint).toBe('http://localhost:8400/api/tts');
    expect(config.healthEndpoint).toBe('http://localhost:8400/health');
    expect(config.timeoutMs).toBe(180000);
  });

  it('reads values from env vars', () => {
    process.env.VOXTRAL_HOST = '10.0.0.4';
    process.env.VOXTRAL_PORT = '8450';
    process.env.VOXTRAL_TIMEOUT = '120000';

    const config = new VoxtralTtsConfig();

    expect(config.host).toBe('10.0.0.4');
    expect(config.port).toBe(8450);
    expect(config.baseUrl).toBe('http://10.0.0.4:8450');
    expect(config.ttsEndpoint).toBe('http://10.0.0.4:8450/api/tts');
    expect(config.timeoutMs).toBe(120000);
  });

  it('falls back to defaults when numeric env vars are invalid', () => {
    process.env.VOXTRAL_HOST = 'voxtral.internal';
    process.env.VOXTRAL_PORT = 'invalid';
    process.env.VOXTRAL_TIMEOUT = 'bad-timeout';

    const config = new VoxtralTtsConfig();

    expect(config.host).toBe('voxtral.internal');
    expect(config.port).toBe(8400);
    expect(config.baseUrl).toBe('http://voxtral.internal:8400');
    expect(config.timeoutMs).toBe(180000);
  });
});
