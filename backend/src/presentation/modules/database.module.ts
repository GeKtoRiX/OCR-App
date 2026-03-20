import { Module } from '@nestjs/common';
import { SqliteConfig } from '../../infrastructure/config/sqlite.config';
import { SqliteConnectionProvider } from '../../infrastructure/sqlite/sqlite-connection.provider';

@Module({
  providers: [SqliteConfig, SqliteConnectionProvider],
  exports: [SqliteConfig, SqliteConnectionProvider],
})
export class DatabaseModule {}
