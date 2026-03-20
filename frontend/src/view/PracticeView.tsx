import { useState } from 'react';
import type { Exercise, AnswerResult, SessionAnalysis } from '../model/types';
import type { PracticePhase } from '../viewmodel/usePractice';
import './PracticeView.css';

interface Props {
  phase: PracticePhase;
  currentExercise: Exercise | null;
  currentIndex: number;
  totalExercises: number;
  lastAnswer: AnswerResult | null;
  isLastExercise: boolean;
  analysis: SessionAnalysis | null;
  error: string | null;
  onAnswer: (userAnswer: string) => void;
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
  onAnswer,
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

  if (phase === 'loading') {
    return (
      <div className="practice-overlay" data-testid="practice-view">
        <div className="practice-card">
          <div className="practice-card__loading">Generating exercises...</div>
        </div>
      </div>
    );
  }

  if (phase === 'analyzing') {
    return (
      <div className="practice-overlay" data-testid="practice-view">
        <div className="practice-card">
          <div className="practice-card__loading">Analyzing your session...</div>
        </div>
      </div>
    );
  }

  if (phase === 'error') {
    return (
      <div className="practice-overlay" data-testid="practice-view">
        <div className="practice-card">
          <div className="practice-card__error">{error}</div>
          <button className="practice-card__btn" onClick={onReset}>
            Back
          </button>
        </div>
      </div>
    );
  }

  if (phase === 'complete' && analysis) {
    return (
      <div className="practice-overlay" data-testid="practice-view">
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
      </div>
    );
  }

  if (!currentExercise) return null;

  return (
    <div className="practice-overlay" data-testid="practice-view">
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
        <div className="practice-card__prompt">{currentExercise.prompt}</div>

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
            {isLastExercise ? (
              <button className="practice-card__btn" onClick={onComplete}>
                Finish &amp; Analyze
              </button>
            ) : (
              <button className="practice-card__btn" onClick={onNext}>
                Next
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
                {opt}
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
      </div>
    </div>
  );
}
