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
import { LMStudioConfig } from '../../infrastructure/config/lm-studio.config';
import { LMStudioClient } from '../../infrastructure/lm-studio/lm-studio.client';
import { DatabaseModule } from './database.module';

@Module({
  imports: [DatabaseModule],
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
    LMStudioConfig,
    LMStudioClient,
    LMStudioVocabularyService,
    {
      provide: IVocabularyLlmService,
      useExisting: LMStudioVocabularyService,
    },
    VocabularyUseCase,
    PracticeUseCase,
  ],
})
export class VocabularyModule {}
