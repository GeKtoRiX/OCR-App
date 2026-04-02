import { useState, type ReactNode } from 'react';
import type {
  Exercise,
  AnswerResult,
  SessionAnalysis,
  PracticeBatchMode,
  PracticePreviewWord,
} from '../../shared/types';
import type { PracticePhase } from './practice.store';
import './PracticeView.css';

function normalizeOptionText(value: string): string {
  return value
    .trim()
    .replace(/^[A-D]\s*[\).\:-]\s*/i, '')
    .replace(/^[-*•]\s*/, '')
    .trim();
}

const PREVIEW_LABELS: Record<PracticeBatchMode, { title: string; description: string }> = {
  unseen: {
    title: 'Words In This Batch',
    description: 'Review these words before the round starts, then press Ready.',
  },
  retry: {
    title: 'Review These Words Again',
    description: 'These words had mistakes in the previous round. Review them, then continue.',
  },
  hardest: {
    title: 'Hardest Words',
    description: 'All new words are exhausted. The next round focuses on the words with the most mistakes.',
  },
};

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

function PracticeOverlay({ children }: { children: ReactNode }) {
  return (
    <div className="practice-overlay" data-testid="practice-view">
      {children}
    </div>
  );
}

function getDisplayPrompt(currentExercise: Exercise): string {
  if (
    currentExercise.exerciseType !== 'multiple_choice' ||
    !currentExercise.options ||
    currentExercise.options.length === 0
  ) {
    return currentExercise.prompt;
  }

  const optionSet = new Set(currentExercise.options.map(normalizeOptionText));
  const lines = currentExercise.prompt
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const optionHeaderIndex = lines.findIndex((line) => /^options?\s*[:\-]?$/i.test(line));
  if (optionHeaderIndex >= 0) {
    return lines.slice(0, optionHeaderIndex).join('\n').trim();
  }

  const contentLines = lines.filter((line) => !optionSet.has(normalizeOptionText(line)));
  return contentLines.join('\n').trim() || currentExercise.prompt;
}

interface Props {
  phase: PracticePhase;
  currentExercise: Exercise | null;
  currentIndex: number;
  totalExercises: number;
  lastAnswer: AnswerResult | null;
  isLastExercise: boolean;
  analysis: SessionAnalysis | null;
  error: string | null;
  previewWords: PracticePreviewWord[];
  currentBatchMode: PracticeBatchMode | null;
  hasRecordedAnswers: boolean;
  roundProgress: number;
  onAnswer: (userAnswer: string) => void;
  onReady: () => void;
  onNext: () => void;
  onComplete: () => void;
  onReset: () => void;
}

export function PracticeView({
  phase,
  currentExercise,
  currentIndex,
  totalExercises,
  lastAnswer,
  isLastExercise,
  analysis,
  error,
  previewWords,
  currentBatchMode,
  hasRecordedAnswers,
  roundProgress,
  onAnswer,
  onReady,
  onNext,
  onComplete,
  onReset,
}: Props) {
  const [userInput, setUserInput] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAnswer(userInput);
    setUserInput('');
  };

  const handleOptionClick = (option: string) => {
    onAnswer(option);
  };

  if (phase === 'planning') {
    return (
      <PracticeOverlay>
        <div className="practice-card">
          <div className="practice-card__loading">Preparing your study batch...</div>
        </div>
      </PracticeOverlay>
    );
  }

  if (phase === 'loading_round') {
    return (
      <PracticeOverlay>
        <div className="practice-card practice-card--loading">
          <div className="practice-card__spinner" />
          <div className="practice-card__loading">
            {roundProgress > 0 ? `${roundProgress}%` : 'Generating exercises…'}
          </div>
        </div>
      </PracticeOverlay>
    );
  }

  if (phase === 'preview') {
    return (
      <PracticeOverlay>
        <div className="practice-card practice-card--analysis">
          <h2 className="practice-card__title">{PREVIEW_LABELS[currentBatchMode ?? 'unseen'].title}</h2>
          <p className="practice-card__summary">{PREVIEW_LABELS[currentBatchMode ?? 'unseen'].description}</p>
          <div className="practice-card__stats">
            {previewWords.length} word{previewWords.length === 1 ? '' : 's'}
          </div>
          <div className="practice-card__analyses">
            {previewWords.map((word) => (
              <div key={word.id} className="word-analysis">
                <div className="word-analysis__header">
                  <span className="word-analysis__word">{word.word}</span>
                  <span className="word-analysis__diff word-analysis__diff--medium">
                    {word.translation || 'No translation'}
                  </span>
                </div>
                {word.contextSentence && (
                  <div className="word-analysis__row">
                    <strong>Context:</strong> {word.contextSentence}
                  </div>
                )}
                <div className="word-analysis__row">
                  <strong>History:</strong> {plural(word.incorrectCount, 'error')} in {plural(word.attemptCount, 'attempt')}
                </div>
              </div>
            ))}
          </div>
          <div className="practice-card__feedback">
            <button className="practice-card__btn" onClick={onReady}>
              Ready
            </button>
            {hasRecordedAnswers && (
              <button className="practice-card__btn" onClick={onComplete}>
                Finish &amp; Analyze
              </button>
            )}
          </div>
          <button className="practice-card__close" onClick={onReset}>
            Exit
          </button>
        </div>
      </PracticeOverlay>
    );
  }

  if (phase === 'analyzing') {
    return (
      <PracticeOverlay>
        <div className="practice-card">
          <div className="practice-card__loading">Analyzing your session...</div>
        </div>
      </PracticeOverlay>
    );
  }

  if (phase === 'error') {
    return (
      <PracticeOverlay>
        <div className="practice-card">
          <div className="practice-card__error">{error}</div>
          <button className="practice-card__btn" onClick={onReset}>
            Back
          </button>
        </div>
      </PracticeOverlay>
    );
  }

  if (phase === 'complete' && analysis) {
    return (
      <PracticeOverlay>
        <div className="practice-card practice-card--analysis">
          <h2 className="practice-card__title">Session Complete</h2>
          <div className="practice-card__score">
            {analysis.overallScore}%
          </div>
          <div className="practice-card__stats">
            {analysis.correctCount}/{analysis.totalExercises} correct
          </div>
          <p className="practice-card__summary">{analysis.summary}</p>

          {analysis.wordAnalyses.length > 0 && (
            <div className="practice-card__analyses">
              {analysis.wordAnalyses.map((wa, i) => (
                <div key={i} className="word-analysis">
                  <div className="word-analysis__header">
                    <span className="word-analysis__word">{wa.word}</span>
                    <span
                      className={`word-analysis__diff word-analysis__diff--${wa.difficultyAssessment}`}
                    >
                      {wa.difficultyAssessment}
                    </span>
                  </div>
                  {wa.errorPattern && (
                    <div className="word-analysis__row">
                      <strong>Error:</strong> {wa.errorPattern}
                    </div>
                  )}
                  <div className="word-analysis__row">
                    <strong>Mnemonic:</strong> {wa.mnemonicSentence}
                  </div>
                  <div className="word-analysis__row">
                    <strong>Focus:</strong> {wa.suggestedFocus}
                  </div>
                </div>
              ))}
            </div>
          )}

          <button className="practice-card__btn" onClick={onReset}>
            Done
          </button>
        </div>
      </PracticeOverlay>
    );
  }

  if (!currentExercise) return null;

  const displayPrompt = getDisplayPrompt(currentExercise);

  return (
    <PracticeOverlay>
      <div className="practice-card">
        <div className="practice-card__progress">
          <div
            className="practice-card__progress-bar"
            style={{
              width: `${((currentIndex + 1) / totalExercises) * 100}%`,
            }}
          />
        </div>
        <div className="practice-card__counter">
          {currentIndex + 1} / {totalExercises}
        </div>

        <div className="practice-card__type">
          {currentExercise.exerciseType.replace('_', ' ')}
        </div>
        <div className="practice-card__prompt">{displayPrompt}</div>

        {phase === 'reviewing' && lastAnswer ? (
          <div className="practice-card__feedback">
            <div
              className={`practice-card__result ${
                lastAnswer.isCorrect
                  ? 'practice-card__result--correct'
                  : 'practice-card__result--wrong'
              }`}
            >
              {lastAnswer.isCorrect ? 'Correct!' : 'Incorrect'}
            </div>
            {!lastAnswer.isCorrect && (
              <div className="practice-card__correct-answer">
                Correct answer: <strong>{currentExercise.correctAnswer}</strong>
                {lastAnswer.errorPosition && (
                  <span className="practice-card__error-pos">
                    {' '}
                    (error in {lastAnswer.errorPosition})
                  </span>
                )}
              </div>
            )}
            <button className="practice-card__btn" onClick={onNext}>
              {isLastExercise ? 'Continue' : 'Next'}
            </button>
            {hasRecordedAnswers && (
              <button className="practice-card__btn" onClick={onComplete}>
                Finish &amp; Analyze
              </button>
            )}
          </div>
        ) : currentExercise.exerciseType === 'multiple_choice' &&
          currentExercise.options ? (
          <div className="practice-card__options">
            {currentExercise.options.map((opt) => (
              <button
                key={opt}
                className="practice-card__option"
                onClick={() => handleOptionClick(opt)}
                disabled={phase === 'submitting'}
              >
                {normalizeOptionText(opt)}
              </button>
            ))}
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="practice-card__form">
            <input
              className="practice-card__input"
              type="text"
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              placeholder="Type your answer..."
              autoFocus
              disabled={phase === 'submitting'}
              spellCheck={false}
            />
            <button
              className="practice-card__btn"
              type="submit"
              disabled={phase === 'submitting' || !userInput.trim()}
            >
              {phase === 'submitting' ? 'Checking...' : 'Submit'}
            </button>
          </form>
        )}

        <button className="practice-card__close" onClick={onReset}>
          Exit
        </button>
        {hasRecordedAnswers && phase !== 'reviewing' && (
          <button className="practice-card__btn" onClick={onComplete}>
            Finish &amp; Analyze
          </button>
        )}
      </div>
    </PracticeOverlay>
  );
}
