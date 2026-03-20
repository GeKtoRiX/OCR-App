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

@Injectable()
export class SqliteConnectionProvider
  implements OnModuleInit, OnModuleDestroy
{
  private _db!: Database.Database;
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
    this.logger.log(`SQLite database opened at ${this.config.dbPath}`);
  }

  onModuleDestroy(): void {
    this._db?.close();
  }
}
