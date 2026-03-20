import { renderHook, act } from '@testing-library/react';
import { usePractice } from './usePractice';
import * as api from '../model/api';

vi.mock('../model/api');

describe('usePractice', () => {
  beforeEach(() => {
    vi.mocked(api.startPractice).mockResolvedValue({
      sessionId: 'sess-1',
      exercises: [
        {
          vocabularyId: 'v1',
          word: 'test',
          exerciseType: 'spelling',
          prompt: 'Translate: тест',
          correctAnswer: 'test',
        },
      ],
    });
    vi.mocked(api.submitAnswer).mockResolvedValue({
      isCorrect: true,
      errorPosition: null,
      qualityRating: 5,
    });
    vi.mocked(api.completePractice).mockResolvedValue({
      sessionId: 'sess-1',
      overallScore: 100,
      summary: 'Perfect!',
      totalExercises: 1,
      correctCount: 1,
      wordAnalyses: [],
    });
  });

  it('starts in idle phase', () => {
    const { result } = renderHook(() => usePractice());

    expect(result.current.phase).toBe('idle');
    expect(result.current.currentExercise).toBeNull();
  });

  it('starts a practice session', async () => {
    const { result } = renderHook(() => usePractice());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.phase).toBe('practicing');
    expect(result.current.sessionId).toBe('sess-1');
    expect(result.current.exercises).toHaveLength(1);
    expect(result.current.currentExercise).not.toBeNull();
  });

  it('submits an answer and moves to reviewing', async () => {
    const { result } = renderHook(() => usePractice());

    await act(async () => {
      await result.current.start();
    });

    await act(async () => {
      await result.current.answer('test');
    });

    expect(result.current.phase).toBe('reviewing');
    expect(result.current.lastAnswer).not.toBeNull();
    expect(result.current.lastAnswer!.isCorrect).toBe(true);
  });

  it('completes a session', async () => {
    const { result } = renderHook(() => usePractice());

    await act(async () => {
      await result.current.start();
    });
    await act(async () => {
      await result.current.answer('test');
    });
    await act(async () => {
      await result.current.complete();
    });

    expect(result.current.phase).toBe('complete');
    expect(result.current.analysis).not.toBeNull();
    expect(result.current.analysis!.overallScore).toBe(100);
  });

  it('resets back to idle', async () => {
    const { result } = renderHook(() => usePractice());

    await act(async () => {
      await result.current.start();
    });
    act(() => {
      result.current.reset();
    });

    expect(result.current.phase).toBe('idle');
    expect(result.current.exercises).toHaveLength(0);
  });

  it('handles start error', async () => {
    vi.mocked(api.startPractice).mockRejectedValue(new Error('No words'));

    const { result } = renderHook(() => usePractice());

    await act(async () => {
      await result.current.start();
    });

    expect(result.current.phase).toBe('error');
    expect(result.current.error).toBe('No words');
  });
});
