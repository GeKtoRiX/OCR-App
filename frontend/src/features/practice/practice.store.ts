import { create } from 'zustand';
import {
  completePractice,
  generatePracticeRound,
  planPractice,
  submitAnswer,
} from '../../shared/api';
import type {
  AnswerResult,
  Exercise,
  PracticeBatchMode,
  PracticePreviewWord,
  SessionAnalysis,
} from '../../shared/types';

const PRACTICE_BATCH_SIZE = 3;
const EXERCISE_TYPE_ORDER = ['multiple_choice', 'spelling', 'context_sentence', 'fill_blank'];

export type PracticePhase =
  | 'idle'
  | 'planning'
  | 'preview'
  | 'loading_round'
  | 'practicing'
  | 'submitting'
  | 'reviewing'
  | 'analyzing'
  | 'complete'
  | 'error';

interface RoundAnswerResult {
  vocabularyId: string;
  isCorrect: boolean;
}

interface PracticeState {
  phase: PracticePhase;
  sessionId: string | null;
  exercises: Exercise[];
  currentIndex: number;
  answers: AnswerResult[];
  lastAnswer: AnswerResult | null;
  analysis: SessionAnalysis | null;
  error: string | null;
  currentExercise: Exercise | null;
  isLastExercise: boolean;
  previewWords: PracticePreviewWord[];
  allWords: PracticePreviewWord[];
  currentBatchMode: PracticeBatchMode | null;
  batchSize: number;
  unseenCursor: number;
  sessionIncorrectCounts: Record<string, number>;
  currentRoundResults: RoundAnswerResult[];
  roundProgress: number;
}

interface PracticeActions {
  start(targetLang?: string, nativeLang?: string, wordLimit?: number): Promise<void>;
  ready(): Promise<void>;
  answer(userAnswer: string): Promise<void>;
  next(): void;
  complete(): Promise<void>;
  reset(): void;
}

export type PracticeStore = PracticeState & PracticeActions;

const initialState: PracticeState = {
  phase: 'idle',
  sessionId: null,
  exercises: [],
  currentIndex: 0,
  answers: [],
  lastAnswer: null,
  analysis: null,
  error: null,
  currentExercise: null,
  isLastExercise: false,
  previewWords: [],
  allWords: [],
  currentBatchMode: null,
  batchSize: 10,
  unseenCursor: 0,
  sessionIncorrectCounts: {},
  currentRoundResults: [],
  roundProgress: 0,
};

function deriveState(state: Pick<PracticeState, 'exercises' | 'currentIndex'>) {
  return {
    currentExercise: state.exercises[state.currentIndex] ?? null,
    isLastExercise: state.currentIndex >= state.exercises.length - 1,
  };
}

function getUnseenWords(allWords: PracticePreviewWord[]) {
  return allWords.filter((word) => word.attemptCount === 0);
}

function mapPreviewWords(
  allWords: PracticePreviewWord[],
  ids: string[],
): PracticePreviewWord[] {
  const byId = new Map(allWords.map((word) => [word.id, word]));
  return ids
    .map((id) => byId.get(id))
    .filter((word): word is PracticePreviewWord => Boolean(word));
}

function pickHardestWords(
  allWords: PracticePreviewWord[],
  sessionIncorrectCounts: Record<string, number>,
  limit: number,
): PracticePreviewWord[] {
  return [...allWords]
    .map((word) => ({
      word,
      totalIncorrectCount: word.incorrectCount + (sessionIncorrectCounts[word.id] ?? 0),
      tieBreaker: Math.random(),
    }))
    .sort((left, right) => {
      if (right.totalIncorrectCount !== left.totalIncorrectCount) {
        return right.totalIncorrectCount - left.totalIncorrectCount;
      }
      return left.tieBreaker - right.tieBreaker;
    })
    .slice(0, limit)
    .map((entry) => entry.word);
}

function resetRoundState() {
  return {
    exercises: [],
    currentIndex: 0,
    lastAnswer: null,
    currentRoundResults: [],
    ...deriveState({ exercises: [], currentIndex: 0 }),
  };
}

export const usePracticeStore = create<PracticeStore>((set, get) => ({
  ...initialState,

  async start(targetLang, nativeLang, wordLimit) {
    set({
      phase: 'planning',
      error: null,
    });

    try {
      const result = await planPractice({ targetLang, nativeLang, wordLimit });
      const initialBatchMode = result.initialBatchMode;
      const unseenCursor = initialBatchMode === 'unseen'
        ? result.previewWords.length
        : 0;

      set({
        phase: 'preview',
        sessionId: result.sessionId,
        allWords: result.allWords,
        previewWords: result.previewWords,
        currentBatchMode: initialBatchMode,
        batchSize: result.batchSize,
        unseenCursor,
        sessionIncorrectCounts: {},
        answers: [],
        analysis: null,
        error: null,
        ...resetRoundState(),
      });
    } catch (error) {
      set({
        phase: 'error',
        error: error instanceof Error ? error.message : 'Failed to start practice',
      });
    }
  },

  async ready() {
    const { sessionId, previewWords } = get();
    if (!sessionId || previewWords.length === 0) {
      return;
    }

    set({ phase: 'loading_round', roundProgress: 0, error: null, lastAnswer: null, currentRoundResults: [] });

    try {
      const ids = previewWords.map((w) => w.id);
      const batches: string[][] = [];
      for (let i = 0; i < ids.length; i += PRACTICE_BATCH_SIZE) {
        batches.push(ids.slice(i, i + PRACTICE_BATCH_SIZE));
      }

      let completed = 0;
      const batchResults = await Promise.all(
        batches.map((batchIds) =>
          generatePracticeRound({ sessionId, vocabularyIds: batchIds }).then((res) => {
            completed++;
            set({ roundProgress: Math.round((completed / batches.length) * 100) });
            return res.exercises;
          }),
        ),
      );

      const allExercises = batchResults.flat();
      const exercises = EXERCISE_TYPE_ORDER.flatMap((type) =>
        allExercises.filter((e) => e.exerciseType === type),
      );

      set({
        phase: 'practicing',
        exercises,
        roundProgress: 0,
        currentIndex: 0,
        lastAnswer: null,
        error: null,
        currentRoundResults: [],
        ...deriveState({ exercises, currentIndex: 0 }),
      });
    } catch (error) {
      set({
        phase: 'error',
        roundProgress: 0,
        error: error instanceof Error ? error.message : 'Failed to prepare practice round',
      });
    }
  },

  async answer(userAnswer) {
    const { sessionId, exercises, currentIndex } = get();
    const exercise = exercises[currentIndex];

    if (!sessionId || !exercise) {
      return;
    }

    set({ phase: 'submitting' });

    try {
      const result = await submitAnswer({
        sessionId,
        vocabularyId: exercise.vocabularyId,
        exerciseType: exercise.exerciseType,
        prompt: exercise.prompt,
        correctAnswer: exercise.correctAnswer,
        userAnswer,
      });

      set((state) => ({
        phase: 'reviewing',
        answers: [...state.answers, result],
        lastAnswer: result,
        currentRoundResults: [
          ...state.currentRoundResults,
          { vocabularyId: exercise.vocabularyId, isCorrect: result.isCorrect },
        ],
        sessionIncorrectCounts: result.isCorrect
          ? state.sessionIncorrectCounts
          : {
              ...state.sessionIncorrectCounts,
              [exercise.vocabularyId]:
                (state.sessionIncorrectCounts[exercise.vocabularyId] ?? 0) + 1,
            },
      }));
    } catch (error) {
      set({
        phase: 'error',
        error: error instanceof Error ? error.message : 'Failed to submit answer',
      });
    }
  },

  next() {
    const state = get();

    if (state.currentIndex < state.exercises.length - 1) {
      set((currentState) => {
        const currentIndex = currentState.currentIndex + 1;

        return {
          currentIndex,
          lastAnswer: null,
          phase: 'practicing',
          ...deriveState({ exercises: currentState.exercises, currentIndex }),
        };
      });
      return;
    }

    const incorrectIds = [...new Set(
      state.currentRoundResults
        .filter((item) => !item.isCorrect)
        .map((item) => item.vocabularyId),
    )];

    if (incorrectIds.length > 0) {
      set({
        phase: 'preview',
        previewWords: mapPreviewWords(state.allWords, incorrectIds),
        currentBatchMode: 'retry',
        error: null,
        ...resetRoundState(),
      });
      return;
    }

    const unseenWords = getUnseenWords(state.allWords);
    if (state.unseenCursor < unseenWords.length) {
      const nextPreviewWords = unseenWords.slice(
        state.unseenCursor,
        state.unseenCursor + state.batchSize,
      );
      set({
        phase: 'preview',
        previewWords: nextPreviewWords,
        currentBatchMode: 'unseen',
        unseenCursor: state.unseenCursor + nextPreviewWords.length,
        error: null,
        ...resetRoundState(),
      });
      return;
    }

    set({
      phase: 'preview',
      previewWords: pickHardestWords(
        state.allWords,
        state.sessionIncorrectCounts,
        state.batchSize,
      ),
      currentBatchMode: 'hardest',
      error: null,
      ...resetRoundState(),
    });
  },

  async complete() {
    const { sessionId } = get();

    if (!sessionId) {
      return;
    }

    set({ phase: 'analyzing' });

    try {
      const analysis = await completePractice(sessionId);
      set({
        phase: 'complete',
        analysis,
      });
    } catch (error) {
      set({
        phase: 'error',
        error: error instanceof Error ? error.message : 'Failed to complete session',
      });
    }
  },

  reset() {
    set(initialState);
  },
}));
