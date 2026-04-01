import type { ExerciseType } from '../../domain/entities/exercise-attempt.entity';
import type { PracticeBatchMode } from '@ocr-app/shared';

export type { PracticeBatchMode };

export interface StartPracticeInput {
  targetLang?: string;
  nativeLang?: string;
  wordLimit?: number;
}

export interface PracticePreviewWordOutput {
  id: string;
  word: string;
  translation: string;
  contextSentence: string;
  attemptCount: number;
  incorrectCount: number;
}

export interface PracticePlanInput {
  targetLang?: string;
  nativeLang?: string;
  wordLimit?: number;
}

export interface PracticePlanOutput {
  sessionId: string;
  batchSize: number;
  initialBatchMode: Exclude<PracticeBatchMode, 'retry'>;
  allWords: PracticePreviewWordOutput[];
  previewWords: PracticePreviewWordOutput[];
}

export interface GeneratePracticeRoundInput {
  sessionId: string;
  vocabularyIds: string[];
}

export interface GeneratePracticeRoundOutput {
  exercises: ExerciseOutput[];
}

export interface SubmitAnswerInput {
  sessionId: string;
  vocabularyId: string;
  exerciseType: ExerciseType;
  prompt: string;
  correctAnswer: string;
  userAnswer: string;
}

export interface ExerciseOutput {
  vocabularyId: string;
  word: string;
  exerciseType: ExerciseType;
  prompt: string;
  correctAnswer: string;
  options?: string[];
}

export interface SubmitAnswerOutput {
  isCorrect: boolean;
  errorPosition: string | null;
  qualityRating: number;
}

export interface SessionAnalysisOutput {
  sessionId: string;
  overallScore: number;
  summary: string;
  totalExercises: number;
  correctCount: number;
  wordAnalyses: Array<{
    vocabularyId: string;
    word: string;
    errorPattern: string;
    mnemonicSentence: string;
    difficultyAssessment: string;
    suggestedFocus: string;
  }>;
}
