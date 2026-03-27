import { create } from 'zustand';
import { completePractice, startPractice, submitAnswer } from '../../shared/api';
import type { AnswerResult, Exercise, SessionAnalysis } from '../../shared/types';

export type PracticePhase =
  | 'idle'
  | 'loading'
  | 'practicing'
  | 'submitting'
  | 'reviewing'
  | 'analyzing'
  | 'complete'
  | 'error';

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
}

interface PracticeActions {
  start(targetLang?: string, nativeLang?: string, wordLimit?: number): Promise<void>;
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
};

function deriveState(state: Pick<PracticeState, 'exercises' | 'currentIndex'>) {
  return {
    currentExercise: state.exercises[state.currentIndex] ?? null,
    isLastExercise: state.currentIndex >= state.exercises.length - 1,
  };
}

export const usePracticeStore = create<PracticeStore>((set, get) => ({
  ...initialState,

  async start(targetLang, nativeLang, wordLimit) {
    set({
      phase: 'loading',
      error: null,
    });

    try {
      const result = await startPractice({ targetLang, nativeLang, wordLimit });
      set({
        phase: 'practicing',
        sessionId: result.sessionId,
        exercises: result.exercises,
        currentIndex: 0,
        answers: [],
        lastAnswer: null,
        analysis: null,
        error: null,
        ...deriveState({ exercises: result.exercises, currentIndex: 0 }),
      });
    } catch (error) {
      set({
        phase: 'error',
        error: error instanceof Error ? error.message : 'Failed to start practice',
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
      }));
    } catch (error) {
      set({
        phase: 'error',
        error: error instanceof Error ? error.message : 'Failed to submit answer',
      });
    }
  },

  next() {
    set((state) => {
      const currentIndex = state.currentIndex + 1;

      return {
        currentIndex,
        lastAnswer: null,
        phase: 'practicing',
        ...deriveState({ exercises: state.exercises, currentIndex }),
      };
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
