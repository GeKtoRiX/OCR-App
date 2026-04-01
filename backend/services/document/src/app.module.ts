import { Module } from '@nestjs/common';
import { ISavedDocumentRepository as SharedSavedDocumentRepository } from '@ocr-app/shared';
import { ClientProxyFactory, Transport } from '@nestjs/microservices';
import { SavedDocumentUseCase } from '@backend/application/use-cases/saved-document.use-case';
import { DocumentVocabularyPipelineUseCase } from '@backend/application/use-cases/document-vocabulary-pipeline.use-case';
import { IDocumentVocabularyExtractor } from '@backend/domain/ports/document-vocabulary-extractor.port';
import { ISavedDocumentRepository } from '@backend/domain/ports/saved-document-repository.port';
import { IVocabularyLlmService } from '@backend/domain/ports/vocabulary-llm-service.port';
import { IVocabularyRepository } from '@backend/domain/ports/vocabulary-repository.port';
import { SqliteConfig } from '@backend/infrastructure/config/sqlite.config';
import { DocumentVocabularyExtractorService } from '@backend/infrastructure/document/document-vocabulary-extractor.service';
import { LMStudioVocabularyService } from '@backend/infrastructure/lm-studio/lm-studio-vocabulary.service';
import { LmStudioExerciseGeneratorService } from '@backend/infrastructure/lm-studio/lm-studio-exercise-generator.service';
import { LmStudioSessionAnalyzerService } from '@backend/infrastructure/lm-studio/lm-studio-session-analyzer.service';
import { LmStudioCandidateEnricherService } from '@backend/infrastructure/lm-studio/lm-studio-candidate-enricher.service';
import { SqliteConnectionProvider } from '@backend/infrastructure/sqlite/sqlite-connection.provider';
import { SqliteSavedDocumentRepository } from '@backend/infrastructure/sqlite/sqlite-saved-document.repository';
import { smokeOnlyProvider } from '@backend/infrastructure/testing/smoke-only.provider';
import { StubVocabularyLlmService } from '@backend/infrastructure/testing/stub-vocabulary-llm.service';
import { TcpVocabularyRepository } from '@backend/infrastructure/vocabulary/tcp-vocabulary.repository';
import { LmStudioModule } from '@backend/presentation/modules/lm-studio.module';
import { DocumentMessageController } from './document.message.controller';

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
    LmStudioExerciseGeneratorService,
    LmStudioSessionAnalyzerService,
    LmStudioCandidateEnricherService,
    LMStudioVocabularyService,
    StubVocabularyLlmService,
    smokeOnlyProvider(IVocabularyLlmService, LMStudioVocabularyService, StubVocabularyLlmService),
    SavedDocumentUseCase,
    DocumentVocabularyPipelineUseCase,
  ],
})
export class AppModule {}
