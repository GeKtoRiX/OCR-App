import { Module } from '@nestjs/common';
import { ISavedDocumentRepository as SharedSavedDocumentRepository } from '@ocr-app/shared';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import { SavedDocumentUseCase } from '@backend/application/use-cases/saved-document.use-case';
import { IDocumentVocabularyExtractor } from '@backend/domain/ports/document-vocabulary-extractor.port';
import { ISavedDocumentRepository } from '@backend/domain/ports/saved-document-repository.port';
import { IVocabularyLlmService } from '@backend/domain/ports/vocabulary-llm-service.port';
import { IVocabularyRepository } from '@backend/domain/ports/vocabulary-repository.port';
import { SqliteConfig } from '@backend/infrastructure/config/sqlite.config';
import { DocumentVocabularyExtractorService } from '@backend/infrastructure/document/document-vocabulary-extractor.service';
import { LMStudioVocabularyService } from '@backend/infrastructure/lm-studio/lm-studio-vocabulary.service';
import { SqliteConnectionProvider } from '@backend/infrastructure/sqlite/sqlite-connection.provider';
import { SqliteSavedDocumentRepository } from '@backend/infrastructure/sqlite/sqlite-saved-document.repository';
import { StubVocabularyLlmService } from '@backend/infrastructure/testing/stub-vocabulary-llm.service';
import { TcpVocabularyRepository } from '@backend/infrastructure/vocabulary/tcp-vocabulary.repository';
import { LmStudioModule } from '@backend/presentation/modules/lm-studio.module';
import { DocumentMessageController } from './document.message.controller';

const LM_STUDIO_SMOKE_ONLY = process.env.LM_STUDIO_SMOKE_ONLY === 'true';

@Module({
  imports: [LmStudioModule],
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
    {
      provide: 'VOCABULARY_SERVICE_CLIENT',
      useFactory: () =>
        ClientProxyFactory.create({
          transport: Transport.TCP,
          options: {
            host: process.env.VOCABULARY_SERVICE_HOST || '127.0.0.1',
            port: Number(process.env.VOCABULARY_SERVICE_PORT || 3904),
          },
        }),
    },
    TcpVocabularyRepository,
    {
      provide: IVocabularyRepository,
      useExisting: TcpVocabularyRepository,
    },
    DocumentVocabularyExtractorService,
    {
      provide: IDocumentVocabularyExtractor,
      useExisting: DocumentVocabularyExtractorService,
    },
    LMStudioVocabularyService,
    StubVocabularyLlmService,
    {
      provide: IVocabularyLlmService,
      useClass: LM_STUDIO_SMOKE_ONLY
        ? StubVocabularyLlmService
        : LMStudioVocabularyService,
    },
    SavedDocumentUseCase,
  ],
})
export class AppModule {}
