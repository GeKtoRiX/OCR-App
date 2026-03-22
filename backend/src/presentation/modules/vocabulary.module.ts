import { Module } from '@nestjs/common';
import { VocabularyController } from '../controllers/vocabulary.controller';
import { PracticeController } from '../controllers/practice.controller';
import { VocabularyUseCase } from '../../application/use-cases/vocabulary.use-case';
import { PracticeUseCase } from '../../application/use-cases/practice.use-case';
import { IVocabularyRepository } from '../../domain/ports/vocabulary-repository.port';
import { IPracticeSessionRepository } from '../../domain/ports/practice-session-repository.port';
import { IVocabularyLlmService } from '../../domain/ports/vocabulary-llm-service.port';
import { SqliteVocabularyRepository } from '../../infrastructure/sqlite/sqlite-vocabulary.repository';
import { SqlitePracticeSessionRepository } from '../../infrastructure/sqlite/sqlite-practice-session.repository';
import { LMStudioVocabularyService } from '../../infrastructure/lm-studio/lm-studio-vocabulary.service';
import { DatabaseModule } from './database.module';
import { LmStudioModule } from './lm-studio.module';
import { StubVocabularyLlmService } from '../../infrastructure/testing/stub-vocabulary-llm.service';

const LM_STUDIO_SMOKE_ONLY = process.env.LM_STUDIO_SMOKE_ONLY === 'true';

@Module({
  imports: [DatabaseModule, LmStudioModule],
  controllers: [VocabularyController, PracticeController],
  providers: [
    SqliteVocabularyRepository,
    {
      provide: IVocabularyRepository,
      useExisting: SqliteVocabularyRepository,
    },
    SqlitePracticeSessionRepository,
    {
      provide: IPracticeSessionRepository,
      useExisting: SqlitePracticeSessionRepository,
    },
    LMStudioVocabularyService,
    StubVocabularyLlmService,
    {
      provide: IVocabularyLlmService,
      useClass: LM_STUDIO_SMOKE_ONLY
        ? StubVocabularyLlmService
        : LMStudioVocabularyService,
    },
    VocabularyUseCase,
    PracticeUseCase,
  ],
})
export class VocabularyModule {}
