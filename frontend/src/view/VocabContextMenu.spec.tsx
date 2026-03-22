import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VocabContextMenu } from './VocabContextMenu';

describe('VocabContextMenu', () => {
  const originalInnerWidth = window.innerWidth;
  const originalInnerHeight = window.innerHeight;

  beforeEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 400 });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 300 });
  });

  afterEach(() => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: originalInnerWidth });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: originalInnerHeight });
    vi.restoreAllMocks();
  });

  it('renders all vocabulary type actions', () => {
    render(<VocabContextMenu x={100} y={120} onSelect={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText('Add to Vocabulary')).toBeInTheDocument();
    expect(screen.getByText('Word')).toBeInTheDocument();
    expect(screen.getByText('Phrasal Verb')).toBeInTheDocument();
    expect(screen.getByText('Idiom')).toBeInTheDocument();
    expect(screen.getByText('Collocation')).toBeInTheDocument();
    expect(screen.getByText('Expression')).toBeInTheDocument();
  });

  it('selects the requested vocabulary type', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<VocabContextMenu x={100} y={120} onSelect={onSelect} onClose={vi.fn()} />);

    await user.click(screen.getByText('Phrasal Verb'));

    expect(onSelect).toHaveBeenCalledWith('phrasal_verb');
  });

  it('closes on outside click', () => {
    const onClose = vi.fn();
    render(<VocabContextMenu x={100} y={120} onSelect={vi.fn()} onClose={onClose} />);

    fireEvent.mouseDown(document.body);

    expect(onClose).toHaveBeenCalled();
  });

  it('closes on Escape key', () => {
    const onClose = vi.fn();
    render(<VocabContextMenu x={100} y={120} onSelect={vi.fn()} onClose={onClose} />);

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(onClose).toHaveBeenCalled();
  });

  it('keeps the menu inside the viewport', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 200,
      height: 220,
      top: 0,
      right: 200,
      bottom: 220,
      left: 0,
      toJSON: () => ({}),
    });

    render(<VocabContextMenu x={350} y={280} onSelect={vi.fn()} onClose={vi.fn()} />);

    const menu = screen.getByTestId('vocab-context-menu');
    expect(menu).toHaveStyle({ left: '192px', top: '50px' });
  });

  it('centers the menu around the click position when space is available', () => {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      width: 200,
      height: 120,
      top: 0,
      right: 200,
      bottom: 120,
      left: 0,
      toJSON: () => ({}),
    });

    render(<VocabContextMenu x={220} y={100} onSelect={vi.fn()} onClose={vi.fn()} />);

    const menu = screen.getByTestId('vocab-context-menu');
    expect(menu).toHaveStyle({ left: '120px', top: '110px' });
  });
});
