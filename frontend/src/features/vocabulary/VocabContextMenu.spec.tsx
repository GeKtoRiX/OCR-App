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

  it('renders a single add action', () => {
    render(<VocabContextMenu x={100} y={120} onSelect={vi.fn()} onClose={vi.fn()} />);

    expect(screen.getByText('Add to Vocabulary')).toBeInTheDocument();
  });

  it('selects the add action', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(<VocabContextMenu x={100} y={120} onSelect={onSelect} onClose={vi.fn()} />);

    await user.click(screen.getByText('Add to Vocabulary'));

    expect(onSelect).toHaveBeenCalledWith();
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

    // x=350 overflows right (350+8+200+8>400) → flip to 350-200-8=142, clamped to 142
    // y=280+8=288 overflows bottom (288+220+8>300) → flip to 280-220-8=52, clamped to 52
    const menu = screen.getByTestId('vocab-context-menu');
    expect(menu).toHaveStyle({ left: '142px', top: '52px' });
  });

  it('positions the menu below and at the anchor point when space is available', () => {
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

    render(<VocabContextMenu x={100} y={100} onSelect={vi.fn()} onClose={vi.fn()} />);

    // x=100 no overflow (100+8+200+8=316<400), top=100+8=108 no overflow (108+120+8=236<300)
    const menu = screen.getByTestId('vocab-context-menu');
    expect(menu).toHaveStyle({ left: '108px', top: '108px' });
  });
});
