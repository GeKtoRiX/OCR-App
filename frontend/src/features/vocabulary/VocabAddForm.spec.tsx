import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VocabAddForm } from './VocabAddForm';

const baseProps = {
  x: 120,
  y: 80,
  selectedText: 'hello',
  vocabType: 'word' as const,
  pos: null,
  contextSentence: '',
  isDuplicate: false,
  onAdd: vi.fn(),
  onClose: vi.fn(),
};

describe('VocabAddForm', () => {
  it('renders selected word as editable input and default vocab type', () => {
    render(<VocabAddForm {...baseProps} />);

    expect(screen.getByDisplayValue('hello')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Word')).toBeInTheDocument();
    expect(screen.getByLabelText('Part of Speech')).toHaveValue('');
  });

  it('submits word, translation, context, type, and pos through onAdd', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<VocabAddForm {...baseProps} onAdd={onAdd} />);

    await user.selectOptions(screen.getByLabelText('Part of Speech'), 'verb');
    await user.type(screen.getByPlaceholderText('Translation...'), 'привет');
    await user.click(screen.getByText('Add'));

    expect(onAdd).toHaveBeenCalledWith('hello', 'привет', '', 'word', 'verb');
  });

  it('allows editing the word before submitting', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<VocabAddForm {...baseProps} onAdd={onAdd} />);

    const wordInput = screen.getByDisplayValue('hello');
    await user.clear(wordInput);
    await user.type(wordInput, 'hi');
    await user.type(screen.getByPlaceholderText('Translation...'), 'привет');
    await user.click(screen.getByText('Add'));

    expect(onAdd).toHaveBeenCalledWith('hi', 'привет', '', 'word', null);
  });

  it('pre-fills context sentence when provided', () => {
    render(<VocabAddForm {...baseProps} contextSentence="Hello world." />);

    expect(screen.getByDisplayValue('Hello world.')).toBeInTheDocument();
  });

  it('closes when close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<VocabAddForm {...baseProps} onClose={onClose} />);

    await user.click(screen.getByLabelText('Close'));

    expect(onClose).toHaveBeenCalled();
  });

  it('shows duplicate warning but still allows submission', () => {
    render(<VocabAddForm {...baseProps} isDuplicate />);

    expect(screen.getByTestId('duplicate-warning')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Translation...')).toBeInTheDocument();
  });

  it('disables Add button when word or translation is empty', () => {
    render(<VocabAddForm {...baseProps} />);

    expect(screen.getByText('Add')).toBeDisabled();
  });
});
