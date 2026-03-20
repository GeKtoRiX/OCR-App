import { SqliteConfig } from './sqlite.config';

describe('SqliteConfig', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('uses default db path when env var is not set', () => {
    delete process.env.SQLITE_DB_PATH;

    const config = new SqliteConfig();

    expect(config.dbPath).toBe('data/ocr-app.db');
  });

  it('reads db path from env var', () => {
    process.env.SQLITE_DB_PATH = '/tmp/test.db';

    const config = new SqliteConfig();

    expect(config.dbPath).toBe('/tmp/test.db');
  });
});
