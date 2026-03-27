import { Module } from '@nestjs/common';
import { ISavedDocumentRepository as SharedSavedDocumentRepository } from '@ocr-app/shared';
import { SavedDocumentUseCase } from '@backend/application/use-cases/saved-document.use-case';
import { ISavedDocumentRepository } from '@backend/domain/ports/saved-document-repository.port';
import { SqliteConfig } from '@backend/infrastructure/config/sqlite.config';
import { SqliteConnectionProvider } from '@backend/infrastructure/sqlite/sqlite-connection.provider';
import { SqliteSavedDocumentRepository } from '@backend/infrastructure/sqlite/sqlite-saved-document.repository';
import { DocumentMessageController } from './document.message.controller';

@Module({
  controllers: [DocumentMessageController],
  providers: [
    {
      provide: SqliteConfig,
      useFactory: () => ({
        dbPath:
          process.env.DOCUMENTS_SQLITE_DB_PATH || 'data/documents.sqlite',
      }),
    },
    SqliteConnectionProvider,
    SqliteSavedDocumentRepository,
    {
      provide: ISavedDocumentRepository,
      useExisting: SqliteSavedDocumentRepository,
    },
    {
      provide: SharedSavedDocumentRepository,
      useExisting: ISavedDocumentRepository,
    },
    SavedDocumentUseCase,
  ],
})
export class AppModule {}
