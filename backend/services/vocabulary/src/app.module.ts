import { Module } from '@nestjs/common';
import {
  IPracticeSessionRepository as SharedPracticeSessionRepository,
  IVocabularyLlmService as SharedVocabularyLlmService,
  IVocabularyRepository as SharedVocabularyRepository,
} from '@ocr-app/shared';
import { PracticeUseCase } from '@backend/application/use-cases/practice.use-case';
import { VocabularyUseCase } from '@backend/application/use-cases/vocabulary.use-case';
import { IPracticeSessionRepository } from '@backend/domain/ports/practice-session-repository.port';
import { IVocabularyLlmService } from '@backend/domain/ports/vocabulary-llm-service.port';
import { IVocabularyRepository } from '@backend/domain/ports/vocabulary-repository.port';
import { SqliteConfig } from '@backend/infrastructure/config/sqlite.config';
import { LMStudioVocabularyService } from '@backend/infrastructure/lm-studio/lm-studio-vocabulary.service';
import { SqliteConnectionProvider } from '@backend/infrastructure/sqlite/sqlite-connection.provider';
import { SqlitePracticeSessionRepository } from '@backend/infrastructure/sqlite/sqlite-practice-session.repository';
import { SqliteVocabularyRepository } from '@backend/infrastructure/sqlite/sqlite-vocabulary.repository';
import { StubVocabularyLlmService } from '@backend/infrastructure/testing/stub-vocabulary-llm.service';
import { LmStudioModule } from '@backend/presentation/modules/lm-studio.module';
import { VocabularyMessageController } from './vocabulary.message.controller';

const LM_STUDIO_SMOKE_ONLY = process.env.LM_STUDIO_SMOKE_ONLY === 'true';

@Module({
  imports: [LmStudioModule],
  controllers: [VocabularyMessageController],
  providers: [
    {
      provide: SqliteConfig,
      useFactory: () => ({
        dbPath:
          process.env.VOCABULARY_SQLITE_DB_PATH || 'data/vocabulary.sqlite',
      }),
    },
    SqliteConnectionProvider,
    SqliteVocabularyRepository,
    {
      provide: IVocabularyRepository,
      useExisting: SqliteVocabularyRepository,
    },
    {
      provide: SharedVocabularyRepository,
      useExisting: IVocabularyRepository,
    },
    SqlitePracticeSessionRepository,
    {
      provide: IPracticeSessionRepository,
      useExisting: SqlitePracticeSessionRepository,
    },
    {
      provide: SharedPracticeSessionRepository,
      useExisting: IPracticeSessionRepository,
    },
    LMStudioVocabularyService,
    StubVocabularyLlmService,
    {
      provide: IVocabularyLlmService,
      useClass: LM_STUDIO_SMOKE_ONLY
        ? StubVocabularyLlmService
        : LMStudioVocabularyService,
    },
    {
      provide: SharedVocabularyLlmService,
      useExisting: IVocabularyLlmService,
    },
    VocabularyUseCase,
    PracticeUseCase,
  ],
})
export class AppModule {}
