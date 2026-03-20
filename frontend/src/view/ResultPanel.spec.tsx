import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResultPanel } from './ResultPanel';

vi.mock('../model/clipboard', () => ({
  copyToClipboard: vi.fn(),
}));

vi.mock('../model/api', () => ({
  generateSpeech: vi.fn(),
}));

import { copyToClipboard } from '../model/clipboard';

const mockCopy = vi.mocked(copyToClipboard);

describe('ResultPanel', () => {
  const result = {
    rawText: 'Raw text content',
    markdown: '# Markdown content',
    filename: 'test.png',
  };

  beforeEach(() => {
    mockCopy.mockClear();
    global.URL.createObjectURL = vi.fn(() => 'blob:audio-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('should show markdown tab content by default', () => {
    render(<ResultPanel result={result} />);

    expect(screen.getByText('# Markdown content')).toBeInTheDocument();
  });

  it('should switch to raw text tab', async () => {
    const user = userEvent.setup();
    render(<ResultPanel result={result} />);

    await user.click(screen.getByText('Raw Text'));

    expect(screen.getByText('Raw text content')).toBeInTheDocument();
  });

  it('should copy markdown to clipboard', () => {
    render(<ResultPanel result={result} />);
    fireEvent.click(screen.getByText('Copy'));

    expect(mockCopy).toHaveBeenCalledWith('# Markdown content');
  });

  it('should copy raw text when on raw tab', () => {
    render(<ResultPanel result={result} />);
    fireEvent.click(screen.getByText('Raw Text'));
    fireEvent.click(screen.getByText('Copy'));

    expect(mockCopy).toHaveBeenCalledWith('Raw text content');
  });

  it('should render tab buttons and filename', () => {
    render(<ResultPanel result={result} />);

    expect(screen.getByText('Markdown')).toBeInTheDocument();
    expect(screen.getByText('Raw Text')).toBeInTheDocument();
    expect(screen.getByText('test.png')).toBeInTheDocument();
  });

  it('should show char counts for raw and markdown', () => {
    render(<ResultPanel result={result} />);

    expect(screen.getByText(/Raw:/)).toBeInTheDocument();
    expect(screen.getByText(/Markdown:/)).toBeInTheDocument();
  });

  it('should enter edit mode and show textarea', async () => {
    const user = userEvent.setup();
    render(<ResultPanel result={result} />);

    await user.click(screen.getByText('Edit'));

    expect(screen.getByRole('textbox')).toBeInTheDocument();
    expect(screen.getByText('Done')).toBeInTheDocument();
  });

  it('should show TTS panel when TTS button is clicked', async () => {
    const user = userEvent.setup();
    render(<ResultPanel result={result} />);

    await user.click(screen.getByText('🔊 TTS'));

    expect(screen.getByText('Generate')).toBeInTheDocument();
  });

  it('should expose qwen as a TTS engine option', async () => {
    const user = userEvent.setup();
    render(<ResultPanel result={result} />);

    await user.click(screen.getByText('🔊 TTS'));
    await user.click(screen.getByText('Qwen'));

    expect(screen.getByText('Ryan')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Optional speaking style or emotion')).toBeInTheDocument();
  });

  it('should reset to original content when result prop changes', () => {
    const { rerender } = render(<ResultPanel result={result} />);

    rerender(<ResultPanel result={{ rawText: 'New raw', markdown: '# New', filename: 'new.png' }} />);

    expect(screen.getByText('# New')).toBeInTheDocument();
  });

  it('should render save button when onSave is provided', () => {
    render(<ResultPanel result={result} onSave={vi.fn()} saveStatus="idle" />);

    expect(screen.getByTitle('Save to database')).toBeInTheDocument();
  });

  it('should call onSave with markdown content when save button is clicked', () => {
    const onSave = vi.fn();
    render(<ResultPanel result={result} onSave={onSave} saveStatus="idle" />);

    fireEvent.click(screen.getByTitle('Save to database'));

    expect(onSave).toHaveBeenCalledWith('# Markdown content');
  });

  it('should show "Saved ✓" when saveStatus is saved', () => {
    render(<ResultPanel result={result} onSave={vi.fn()} saveStatus="saved" />);

    expect(screen.getByText('Saved ✓')).toBeInTheDocument();
  });

  it('should not show save button when isSavedDocument is true', () => {
    render(<ResultPanel result={result} onSave={vi.fn()} saveStatus="idle" isSavedDocument />);

    expect(screen.queryByTitle('Save to database')).not.toBeInTheDocument();
  });

  it('should hide Raw Text tab when isSavedDocument is true', () => {
    render(<ResultPanel result={result} isSavedDocument />);

    expect(screen.queryByText('Raw Text')).not.toBeInTheDocument();
  });
});
