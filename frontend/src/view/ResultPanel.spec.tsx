import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResultPanel } from './ResultPanel';

vi.mock('../model/clipboard', () => ({
  copyToClipboard: vi.fn(),
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
    fireEvent.click(screen.getByText('Скопировать'));

    expect(mockCopy).toHaveBeenCalledWith('# Markdown content');
  });

  it('should copy raw text when on raw tab', () => {
    render(<ResultPanel result={result} />);
    fireEvent.click(screen.getByText('Raw Text'));
    fireEvent.click(screen.getByText('Скопировать'));

    expect(mockCopy).toHaveBeenCalledWith('Raw text content');
  });

  it('should render tab buttons', () => {
    render(<ResultPanel result={result} />);

    expect(screen.getByText('Markdown')).toBeInTheDocument();
    expect(screen.getByText('Raw Text')).toBeInTheDocument();
    expect(screen.getByText('test.png')).toBeInTheDocument();
  });
});
