import type { ExerciseType } from '../../domain/entities/exercise-attempt.entity';

export interface StartPracticeInput {
  targetLang?: string;
  nativeLang?: string;
  wordLimit?: number;
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
  exerciseType: string;
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
