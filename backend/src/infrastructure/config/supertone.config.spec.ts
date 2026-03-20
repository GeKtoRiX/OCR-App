import { SupertoneConfig } from './supertone.config';

describe('SupertoneConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('should use default values when env vars are not set', () => {
    delete process.env.SUPERTONE_HOST;
    delete process.env.SUPERTONE_PORT;
    delete process.env.SUPERTONE_TIMEOUT;

    const config = new SupertoneConfig();

    expect(config.host).toBe('localhost');
    expect(config.port).toBe(8100);
    expect(config.baseUrl).toBe('http://localhost:8100');
    expect(config.ttsEndpoint).toBe('http://localhost:8100/api/tts');
    expect(config.healthEndpoint).toBe('http://localhost:8100/health');
    expect(config.timeoutMs).toBe(120000);
  });

  it('should read values from env vars', () => {
    process.env.SUPERTONE_HOST = '192.168.1.5';
    process.env.SUPERTONE_PORT = '8200';
    process.env.SUPERTONE_TIMEOUT = '60000';

    const config = new SupertoneConfig();

    expect(config.host).toBe('192.168.1.5');
    expect(config.port).toBe(8200);
    expect(config.baseUrl).toBe('http://192.168.1.5:8200');
    expect(config.ttsEndpoint).toBe('http://192.168.1.5:8200/api/tts');
    expect(config.healthEndpoint).toBe('http://192.168.1.5:8200/health');
    expect(config.timeoutMs).toBe(60000);
  });
});
