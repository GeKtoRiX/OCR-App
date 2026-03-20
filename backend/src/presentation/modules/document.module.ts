import { Module } from '@nestjs/common';
import { DocumentController } from '../controllers/document.controller';
import { SavedDocumentUseCase } from '../../application/use-cases/saved-document.use-case';
import { ISavedDocumentRepository } from '../../domain/ports/saved-document-repository.port';
import { SqliteSavedDocumentRepository } from '../../infrastructure/sqlite/sqlite-saved-document.repository';
import { DatabaseModule } from './database.module';

@Module({
  imports: [DatabaseModule],
  controllers: [DocumentController],
  providers: [
    SqliteSavedDocumentRepository,
    {
      provide: ISavedDocumentRepository,
      useExisting: SqliteSavedDocumentRepository,
    },
    SavedDocumentUseCase,
  ],
})
export class DocumentModule {}
