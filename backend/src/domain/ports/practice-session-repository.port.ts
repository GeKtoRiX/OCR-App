import { PracticeSession } from '../entities/practice-session.entity';
import { ExerciseAttempt, ExerciseType, ErrorPosition } from '../entities/exercise-attempt.entity';

export interface VocabularyAttemptStats {
  vocabularyId: string;
  attemptCount: number;
  incorrectCount: number;
}

export interface GeneratedExerciseCacheKey {
  vocabularyId: string;
  contentSignature: string;
}

export interface CachedGeneratedExercise {
  exerciseType: ExerciseType;
  prompt: string;
  correctAnswer: string;
  options?: string[];
}

export interface CachedGeneratedExerciseSet {
  setId: string;
  vocabularyId: string;
  contentSignature: string;
  createdAt: string;
  exercises: CachedGeneratedExercise[];
}

export abstract class IPracticeSessionRepository {
  abstract createSession(
    targetLang: string,
    nativeLang: string,
  ): Promise<PracticeSession>;
  abstract completeSession(
    id: string,
    totalExercises: number,
    correctCount: number,
    llmAnalysis: string,
  ): Promise<PracticeSession | null>;
  abstract findSessionById(id: string): Promise<PracticeSession | null>;
  abstract findRecentSessions(limit: number): Promise<PracticeSession[]>;
  abstract createAttempt(
    sessionId: string,
    vocabularyId: string,
    exerciseType: ExerciseType,
    prompt: string,
    correctAnswer: string,
    userAnswer: string,
    isCorrect: boolean,
    errorPosition: ErrorPosition,
    qualityRating: number,
  ): Promise<ExerciseAttempt>;
  abstract findAttemptsBySession(sessionId: string): Promise<ExerciseAttempt[]>;
  abstract findAttemptsByVocabulary(
    vocabularyId: string,
  ): Promise<ExerciseAttempt[]>;
  abstract findVocabularyStats(
    vocabularyIds: string[],
  ): Promise<VocabularyAttemptStats[]>;
  abstract findGeneratedExerciseSets(
    keys: GeneratedExerciseCacheKey[],
  ): Promise<CachedGeneratedExerciseSet[]>;
  abstract saveGeneratedExerciseSet(
    vocabularyId: string,
    contentSignature: string,
    exercises: CachedGeneratedExercise[],
  ): Promise<void>;
  abstract updateAttemptMnemonic(
    attemptId: string,
    mnemonicSentence: string,
  ): Promise<void>;
}
