import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HistoryPanel } from './HistoryPanel';
import type { HistoryEntry } from '../model/types';

const makeEntry = (id: string, filename = `${id}.png`): HistoryEntry => ({
  id,
  file: new File(['data'], filename, { type: 'image/png' }),
  result: { rawText: 'raw text', markdown: '# markdown', filename },
  processedAt: new Date(),
});

const baseProps = {
  entries: [] as HistoryEntry[],
  activeId: null,
  onSelect: vi.fn(),
  healthColor: 'blue' as const,
  healthLabel: 'All systems ready',
  healthTooltip: 'PaddleOCR GPU ✓ | LM Studio ✓',
  savedDocuments: [],
  savedLoading: false,
  activeSavedId: null,
  onSelectSaved: vi.fn(),
  onDeleteSaved: vi.fn(),
  vocabWords: [],
  vocabLoading: false,
  vocabLangPair: { targetLang: 'en', nativeLang: 'ru' },
  vocabDueCount: 0,
  onVocabLangPairChange: vi.fn(),
  onVocabDelete: vi.fn(),
  onStartPractice: vi.fn(),
};

describe('HistoryPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.URL.createObjectURL = vi.fn(() => 'blob:thumb-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('should show empty state when there are no entries', () => {
    render(<HistoryPanel {...baseProps} />);

    expect(screen.getByText('No images processed yet.')).toBeInTheDocument();
  });

  it('should render Session and Saved tab buttons', () => {
    render(<HistoryPanel {...baseProps} />);

    expect(screen.getByText('Session')).toBeInTheDocument();
    expect(screen.getByText('Saved')).toBeInTheDocument();
  });

  it('should render an item for each entry', () => {
    const entries = [makeEntry('a'), makeEntry('b'), makeEntry('c')];
    render(<HistoryPanel {...baseProps} entries={entries} />);

    expect(screen.getByText('a.png')).toBeInTheDocument();
    expect(screen.getByText('b.png')).toBeInTheDocument();
    expect(screen.getByText('c.png')).toBeInTheDocument();
  });

  it('should apply active class only to the active entry', () => {
    const entries = [makeEntry('first'), makeEntry('second')];
    const { container } = render(
      <HistoryPanel {...baseProps} entries={entries} activeId="first" />,
    );

    const items = container.querySelectorAll('.history-item');
    expect(items[0]).toHaveClass('history-item--active');
    expect(items[1]).not.toHaveClass('history-item--active');
  });

  it('should call onSelect with the entry id when clicked', () => {
    const onSelect = vi.fn();
    render(
      <HistoryPanel {...baseProps} entries={[makeEntry('entry-1')]} onSelect={onSelect} />,
    );

    fireEvent.click(screen.getByText('entry-1.png'));

    expect(onSelect).toHaveBeenCalledWith('entry-1');
  });

  it('should call onSelect on Enter key press', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <HistoryPanel {...baseProps} entries={[makeEntry('entry-2')]} onSelect={onSelect} />,
    );

    const item = screen.getByText('entry-2.png').closest('li') as HTMLElement;
    item.focus();
    await user.keyboard('{Enter}');

    expect(onSelect).toHaveBeenCalledWith('entry-2');
  });

  it('should call onSelect on Space key press', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    render(
      <HistoryPanel {...baseProps} entries={[makeEntry('entry-3')]} onSelect={onSelect} />,
    );

    const item = screen.getByText('entry-3.png').closest('li') as HTMLElement;
    item.focus();
    await user.keyboard(' ');

    expect(onSelect).toHaveBeenCalledWith('entry-3');
  });

  it('should render StatusLight with the provided health props', () => {
    const { container } = render(
      <HistoryPanel
        {...baseProps}
        healthColor="red"
        healthTooltip="PaddleOCR unreachable"
      />,
    );

    expect(container.querySelector('.status-light--red')).toBeInTheDocument();
    expect(screen.getByText('PaddleOCR unreachable')).toBeInTheDocument();
  });

  it('should revoke thumbnail URL when item unmounts', () => {
    const entries = [makeEntry('thumb-test')];
    const { unmount } = render(<HistoryPanel {...baseProps} entries={entries} />);

    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:thumb-url');
  });

  it('should show saved documents when Saved tab is clicked', async () => {
    const user = userEvent.setup();
    const savedDocuments = [
      { id: 's1', markdown: '# Saved', filename: 'saved.png', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' },
    ];
    render(<HistoryPanel {...baseProps} savedDocuments={savedDocuments} />);

    await user.click(screen.getByText('Saved (1)'));

    expect(screen.getByText('saved.png')).toBeInTheDocument();
  });

  it('should show empty state for saved tab when no documents', async () => {
    const user = userEvent.setup();
    render(<HistoryPanel {...baseProps} />);

    await user.click(screen.getByText('Saved'));

    expect(screen.getByText('No saved documents yet.')).toBeInTheDocument();
  });

  it('should call onDeleteSaved when delete button is clicked', async () => {
    const user = userEvent.setup();
    const onDeleteSaved = vi.fn();
    const savedDocuments = [
      { id: 's1', markdown: '# Saved', filename: 'saved.png', createdAt: '2024-01-01T00:00:00.000Z', updatedAt: '2024-01-01T00:00:00.000Z' },
    ];
    render(
      <HistoryPanel {...baseProps} savedDocuments={savedDocuments} onDeleteSaved={onDeleteSaved} />,
    );

    await user.click(screen.getByText('Saved (1)'));
    await user.click(screen.getByLabelText('Delete saved.png'));

    expect(onDeleteSaved).toHaveBeenCalledWith('s1');
  });
});
