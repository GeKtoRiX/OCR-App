import {
  Injectable,
  Logger,
  OnModuleInit,
  OnModuleDestroy,
} from '@nestjs/common';
import Database from 'better-sqlite3';
import * as path from 'path';
import * as fs from 'fs';
import { SqliteConfig } from '../config/sqlite.config';

const WAL_CHECKPOINT_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

@Injectable()
export class SqliteConnectionProvider
  implements OnModuleInit, OnModuleDestroy
{
  private _db!: Database.Database;
  private checkpointTimer?: ReturnType<typeof setInterval>;
  private readonly logger = new Logger(SqliteConnectionProvider.name);

  constructor(private readonly config: SqliteConfig) {}

  get db(): Database.Database {
    return this._db;
  }

  onModuleInit(): void {
    const dir = path.dirname(this.config.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    this._db = new Database(this.config.dbPath);
    this._db.pragma('journal_mode = WAL');
    this._db.pragma('synchronous = NORMAL');
    this._db.pragma('cache_size = -64000');
    this._db.pragma('mmap_size = 268435456');
    this._db.pragma('temp_store = MEMORY');
    this._db.pragma('busy_timeout = 5000');
    this.logger.log(`SQLite database opened at ${this.config.dbPath}`);

    // Periodic WAL checkpoint to prevent unbounded WAL growth
    this.checkpointTimer = setInterval(() => {
      try {
        this._db.pragma('wal_checkpoint(TRUNCATE)');
        this.logger.debug('WAL checkpoint completed');
      } catch (err) {
        this.logger.warn(`WAL checkpoint failed: ${err}`);
      }
    }, WAL_CHECKPOINT_INTERVAL_MS);
  }

  onModuleDestroy(): void {
    if (this.checkpointTimer) {
      clearInterval(this.checkpointTimer);
    }
    if (this._db) {
      try {
        this._db.pragma('wal_checkpoint(TRUNCATE)');
      } catch {
        // best-effort final checkpoint
      }
      this._db.close();
    }
  }
}
