import { Injectable } from '@nestjs/common';
import {
  IVocabularyLlmService,
  GeneratedExercise,
  SessionAnalysis,
} from '../../domain/ports/vocabulary-llm-service.port';
import { VocabularyWord } from '../../domain/entities/vocabulary-word.entity';
import { ExerciseAttempt } from '../../domain/entities/exercise-attempt.entity';
import { DocumentVocabCandidate } from '../../domain/entities/document-vocab-candidate.entity';
import { LmStudioExerciseGeneratorService } from './lm-studio-exercise-generator.service';
import { LmStudioSessionAnalyzerService } from './lm-studio-session-analyzer.service';
import { LmStudioCandidateEnricherService } from './lm-studio-candidate-enricher.service';

@Injectable()
export class LMStudioVocabularyService extends IVocabularyLlmService {
  constructor(
    private readonly exerciseGenerator: LmStudioExerciseGeneratorService,
    private readonly sessionAnalyzer: LmStudioSessionAnalyzerService,
    private readonly candidateEnricher: LmStudioCandidateEnricherService,
  ) {
    super();
  }

  generateExercises(words: VocabularyWord[], count: number): Promise<GeneratedExercise[]> {
    return this.exerciseGenerator.generateExercises(words, count);
  }

  analyzeSession(words: VocabularyWord[], attempts: ExerciseAttempt[]): Promise<SessionAnalysis> {
    return this.sessionAnalyzer.analyzeSession(words, attempts);
  }

  enrichDocumentCandidates(input: {
    markdown: string;
    candidates: DocumentVocabCandidate[];
    targetLang: string;
    nativeLang: string;
    llmReview: boolean;
  }): Promise<DocumentVocabCandidate[]> {
    return this.candidateEnricher.enrichDocumentCandidates(input);
  }
}
