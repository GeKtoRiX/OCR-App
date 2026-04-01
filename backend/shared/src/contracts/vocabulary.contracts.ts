import type { ExerciseType } from '../domain/entities/exercise-attempt.entity';
import type { VocabType } from '../domain/entities/vocabulary-word.entity';

export const VOCABULARY_PATTERNS = {
  ADD: 'vocabulary.add',
  ADD_MANY: 'vocabulary.add_many',
  FIND_ALL: 'vocabulary.find_all',
  FIND_BY_ID: 'vocabulary.find_by_id',
  FIND_BY_IDS: 'vocabulary.find_by_ids',
  FIND_BY_WORD: 'vocabulary.find_by_word',
  FIND_DUE: 'vocabulary.find_due',
  UPDATE: 'vocabulary.update',
  DELETE: 'vocabulary.delete',
  PRACTICE_START: 'vocabulary.practice_start',
  PRACTICE_ANSWER: 'vocabulary.practice_answer',
  PRACTICE_COMPLETE: 'vocabulary.practice_complete',
  PRACTICE_SESSIONS: 'vocabulary.practice_sessions',
  PRACTICE_STATS: 'vocabulary.practice_stats',
} as const;

export interface VocabularyItemDto {
  id: string;
  word: string;
  vocabType: VocabType;
  translation: string;
  targetLang: string;
  nativeLang: string;
  contextSentence: string;
  sourceDocumentId: string | null;
  intervalDays: number;
  easinessFactor: number;
  repetitions: number;
  nextReviewAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AddVocabularyPayload {
  word: string;
  vocabType: VocabType;
  translation: string;
  targetLang: string;
  nativeLang: string;
  contextSentence: string;
  sourceDocumentId?: string;
}

export interface FindVocabularyByIdPayload {
  id: string;
}

export interface FindVocabularyByIdsPayload {
  ids: string[];
}

export interface FindVocabularyByWordPayload {
  word: string;
  targetLang: string;
  nativeLang: string;
}

export interface FindDueVocabularyPayload {
  limit?: number;
  targetLang?: string;
  nativeLang?: string;
}

export interface FindAllVocabularyPayload {
  targetLang?: string;
  nativeLang?: string;
}

export interface UpdateVocabularyPayload {
  id: string;
  word?: string;
  translation: string;
  contextSentence: string;
}

export interface DeleteVocabularyPayload {
  id: string;
}

export interface StartPracticePayload {
  targetLang?: string;
  nativeLang?: string;
  wordLimit?: number;
}

export interface ExerciseDto {
  vocabularyId: string;
  word: string;
  exerciseType: ExerciseType;
  prompt: string;
  correctAnswer: string;
  options?: string[];
}

export interface StartPracticeResponse {
  sessionId: string;
  exercises: ExerciseDto[];
}

export interface SubmitPracticeAnswerPayload {
  sessionId: string;
  vocabularyId: string;
  exerciseType: ExerciseType;
  prompt: string;
  correctAnswer: string;
  userAnswer: string;
}

export interface SubmitPracticeAnswerResponse {
  isCorrect: boolean;
  errorPosition: string | null;
  qualityRating: number;
}

export interface CompletePracticePayload {
  sessionId: string;
}

export interface PracticeWordAnalysisDto {
  vocabularyId: string;
  word: string;
  errorPattern: string;
  mnemonicSentence: string;
  difficultyAssessment: string;
  suggestedFocus: string;
}

export interface CompletePracticeResponse {
  sessionId: string;
  overallScore: number;
  summary: string;
  totalExercises: number;
  correctCount: number;
  wordAnalyses: PracticeWordAnalysisDto[];
}

export interface PracticeSessionsPayload {
  limit?: number;
}

export interface PracticeStatsPayload {
  vocabularyId: string;
}
