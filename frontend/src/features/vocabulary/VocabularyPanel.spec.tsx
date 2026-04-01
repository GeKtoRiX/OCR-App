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
  onUpdate: vi.fn(),
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

  it('opens inline edit form and calls onUpdate with changed word and translation', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <VocabularyPanel
        {...baseProps}
        onUpdate={onUpdate}
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

    await user.click(screen.getByTitle('Edit'));
    expect(screen.getByTestId('vocab-edit-form')).toBeInTheDocument();

    const wordInput = screen.getByTestId('vocab-edit-word');
    const translationInput = screen.getByTestId('vocab-edit-translation');
    expect(wordInput).toHaveValue('hello');
    expect(translationInput).toHaveValue('привет');

    await user.clear(wordInput);
    await user.type(wordInput, 'hi');
    await user.clear(translationInput);
    await user.type(translationInput, 'привет (неформ.)');

    await user.click(screen.getByTestId('vocab-edit-save'));

    expect(onUpdate).toHaveBeenCalledWith('word-1', 'hi', 'привет (неформ.)');
    expect(screen.queryByTestId('vocab-edit-form')).not.toBeInTheDocument();
  });

  it('cancels edit without calling onUpdate', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(
      <VocabularyPanel
        {...baseProps}
        onUpdate={onUpdate}
        words={[{
          id: 'word-1',
          word: 'hello',
          vocabType: 'word',
          translation: 'привет',
          targetLang: 'en',
          nativeLang: 'ru',
          contextSentence: '',
          sourceDocumentId: null,
          intervalDays: 1,
          easinessFactor: 2.5,
          repetitions: 0,
          nextReviewAt: '2026-03-21T00:00:00.000Z',
          createdAt: '2026-03-21T00:00:00.000Z',
          updatedAt: '2026-03-21T00:00:00.000Z',
        }]}
      />,
    );

    await user.click(screen.getByTitle('Edit'));
    await user.click(screen.getByTestId('vocab-edit-cancel'));

    expect(onUpdate).not.toHaveBeenCalled();
    expect(screen.getByText('hello')).toBeInTheDocument();
  });
});
