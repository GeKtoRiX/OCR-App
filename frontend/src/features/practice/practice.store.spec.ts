import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePracticeStore } from './practice.store';
import {
  completePractice,
  generatePracticeRound,
  planPractice,
  submitAnswer,
} from '../../shared/api';

vi.mock('../../shared/api', () => ({
  completePractice: vi.fn(),
  generatePracticeRound: vi.fn(),
  planPractice: vi.fn(),
  submitAnswer: vi.fn(),
}));

const mockPlanPractice = vi.mocked(planPractice);
const mockGeneratePracticeRound = vi.mocked(generatePracticeRound);
const mockSubmitAnswer = vi.mocked(submitAnswer);
const mockCompletePractice = vi.mocked(completePractice);

const previewWords = [
  {
    id: 'w1',
    word: 'hello',
    translation: 'привет',
    contextSentence: 'Hello there.',
    attemptCount: 0,
    incorrectCount: 0,
  },
  {
    id: 'w2',
    word: 'world',
    translation: 'мир',
    contextSentence: 'World peace.',
    attemptCount: 0,
    incorrectCount: 0,
  },
];

const roundExercises = [
  {
    vocabularyId: 'w1',
    word: 'hello',
    exerciseType: 'multiple_choice' as const,
    prompt: 'Choose the word that best completes the sentence.\n___ there.',
    correctAnswer: 'hello',
    options: ['world', 'hello', 'test', 'help'],
  },
  {
    vocabularyId: 'w1',
    word: 'hello',
    exerciseType: 'spelling' as const,
    prompt: 'Type the en word for "привет".',
    correctAnswer: 'hello',
  },
  {
    vocabularyId: 'w1',
    word: 'hello',
    exerciseType: 'context_sentence' as const,
    prompt: 'Type the en word that matches this meaning.\nTranslation: "привет"\nContext: [...] there.',
    correctAnswer: 'hello',
  },
  {
    vocabularyId: 'w1',
    word: 'hello',
    exerciseType: 'fill_blank' as const,
    prompt: 'Fill in the blank with the missing word.\n___ there.',
    correctAnswer: 'hello',
  },
  {
    vocabularyId: 'w2',
    word: 'world',
    exerciseType: 'multiple_choice' as const,
    prompt: 'Choose the word that best completes the sentence.\n___ peace.',
    correctAnswer: 'world',
    options: ['word', 'world', 'hello', 'wild'],
  },
  {
    vocabularyId: 'w2',
    word: 'world',
    exerciseType: 'spelling' as const,
    prompt: 'Type the en word for "мир".',
    correctAnswer: 'world',
  },
  {
    vocabularyId: 'w2',
    word: 'world',
    exerciseType: 'context_sentence' as const,
    prompt: 'Type the en word that matches this meaning.\nTranslation: "мир"\nContext: [...] peace.',
    correctAnswer: 'world',
  },
  {
    vocabularyId: 'w2',
    word: 'world',
    exerciseType: 'fill_blank' as const,
    prompt: 'Fill in the blank with the missing word.\n___ peace.',
    correctAnswer: 'world',
  },
];

describe('usePracticeStore', () => {
  beforeEach(() => {
    usePracticeStore.getState().reset();
    vi.clearAllMocks();
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
  });

  it('start() enters preview state with planned batch data', async () => {
    mockPlanPractice.mockResolvedValue({
      sessionId: 'session-1',
      batchSize: 10,
      initialBatchMode: 'unseen',
      allWords: previewWords,
      previewWords: [previewWords[0]],
    });

    await usePracticeStore.getState().start('en', 'ru');

    expect(usePracticeStore.getState().phase).toBe('preview');
    expect(usePracticeStore.getState().sessionId).toBe('session-1');
    expect(usePracticeStore.getState().previewWords).toEqual([previewWords[0]]);
    expect(usePracticeStore.getState().currentBatchMode).toBe('unseen');
  });

  it('ready() loads expanded round exercises and sets the first exercise', async () => {
    usePracticeStore.setState({
      phase: 'preview',
      sessionId: 'session-1',
      previewWords,
      currentBatchMode: 'unseen',
      allWords: previewWords,
      batchSize: 10,
      unseenCursor: 2,
      exercises: [],
      currentIndex: 0,
      answers: [],
      lastAnswer: null,
      analysis: null,
      error: null,
      currentExercise: null,
      isLastExercise: false,
      sessionIncorrectCounts: {},
      currentRoundResults: [],
    });
    mockGeneratePracticeRound.mockResolvedValue({ exercises: roundExercises });

    await usePracticeStore.getState().ready();

    expect(mockGeneratePracticeRound).toHaveBeenCalledWith({
      sessionId: 'session-1',
      vocabularyIds: ['w1', 'w2'],
    });
    expect(usePracticeStore.getState().phase).toBe('practicing');
    expect(usePracticeStore.getState().currentExercise).toEqual(roundExercises[0]);
    expect(usePracticeStore.getState().exercises).toHaveLength(8);
  });

  it('answer() stores the last answer and moves to reviewing', async () => {
    usePracticeStore.setState({
      phase: 'practicing',
      sessionId: 'session-1',
      previewWords,
      currentBatchMode: 'unseen',
      allWords: previewWords,
      batchSize: 10,
      unseenCursor: 2,
      exercises: [roundExercises[0]],
      currentIndex: 0,
      currentExercise: roundExercises[0],
      isLastExercise: true,
      answers: [],
      lastAnswer: null,
      analysis: null,
      error: null,
      sessionIncorrectCounts: {},
      currentRoundResults: [],
    });
    mockSubmitAnswer.mockResolvedValue({
      isCorrect: false,
      errorPosition: 'middle',
      qualityRating: 1,
    });

    await usePracticeStore.getState().answer('helo');

    expect(usePracticeStore.getState().phase).toBe('reviewing');
    expect(usePracticeStore.getState().lastAnswer).toEqual({
      isCorrect: false,
      errorPosition: 'middle',
      qualityRating: 1,
    });
    expect(usePracticeStore.getState().sessionIncorrectCounts.w1).toBe(1);
  });

  it('next() advances to the next exercise inside a round', () => {
    usePracticeStore.setState({
      phase: 'reviewing',
      sessionId: 'session-1',
      previewWords,
      currentBatchMode: 'unseen',
      allWords: previewWords,
      batchSize: 10,
      unseenCursor: 2,
      exercises: roundExercises,
      currentIndex: 3,
      currentExercise: roundExercises[3],
      isLastExercise: false,
      answers: [],
      lastAnswer: { isCorrect: true, errorPosition: null, qualityRating: 5 },
      analysis: null,
      error: null,
      sessionIncorrectCounts: {},
      currentRoundResults: [{ vocabularyId: 'w1', isCorrect: true }],
    });

    usePracticeStore.getState().next();

    expect(usePracticeStore.getState().phase).toBe('practicing');
    expect(usePracticeStore.getState().currentIndex).toBe(4);
    expect(usePracticeStore.getState().currentExercise?.word).toBe('world');
  });

  it('next() creates a retry preview when the round had errors', () => {
    usePracticeStore.setState({
      phase: 'reviewing',
      sessionId: 'session-1',
      previewWords,
      currentBatchMode: 'unseen',
      allWords: previewWords,
      batchSize: 10,
      unseenCursor: 2,
      exercises: roundExercises,
      currentIndex: 7,
      currentExercise: roundExercises[7],
      isLastExercise: true,
      answers: [],
      lastAnswer: { isCorrect: false, errorPosition: 'middle', qualityRating: 1 },
      analysis: null,
      error: null,
      sessionIncorrectCounts: { w2: 1 },
      currentRoundResults: [
        { vocabularyId: 'w1', isCorrect: true },
        { vocabularyId: 'w2', isCorrect: false },
      ],
    });

    usePracticeStore.getState().next();

    expect(usePracticeStore.getState().phase).toBe('preview');
    expect(usePracticeStore.getState().currentBatchMode).toBe('retry');
    expect(usePracticeStore.getState().previewWords.map((word) => word.id)).toEqual(['w2']);
  });

  it('next() advances to the next unseen batch after a clean round', () => {
    const allWords = [
      ...previewWords,
      {
        id: 'w3',
        word: 'sun',
        translation: 'солнце',
        contextSentence: 'The sun is bright.',
        attemptCount: 0,
        incorrectCount: 0,
      },
    ];
    usePracticeStore.setState({
      phase: 'reviewing',
      sessionId: 'session-1',
      previewWords,
      currentBatchMode: 'unseen',
      allWords,
      batchSize: 2,
      unseenCursor: 2,
      exercises: roundExercises,
      currentIndex: 7,
      currentExercise: roundExercises[7],
      isLastExercise: true,
      answers: [],
      lastAnswer: { isCorrect: true, errorPosition: null, qualityRating: 5 },
      analysis: null,
      error: null,
      sessionIncorrectCounts: {},
      currentRoundResults: [
        { vocabularyId: 'w1', isCorrect: true },
        { vocabularyId: 'w2', isCorrect: true },
      ],
    });

    usePracticeStore.getState().next();

    expect(usePracticeStore.getState().phase).toBe('preview');
    expect(usePracticeStore.getState().currentBatchMode).toBe('unseen');
    expect(usePracticeStore.getState().previewWords.map((word) => word.id)).toEqual(['w3']);
  });

  it('next() switches to hardest words after unseen batches are exhausted', () => {
    const allWords = [
      { ...previewWords[0], attemptCount: 2, incorrectCount: 4 },
      { ...previewWords[1], attemptCount: 3, incorrectCount: 1 },
    ];
    usePracticeStore.setState({
      phase: 'reviewing',
      sessionId: 'session-1',
      previewWords: [allWords[0]],
      currentBatchMode: 'unseen',
      allWords,
      batchSize: 2,
      unseenCursor: 0,
      exercises: [roundExercises[0]],
      currentIndex: 0,
      currentExercise: roundExercises[0],
      isLastExercise: true,
      answers: [],
      lastAnswer: { isCorrect: true, errorPosition: null, qualityRating: 5 },
      analysis: null,
      error: null,
      sessionIncorrectCounts: {},
      currentRoundResults: [{ vocabularyId: 'w1', isCorrect: true }],
    });

    usePracticeStore.getState().next();

    expect(usePracticeStore.getState().phase).toBe('preview');
    expect(usePracticeStore.getState().currentBatchMode).toBe('hardest');
    expect(usePracticeStore.getState().previewWords[0].id).toBe('w1');
  });

  it('complete() stores analysis and moves to complete', async () => {
    usePracticeStore.setState({
      phase: 'reviewing',
      sessionId: 'session-1',
      answers: [{ isCorrect: true, errorPosition: null, qualityRating: 5 }],
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
      previewWords,
      allWords: previewWords,
      currentBatchMode: 'hardest',
      batchSize: 10,
      unseenCursor: 2,
      exercises: roundExercises,
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
      currentExercise: roundExercises[0],
      isLastExercise: true,
      sessionIncorrectCounts: { w1: 1 },
      currentRoundResults: [{ vocabularyId: 'w1', isCorrect: true }],
    });

    usePracticeStore.getState().reset();

    expect(usePracticeStore.getState().phase).toBe('idle');
    expect(usePracticeStore.getState().sessionId).toBeNull();
    expect(usePracticeStore.getState().exercises).toEqual([]);
    expect(usePracticeStore.getState().previewWords).toEqual([]);
  });
});
