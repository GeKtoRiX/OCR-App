import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PracticeView } from './PracticeView';
import type { Exercise } from '../../shared/types';

const baseExercise: Exercise = {
  vocabularyId: 'word-1',
  word: 'hello',
  exerciseType: 'spelling',
  prompt: 'Spell hello',
  correctAnswer: 'hello',
};

const baseProps = {
  phase: 'practicing' as const,
  currentExercise: baseExercise,
  currentIndex: 0,
  totalExercises: 3,
  lastAnswer: null,
  isLastExercise: false,
  analysis: null,
  error: null,
  previewWords: [],
  currentBatchMode: 'unseen' as const,
  hasRecordedAnswers: false,
  onAnswer: vi.fn(),
  onReady: vi.fn(),
  onNext: vi.fn(),
  onComplete: vi.fn(),
  onReset: vi.fn(),
};

describe('PracticeView', () => {
  it('renders planning state', () => {
    render(<PracticeView {...baseProps} phase="planning" />);

    expect(screen.getByText('Preparing your study batch...')).toBeInTheDocument();
  });

  it('renders round loading state', () => {
    render(<PracticeView {...baseProps} phase="loading_round" />);

    expect(screen.getByText('Generating exercises...')).toBeInTheDocument();
  });

  it('renders analyzing state', () => {
    render(<PracticeView {...baseProps} phase="analyzing" />);

    expect(screen.getByText('Analyzing your session...')).toBeInTheDocument();
  });

  it('renders error state and calls onReset', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(<PracticeView {...baseProps} phase="error" error="Failed to start" onReset={onReset} />);

    expect(screen.getByText('Failed to start')).toBeInTheDocument();
    await user.click(screen.getByText('Back'));

    expect(onReset).toHaveBeenCalled();
  });

  it('renders a preview batch and starts on ready', async () => {
    const user = userEvent.setup();
    const onReady = vi.fn();
    render(
      <PracticeView
        {...baseProps}
        phase="preview"
        previewWords={[
          {
            id: 'word-1',
            word: 'hello',
            translation: 'привет',
            contextSentence: 'Hello there.',
            attemptCount: 2,
            incorrectCount: 1,
          },
        ]}
        onReady={onReady}
      />,
    );

    expect(screen.getByText('Words In This Batch')).toBeInTheDocument();
    expect(screen.getByText('hello')).toBeInTheDocument();
    await user.click(screen.getByText('Ready'));

    expect(onReady).toHaveBeenCalled();
  });

  it('submits a text answer in practicing mode', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    render(<PracticeView {...baseProps} onAnswer={onAnswer} />);

    const input = screen.getByPlaceholderText('Type your answer...');
    const submit = screen.getByText('Submit');

    expect(submit).toBeDisabled();

    await user.type(input, 'hello');
    await user.click(submit);

    expect(onAnswer).toHaveBeenCalledWith('hello');
  });

  it('renders multiple choice options and submits selected option', async () => {
    const user = userEvent.setup();
    const onAnswer = vi.fn();
    render(
      <PracticeView
        {...baseProps}
        onAnswer={onAnswer}
        currentExercise={{
          ...baseExercise,
          exerciseType: 'multiple_choice',
          options: ['hello', 'world', 'test'],
        }}
      />,
    );

    await user.click(screen.getByText('world'));

    expect(onAnswer).toHaveBeenCalledWith('world');
  });

  it('does not duplicate multiple choice options inside the prompt area', () => {
    render(
      <PracticeView
        {...baseProps}
        currentExercise={{
          ...baseExercise,
          exerciseType: 'multiple_choice',
          prompt: 'Which word means "hello"?\nOptions:\nA. hello\nB. world\nC. test',
          options: ['hello', 'world', 'test'],
        }}
      />,
    );

    expect(screen.getByText('Which word means "hello"?')).toBeInTheDocument();
    expect(screen.queryByText('Options:')).not.toBeInTheDocument();
    expect(screen.getAllByText('hello')).toHaveLength(1);
    expect(screen.getAllByText('world')).toHaveLength(1);
    expect(screen.getAllByText('test')).toHaveLength(1);
  });

  it('renders review feedback and advances to next exercise', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(
      <PracticeView
        {...baseProps}
        phase="reviewing"
        lastAnswer={{ isCorrect: false, errorPosition: '2', qualityRating: 2 }}
        onNext={onNext}
      />,
    );

    expect(screen.getByText('Incorrect')).toBeInTheDocument();
    expect(screen.getByText(/Correct answer:/)).toBeInTheDocument();
    await user.click(screen.getByText('Next'));

    expect(onNext).toHaveBeenCalled();
  });

  it('renders analysis state and finishes the session', async () => {
    const user = userEvent.setup();
    const onReset = vi.fn();
    render(
      <PracticeView
        {...baseProps}
        phase="complete"
        analysis={{
          sessionId: 'session-1',
          overallScore: 90,
          summary: 'Solid result',
          totalExercises: 10,
          correctCount: 9,
          wordAnalyses: [{
            vocabularyId: 'word-1',
            word: 'hello',
            errorPattern: 'Dropped one letter',
            mnemonicSentence: 'Say hello to every letter.',
            difficultyAssessment: 'medium',
            suggestedFocus: 'Double-check spelling',
          }],
        }}
        onReset={onReset}
      />,
    );

    expect(screen.getByText('Session Complete')).toBeInTheDocument();
    expect(screen.getByText('90%')).toBeInTheDocument();
    expect(screen.getByText('Solid result')).toBeInTheDocument();
    await user.click(screen.getByText('Done'));

    expect(onReset).toHaveBeenCalled();
  });

  it('continues after the last reviewed exercise so the store can choose the next batch', async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    render(
      <PracticeView
        {...baseProps}
        phase="reviewing"
        isLastExercise
        lastAnswer={{ isCorrect: true, errorPosition: null, qualityRating: 5 }}
        onNext={onNext}
      />,
    );

    await user.click(screen.getByText('Continue'));

    expect(onNext).toHaveBeenCalled();
  });

  it('allows finishing and analyzing from review when the session already has answers', async () => {
    const user = userEvent.setup();
    const onComplete = vi.fn();
    render(
      <PracticeView
        {...baseProps}
        phase="reviewing"
        isLastExercise
        hasRecordedAnswers
        lastAnswer={{ isCorrect: true, errorPosition: null, qualityRating: 5 }}
        onComplete={onComplete}
      />,
    );

    await user.click(screen.getByText('Finish & Analyze'));

    expect(onComplete).toHaveBeenCalled();
  });
});
