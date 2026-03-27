import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VocabularyPanel } from './VocabularyPanel';

const baseProps = {
  words: [],
  loading: false,
  langPair: { targetLang: 'en', nativeLang: 'ru' },
  dueCount: 0,
  onLangPairChange: vi.fn(),
  onDelete: vi.fn(),
  onStartPractice: vi.fn(),
};

describe('VocabularyPanel', () => {
  it('renders loading state', () => {
    render(<VocabularyPanel {...baseProps} loading />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders empty state when there are no words', () => {
    render(<VocabularyPanel {...baseProps} />);

    expect(screen.getByText(/No vocabulary words yet/)).toBeInTheDocument();
  });

  it('renders words and allows deletion', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    render(
      <VocabularyPanel
        {...baseProps}
        onDelete={onDelete}
        words={[{
          id: 'word-1',
          word: 'hello',
          vocabType: 'word',
          translation: 'привет',
          targetLang: 'en',
          nativeLang: 'ru',
          contextSentence: 'Hello there.',
          sourceDocumentId: null,
          intervalDays: 2,
          easinessFactor: 2.5,
          repetitions: 1,
          nextReviewAt: '2026-03-21T00:00:00.000Z',
          createdAt: '2026-03-21T00:00:00.000Z',
          updatedAt: '2026-03-21T00:00:00.000Z',
        }]}
      />,
    );

    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByText('привет')).toBeInTheDocument();
    expect(screen.getByText('Word')).toBeInTheDocument();
    expect(screen.getByText('Rep: 1')).toBeInTheDocument();
    expect(screen.getByText('EF: 2.5')).toBeInTheDocument();

    await user.click(screen.getByTitle('Remove'));

    expect(onDelete).toHaveBeenCalledWith('word-1');
  });

  it('propagates language pair changes', () => {
    const onLangPairChange = vi.fn();
    render(<VocabularyPanel {...baseProps} onLangPairChange={onLangPairChange} />);

    const inputs = screen.getAllByRole('textbox');
    fireEvent.change(inputs[0], { target: { value: 'es' } });

    expect(onLangPairChange).toHaveBeenLastCalledWith({ targetLang: 'es', nativeLang: 'ru' });

    fireEvent.change(inputs[1], { target: { value: 'de' } });

    expect(onLangPairChange).toHaveBeenLastCalledWith({ targetLang: 'en', nativeLang: 'de' });
  });

  it('disables practice button when no words are due', () => {
    render(<VocabularyPanel {...baseProps} dueCount={0} />);

    expect(screen.getByText('Practice')).toBeDisabled();
  });

  it('starts practice when due words exist', async () => {
    const user = userEvent.setup();
    const onStartPractice = vi.fn();
    render(<VocabularyPanel {...baseProps} dueCount={3} onStartPractice={onStartPractice} />);

    const practiceButton = screen.getByText('Practice');
    expect(practiceButton).not.toBeDisabled();
    expect(screen.getByText('3')).toBeInTheDocument();

    await user.click(practiceButton);

    expect(onStartPractice).toHaveBeenCalled();
  });
});
