import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HistoryPanel } from './HistoryPanel';
import type { HistoryEntry } from '../shared/types';

const storeMocks = vi.hoisted(() => ({
  mockOcr: {} as any,
  mockDocs: {} as any,
  mockVocab: {} as any,
  mockHealth: {} as any,
  mockPractice: {} as any,
}));

vi.mock('../features/ocr/ocr.store', () => ({
  useOcrStore: () => storeMocks.mockOcr,
}));

vi.mock('../features/documents/documents.store', () => ({
  useDocumentsStore: () => storeMocks.mockDocs,
}));

vi.mock('../features/vocabulary/vocabulary.store', () => ({
  useVocabularyStore: () => storeMocks.mockVocab,
}));

vi.mock('../features/health/health.store', () => ({
  useHealthStore: () => storeMocks.mockHealth,
}));

vi.mock('../features/practice/practice.store', () => ({
  usePracticeStore: () => storeMocks.mockPractice,
}));

const makeEntry = (id: string, filename = `${id}.png`): HistoryEntry => ({
  id,
  type: 'image',
  file: new File(['data'], filename, { type: 'image/png' }),
  result: { rawText: 'raw text', markdown: '# markdown', filename },
  processedAt: new Date(),
});

const makeTextEntry = (id: string, filename = `${id}.md`): HistoryEntry => ({
  id,
  type: 'text',
  result: { rawText: 'raw text', markdown: '# markdown', filename },
  processedAt: new Date(),
});

function defaultStores() {
  return {
    ocr: {
      status: 'idle' as const,
      result: null,
      error: null,
      entries: [] as HistoryEntry[],
      activeHistoryId: null,
      run: vi.fn(),
      reset: vi.fn(),
      selectEntry: vi.fn(),
      removeEntry: vi.fn(),
    },
    docs: {
      documents: [] as any[],
      loading: false,
      saveStatus: 'idle' as const,
      error: null,
      activeSavedId: null,
      vocabularyReviewStatus: 'idle' as const,
      vocabularyReviewDocumentId: null,
      vocabularyReviewCandidates: [],
      vocabularyReviewError: null,
      vocabularyReviewLlmApplied: false,
      vocabularyConfirmResult: null,
      load: vi.fn(),
      save: vi.fn(),
      update: vi.fn(),
      remove: vi.fn().mockResolvedValue(true),
      selectDocument: vi.fn(),
      clearSelection: vi.fn(),
      prepareVocabulary: vi.fn().mockResolvedValue([]),
      confirmVocabulary: vi.fn().mockResolvedValue(null),
      clearVocabularyReview: vi.fn(),
    },
    vocab: {
      words: [],
      loading: false,
      error: null,
      langPair: { targetLang: 'en', nativeLang: 'ru' },
      dueCount: 0,
      existingWordsSet: new Set<string>(),
      load: vi.fn(),
      refresh: vi.fn(),
      addWord: vi.fn(),
      removeWord: vi.fn().mockResolvedValue(true),
      updateWord: vi.fn(),
      setLangPair: vi.fn(),
    },
    health: {
      color: 'blue' as const,
      tooltip: 'PaddleOCR GPU ✓ | LM Studio ✓',
    },
    practice: {
      start: vi.fn().mockResolvedValue(undefined),
    },
  };
}

describe('HistoryPanel', () => {
  beforeEach(() => {
    const defaults = defaultStores();
    storeMocks.mockOcr = defaults.ocr;
    storeMocks.mockDocs = defaults.docs;
    storeMocks.mockVocab = defaults.vocab;
    storeMocks.mockHealth = defaults.health;
    storeMocks.mockPractice = defaults.practice;
    global.URL.createObjectURL = vi.fn(() => 'blob:thumb-url');
    global.URL.revokeObjectURL = vi.fn();
  });

  it('shows the empty session state when no entries exist', () => {
    render(<HistoryPanel />);

    expect(screen.getByText('No session results yet.')).toBeInTheDocument();
  });

  it('renders session items and marks the active entry when no saved doc is selected', () => {
    storeMocks.mockOcr.entries = [makeEntry('first'), makeEntry('second')];
    storeMocks.mockOcr.activeHistoryId = 'first';

    const { container } = render(<HistoryPanel />);

    const items = container.querySelectorAll('.history-item');
    expect(items[0]).toHaveClass('history-item--active');
    expect(items[1]).not.toHaveClass('history-item--active');
  });

  it('selects a session entry and clears saved selection', () => {
    storeMocks.mockOcr.entries = [makeEntry('entry-1')];

    render(<HistoryPanel />);
    fireEvent.click(screen.getByText('entry-1.png'));

    expect(storeMocks.mockOcr.selectEntry).toHaveBeenCalledWith('entry-1');
    expect(storeMocks.mockDocs.clearSelection).toHaveBeenCalled();
  });

  it('deletes a session entry through the OCR store', async () => {
    const user = userEvent.setup();
    storeMocks.mockOcr.entries = [makeEntry('entry-1')];

    render(<HistoryPanel />);
    await user.click(screen.getByLabelText('Delete entry-1.png'));

    expect(storeMocks.mockOcr.removeEntry).toHaveBeenCalledWith('entry-1');
  });

  it('suppresses active session styling while a saved document is selected', () => {
    storeMocks.mockOcr.entries = [makeEntry('entry-1')];
    storeMocks.mockOcr.activeHistoryId = 'entry-1';
    storeMocks.mockDocs.activeSavedId = 'saved-1';

    const { container } = render(<HistoryPanel />);

    expect(container.querySelector('.history-item--active')).not.toBeInTheDocument();
  });

  it('renders derived health label and tooltip', () => {
    storeMocks.mockHealth = {
      color: 'red',
      tooltip: 'PaddleOCR unreachable',
    };

    const { container } = render(<HistoryPanel />);

    expect(container.querySelector('.status-light--red')).toBeInTheDocument();
    expect(screen.getByLabelText('Service issue. PaddleOCR unreachable')).toBeInTheDocument();
  });

  it('shows saved documents on the Saved tab and wires select/delete', async () => {
    const user = userEvent.setup();
    storeMocks.mockDocs.documents = [
      {
        id: 's1',
        markdown: '# Saved',
        filename: 'saved.png',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        analysisStatus: 'idle',
        analysisError: null,
        analysisUpdatedAt: null,
      },
    ];

    render(<HistoryPanel />);
    await user.click(screen.getByText('Saved (1)'));

    expect(screen.getByText('saved.png')).toBeInTheDocument();

    await user.click(screen.getByText('saved.png'));
    expect(storeMocks.mockDocs.selectDocument).toHaveBeenCalledWith('s1');

    await user.click(screen.getByLabelText('Delete saved.png'));
    expect(storeMocks.mockDocs.remove).toHaveBeenCalledWith('s1');
  });

  it('shows the vocab tab and wires language change, delete, and practice start', async () => {
    const user = userEvent.setup();
    storeMocks.mockVocab.words = [
      {
        id: 'w1',
        word: 'hello',
        vocabType: 'word',
        translation: 'привет',
        targetLang: 'en',
        nativeLang: 'ru',
        contextSentence: 'Hello there.',
        sourceDocumentId: null,
        intervalDays: 1,
        easinessFactor: 2.5,
        repetitions: 1,
        nextReviewAt: '2024-01-01T00:00:00.000Z',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ];
    storeMocks.mockVocab.dueCount = 3;

    render(<HistoryPanel />);
    await user.click(screen.getByText('Vocab (1)'));

    expect(screen.getByText('hello')).toBeInTheDocument();

    fireEvent.change(screen.getByTestId('vocab-target-lang'), {
      target: { value: 'de' },
    });
    expect(storeMocks.mockVocab.setLangPair).toHaveBeenCalledWith({
      targetLang: 'de',
      nativeLang: 'ru',
    });

    await user.click(screen.getByTitle('Remove'));
    expect(storeMocks.mockVocab.removeWord).toHaveBeenCalledWith('w1');

    await user.click(screen.getByTestId('vocab-practice-button'));
    expect(storeMocks.mockPractice.start).toHaveBeenCalledWith('en', 'ru');
  });

  it('revokes thumbnail URLs on unmount', () => {
    storeMocks.mockOcr.entries = [makeEntry('thumb-test')];

    const { unmount } = render(<HistoryPanel />);
    unmount();

    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:thumb-url');
  });

  it('renders a document icon for text entries without creating a thumbnail URL', () => {
    storeMocks.mockOcr.entries = [makeTextEntry('text-entry', 'notes.md')];

    render(<HistoryPanel />);

    expect(screen.getByText('📄')).toBeInTheDocument();
    expect(URL.createObjectURL).not.toHaveBeenCalled();
  });
});
