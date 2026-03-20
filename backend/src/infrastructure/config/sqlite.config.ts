import { Injectable } from '@nestjs/common';

@Injectable()
export class SqliteConfig {
  readonly dbPath: string =
    process.env.SQLITE_DB_PATH || 'data/ocr-app.db';
}
