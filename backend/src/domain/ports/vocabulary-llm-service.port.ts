import { VocabularyWord } from '../entities/vocabulary-word.entity';
import { ExerciseAttempt } from '../entities/exercise-attempt.entity';
import { DocumentVocabCandidate } from '../entities/document-vocab-candidate.entity';

export interface GeneratedExercise {
  vocabularyId: string;
  word: string;
  exerciseType: 'fill_blank' | 'spelling' | 'context_sentence' | 'multiple_choice';
  prompt: string;
  correctAnswer: string;
  options?: string[];
}

export interface WordAnalysis {
  vocabularyId: string;
  word: string;
  errorPattern: string;
  mnemonicSentence: string;
  difficultyAssessment: 'easy' | 'medium' | 'hard';
  suggestedFocus: string;
}

export interface SessionAnalysis {
  overallScore: number;
  summary: string;
  wordAnalyses: WordAnalysis[];
}

export abstract class IVocabularyLlmService {
  abstract generateExercises(
    words: VocabularyWord[],
    count: number,
  ): Promise<GeneratedExercise[]>;
  abstract analyzeSession(
    words: VocabularyWord[],
    attempts: ExerciseAttempt[],
  ): Promise<SessionAnalysis>;
  abstract enrichDocumentCandidates(input: {
    markdown: string;
    candidates: DocumentVocabCandidate[];
    targetLang: string;
    nativeLang: string;
    llmReview: boolean;
  }): Promise<DocumentVocabCandidate[]>;
}
