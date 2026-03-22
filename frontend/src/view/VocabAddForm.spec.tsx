import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VocabAddForm } from './VocabAddForm';

const baseProps = {
  x: 120,
  y: 80,
  selectedText: 'hello',
  vocabType: 'word' as const,
  isDuplicate: false,
  onAdd: vi.fn(),
  onClose: vi.fn(),
};

describe('VocabAddForm', () => {
  it('renders selected word and vocab type', () => {
    render(<VocabAddForm {...baseProps} />);

    expect(screen.getByText('hello')).toBeInTheDocument();
    expect(screen.getByText('Word')).toBeInTheDocument();
  });

  it('submits translation through onAdd', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<VocabAddForm {...baseProps} onAdd={onAdd} />);

    await user.type(screen.getByPlaceholderText('Translation...'), 'привет');
    await user.click(screen.getByText('Add'));

    expect(onAdd).toHaveBeenCalledWith('привет');
  });

  it('closes when close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<VocabAddForm {...baseProps} onClose={onClose} />);

    await user.click(screen.getByLabelText('Close'));

    expect(onClose).toHaveBeenCalled();
  });

  it('shows duplicate warning instead of the input form', () => {
    render(<VocabAddForm {...baseProps} isDuplicate />);

    expect(screen.getByTestId('duplicate-warning')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Translation...')).not.toBeInTheDocument();
  });
});
