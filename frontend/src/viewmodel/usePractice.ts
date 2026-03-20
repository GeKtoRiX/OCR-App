import { useState, useCallback } from 'react';
import type { Exercise, AnswerResult, SessionAnalysis } from '../model/types';
import { startPractice, submitAnswer, completePractice } from '../model/api';

export type PracticePhase =
  | 'idle'
  | 'loading'
  | 'practicing'
  | 'submitting'
  | 'reviewing'
  | 'analyzing'
  | 'complete'
  | 'error';

export function usePractice() {
  const [phase, setPhase] = useState<PracticePhase>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerResult[]>([]);
  const [lastAnswer, setLastAnswer] = useState<AnswerResult | null>(null);
  const [analysis, setAnalysis] = useState<SessionAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(
    async (targetLang?: string, nativeLang?: string, wordLimit?: number) => {
      setPhase('loading');
      setError(null);
      try {
        const result = await startPractice({ targetLang, nativeLang, wordLimit });
        setSessionId(result.sessionId);
        setExercises(result.exercises);
        setCurrentIndex(0);
        setAnswers([]);
        setLastAnswer(null);
        setAnalysis(null);
        setPhase('practicing');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to start practice');
        setPhase('error');
      }
    },
    [],
  );

  const answer = useCallback(
    async (userAnswer: string) => {
      if (!sessionId || !exercises[currentIndex]) return;
      const exercise = exercises[currentIndex];
      setPhase('submitting');
      try {
        const result = await submitAnswer({
          sessionId,
          vocabularyId: exercise.vocabularyId,
          exerciseType: exercise.exerciseType,
          prompt: exercise.prompt,
          correctAnswer: exercise.correctAnswer,
          userAnswer,
        });
        setAnswers((prev) => [...prev, result]);
        setLastAnswer(result);
        setPhase('reviewing');
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to submit answer');
        setPhase('error');
      }
    },
    [sessionId, exercises, currentIndex],
  );

  const next = useCallback(() => {
    setCurrentIndex((i) => i + 1);
    setLastAnswer(null);
    setPhase('practicing');
  }, []);

  const complete = useCallback(async () => {
    if (!sessionId) return;
    setPhase('analyzing');
    try {
      const result = await completePractice(sessionId);
      setAnalysis(result);
      setPhase('complete');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to complete session');
      setPhase('error');
    }
  }, [sessionId]);

  const reset = useCallback(() => {
    setPhase('idle');
    setSessionId(null);
    setExercises([]);
    setCurrentIndex(0);
    setAnswers([]);
    setLastAnswer(null);
    setAnalysis(null);
    setError(null);
  }, []);

  const currentExercise = exercises[currentIndex] ?? null;
  const isLastExercise = currentIndex >= exercises.length - 1;

  return {
    phase,
    sessionId,
    exercises,
    currentIndex,
    currentExercise,
    answers,
    lastAnswer,
    analysis,
    error,
    isLastExercise,
    start,
    answer,
    next,
    complete,
    reset,
  };
}
