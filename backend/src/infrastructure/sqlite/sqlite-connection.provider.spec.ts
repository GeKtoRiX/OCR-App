import { existsSync, mkdtempSync, rmSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import { SqliteConnectionProvider } from './sqlite-connection.provider';
import { SqliteConfig } from '../config/sqlite.config';

describe('SqliteConnectionProvider', () => {
  it('creates the parent directory before opening the database', () => {
    const root = mkdtempSync(join(tmpdir(), 'sqlite-provider-'));
    const dbPath = join(root, 'nested', 'db', 'test.sqlite');
    const provider = new SqliteConnectionProvider({ dbPath } as SqliteConfig);

    try {
      provider.onModuleInit();

      expect(existsSync(join(root, 'nested', 'db'))).toBe(true);
      expect(provider.db).toBeDefined();
    } finally {
      provider.onModuleDestroy();
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('does not throw when destroyed before initialization', () => {
    const provider = new SqliteConnectionProvider({
      dbPath: ':memory:',
    } as SqliteConfig);

    expect(() => provider.onModuleDestroy()).not.toThrow();
  });
});
