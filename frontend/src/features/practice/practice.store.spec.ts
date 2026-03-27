import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePracticeStore } from './practice.store';
import {
  completePractice,
  startPractice,
  submitAnswer,
} from '../../shared/api';

vi.mock('../../shared/api', () => ({
  completePractice: vi.fn(),
  startPractice: vi.fn(),
  submitAnswer: vi.fn(),
}));

const mockStartPractice = vi.mocked(startPractice);
const mockSubmitAnswer = vi.mocked(submitAnswer);
const mockCompletePractice = vi.mocked(completePractice);

describe('usePracticeStore', () => {
  beforeEach(() => {
    usePracticeStore.setState({
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
    });
    vi.clearAllMocks();
  });

  it('start() enters practicing state with session data', async () => {
    const exercises = [
      {
        vocabularyId: 'w1',
        word: 'hello',
        exerciseType: 'spelling' as const,
        prompt: 'Spell hello',
        correctAnswer: 'hello',
      },
    ];
    mockStartPractice.mockResolvedValue({ sessionId: 'session-1', exercises });

    await usePracticeStore.getState().start('en', 'ru');

    expect(usePracticeStore.getState().phase).toBe('practicing');
    expect(usePracticeStore.getState().sessionId).toBe('session-1');
    expect(usePracticeStore.getState().currentExercise).toEqual(exercises[0]);
    expect(usePracticeStore.getState().isLastExercise).toBe(true);
  });

  it('answer() stores the last answer and moves to reviewing', async () => {
    usePracticeStore.setState({
      phase: 'practicing',
      sessionId: 'session-1',
      exercises: [
        {
          vocabularyId: 'w1',
          word: 'hello',
          exerciseType: 'spelling',
          prompt: 'Spell hello',
          correctAnswer: 'hello',
        },
      ],
      currentIndex: 0,
      currentExercise: {
        vocabularyId: 'w1',
        word: 'hello',
        exerciseType: 'spelling',
        prompt: 'Spell hello',
        correctAnswer: 'hello',
      },
      isLastExercise: true,
    });
    mockSubmitAnswer.mockResolvedValue({
      isCorrect: true,
      errorPosition: null,
      qualityRating: 5,
    });

    await usePracticeStore.getState().answer('hello');

    expect(usePracticeStore.getState().phase).toBe('reviewing');
    expect(usePracticeStore.getState().lastAnswer).toEqual({
      isCorrect: true,
      errorPosition: null,
      qualityRating: 5,
    });
    expect(usePracticeStore.getState().answers).toHaveLength(1);
  });

  it('next() advances to the next exercise', () => {
    usePracticeStore.setState({
      phase: 'reviewing',
      exercises: [
        {
          vocabularyId: 'w1',
          word: 'hello',
          exerciseType: 'spelling',
          prompt: 'Spell hello',
          correctAnswer: 'hello',
        },
        {
          vocabularyId: 'w2',
          word: 'world',
          exerciseType: 'spelling',
          prompt: 'Spell world',
          correctAnswer: 'world',
        },
      ],
      currentIndex: 0,
      currentExercise: {
        vocabularyId: 'w1',
        word: 'hello',
        exerciseType: 'spelling',
        prompt: 'Spell hello',
        correctAnswer: 'hello',
      },
      isLastExercise: false,
      lastAnswer: { isCorrect: true, errorPosition: null, qualityRating: 5 },
    });

    usePracticeStore.getState().next();

    expect(usePracticeStore.getState().phase).toBe('practicing');
    expect(usePracticeStore.getState().currentIndex).toBe(1);
    expect(usePracticeStore.getState().currentExercise?.word).toBe('world');
    expect(usePracticeStore.getState().lastAnswer).toBeNull();
    expect(usePracticeStore.getState().isLastExercise).toBe(true);
  });

  it('complete() stores analysis and moves to complete', async () => {
    usePracticeStore.setState({
      phase: 'reviewing',
      sessionId: 'session-1',
    });
    mockCompletePractice.mockResolvedValue({
      sessionId: 'session-1',
      overallScore: 100,
      summary: 'Great job',
      totalExercises: 1,
      correctCount: 1,
      wordAnalyses: [],
    });

    await usePracticeStore.getState().complete();

    expect(usePracticeStore.getState().phase).toBe('complete');
    expect(usePracticeStore.getState().analysis?.overallScore).toBe(100);
  });

  it('reset() restores idle state', () => {
    usePracticeStore.setState({
      phase: 'complete',
      sessionId: 'session-1',
      exercises: [
        {
          vocabularyId: 'w1',
          word: 'hello',
          exerciseType: 'spelling',
          prompt: 'Spell hello',
          correctAnswer: 'hello',
        },
      ],
      currentIndex: 0,
      answers: [{ isCorrect: true, errorPosition: null, qualityRating: 5 }],
      lastAnswer: { isCorrect: true, errorPosition: null, qualityRating: 5 },
      analysis: {
        sessionId: 'session-1',
        overallScore: 100,
        summary: 'Great job',
        totalExercises: 1,
        correctCount: 1,
        wordAnalyses: [],
      },
      error: null,
      currentExercise: {
        vocabularyId: 'w1',
        word: 'hello',
        exerciseType: 'spelling',
        prompt: 'Spell hello',
        correctAnswer: 'hello',
      },
      isLastExercise: true,
    });

    usePracticeStore.getState().reset();

    expect(usePracticeStore.getState().phase).toBe('idle');
    expect(usePracticeStore.getState().sessionId).toBeNull();
    expect(usePracticeStore.getState().exercises).toEqual([]);
    expect(usePracticeStore.getState().currentExercise).toBeNull();
  });
});
