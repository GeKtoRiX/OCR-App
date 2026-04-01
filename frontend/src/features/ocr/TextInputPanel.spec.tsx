import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { TextInputPanel } from './TextInputPanel';

describe('TextInputPanel', () => {
  it('forwards filename and text changes to the parent', () => {
    const onTextChange = vi.fn();
    const onFilenameChange = vi.fn();

    render(
      <TextInputPanel
        text=""
        filename=""
        canSubmit
        onTextChange={onTextChange}
        onFilenameChange={onFilenameChange}
        onSubmit={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByPlaceholderText('document name'), {
      target: { value: 'notes.md' },
    });
    fireEvent.change(screen.getByPlaceholderText('Paste markdown or plain text here'), {
      target: { value: '# Hello' },
    });

    expect(onFilenameChange).toHaveBeenCalledWith('notes.md');
    expect(onTextChange).toHaveBeenCalledWith('# Hello');
  });

  it('submits the form only when submission is allowed', () => {
    const onSubmit = vi.fn();
    const { container, rerender } = render(
      <TextInputPanel
        text="Some text"
        filename="notes.md"
        canSubmit
        onTextChange={vi.fn()}
        onFilenameChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.submit(container.querySelector('form')!);
    expect(onSubmit).toHaveBeenCalledTimes(1);

    rerender(
      <TextInputPanel
        text=""
        filename="notes.md"
        canSubmit={false}
        onTextChange={vi.fn()}
        onFilenameChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    fireEvent.submit(container.querySelector('form')!);
    expect(onSubmit).toHaveBeenCalledTimes(1);
  });

  it('respects disabled state for inputs and submit handling', () => {
    const onSubmit = vi.fn();
    const { container } = render(
      <TextInputPanel
        text="Some text"
        filename="notes.md"
        canSubmit
        disabled
        onTextChange={vi.fn()}
        onFilenameChange={vi.fn()}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByPlaceholderText('document name')).toBeDisabled();
    expect(screen.getByPlaceholderText('Paste markdown or plain text here')).toBeDisabled();

    fireEvent.submit(container.querySelector('form')!);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
