import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import App from './App';

const mocks = vi.hoisted(() => ({
  mockOcr: {} as any,
  mockDocs: {} as any,
  mockVocab: {} as any,
  mockPractice: {} as any,
  mockUpload: {} as any,
  mockHealth: {} as any,
  startPolling: vi.fn(() => vi.fn()),
}));

vi.mock('./features/ocr/ocr.store', () => ({
  useOcrStore: () => mocks.mockOcr,
}));

vi.mock('./features/documents/documents.store', () => ({
  useDocumentsStore: () => mocks.mockDocs,
}));

vi.mock('./features/vocabulary/vocabulary.store', () => ({
  useVocabularyStore: () => mocks.mockVocab,
}));

vi.mock('./features/practice/practice.store', () => ({
  usePracticeStore: () => mocks.mockPractice,
}));

vi.mock('./features/health/health.store', () => ({
  useHealthStore: () => mocks.mockHealth,
}));

vi.mock('./features/ocr/useImageUpload', () => ({
  useImageUpload: () => mocks.mockUpload,
}));

vi.mock('./view/HistoryPanel', () => ({
  HistoryPanel: () => <div data-testid="history-panel">Session</div>,
}));

vi.mock('./features/practice/PracticeView', () => ({
  PracticeView: (props: any) => (
    <div data-testid="practice-view">
      <button onClick={() => props.onReady()}>practice-ready</button>
      <button onClick={() => props.onAnswer('typed answer')}>practice-answer</button>
      <button onClick={() => props.onNext()}>practice-next</button>
      <button onClick={() => props.onComplete()}>practice-complete</button>
      <button onClick={() => props.onReset()}>practice-reset</button>
    </div>
  ),
}));

vi.mock('./view/ResultPanel', () => ({
  ResultPanel: ({ result, onSave, onUpdate, onAddVocabulary }: any) => (
    <div data-testid="result-panel">
      <div>{result.markdown}</div>
      {onSave && (
        <button onClick={() => onSave({ markdown: '# saved markdown', richTextHtml: '<p>saved</p>' })}>
          save-result
        </button>
      )}
      {onUpdate && (
        <button onClick={() => onUpdate({ markdown: '# updated markdown', richTextHtml: '<p>updated</p>' })}>
          update-result
        </button>
      )}
      {onAddVocabulary && (
        <button onClick={() => onAddVocabulary('hello', 'word', 'привет', 'Hello there.')}>
          add-vocab
        </button>
      )}
    </div>
  ),
}));

function defaultStores() {
  return {
    ocr: {
      status: 'idle' as const,
      result: null,
      error: null,
      entries: [],
      activeHistoryId: null,
      run: vi.fn(),
      submitText: vi.fn(),
      reset: vi.fn(),
      selectEntry: vi.fn(),
      removeEntry: vi.fn(),
    },
    docs: {
      documents: [],
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
      load: vi.fn().mockResolvedValue(undefined),
      save: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(null),
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
      load: vi.fn().mockResolvedValue(undefined),
      refresh: vi.fn().mockResolvedValue(undefined),
      addWord: vi.fn().mockResolvedValue(null),
      removeWord: vi.fn().mockResolvedValue(true),
      updateWord: vi.fn().mockResolvedValue(null),
      setLangPair: vi.fn(),
    },
    practice: {
      phase: 'idle' as const,
      sessionId: null,
      exercises: [],
      previewWords: [],
      allWords: [],
      currentBatchMode: null,
      batchSize: 10,
      unseenCursor: 0,
      currentIndex: 0,
      answers: [],
      lastAnswer: null,
      analysis: null,
      error: null,
      currentExercise: null,
      isLastExercise: false,
      sessionIncorrectCounts: {},
      currentRoundResults: [],
      start: vi.fn().mockResolvedValue(undefined),
      ready: vi.fn().mockResolvedValue(undefined),
      answer: vi.fn().mockResolvedValue(undefined),
      next: vi.fn(),
      complete: vi.fn().mockResolvedValue(undefined),
      reset: vi.fn(),
    },
    upload: {
      file: null,
      preview: null,
      error: null,
      onFileChange: vi.fn(),
      onDrop: vi.fn(),
      clear: vi.fn(),
    },
    health: {
      color: 'red' as const,
      tooltip: 'Checking status...',
      startPolling: mocks.startPolling,
    },
  };
}

describe('App', () => {
  beforeEach(() => {
    const defaults = defaultStores();
    mocks.mockOcr = defaults.ocr;
    mocks.mockDocs = defaults.docs;
    mocks.mockVocab = defaults.vocab;
    mocks.mockPractice = defaults.practice;
    mocks.mockUpload = defaults.upload;
    mocks.mockHealth = defaults.health;
    mocks.startPolling.mockReset();
    mocks.startPolling.mockReturnValue(vi.fn());
  });

  it('renders section headings and lazy sidebar', async () => {
    render(<App />);

    expect(screen.getByText('Prepare source')).toBeInTheDocument();
    expect(screen.getByText('Recognition output')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId('history-panel')).toBeInTheDocument());
  });

  it('loads documents and vocabulary on mount and polls health', async () => {
    render(<App />);

    await waitFor(() => {
      expect(mocks.mockDocs.load).toHaveBeenCalled();
      expect(mocks.mockVocab.load).toHaveBeenCalled();
      expect(mocks.startPolling).toHaveBeenCalled();
    });
  });

  it('disables Recognize until a file is selected', () => {
    render(<App />);

    expect(screen.getByText('Recognize')).toBeDisabled();
    expect(screen.getByText('Awaiting file')).toBeInTheDocument();
  });

  it('enables Recognize and shows file badge when a file exists', () => {
    mocks.mockUpload.file = new File(['x'], 'photo.png', { type: 'image/png' });

    render(<App />);

    expect(screen.getByText('Recognize')).not.toBeDisabled();
    expect(screen.getByText('File selected')).toBeInTheDocument();
  });

  it('runs OCR when Recognize is clicked', () => {
    mocks.mockUpload.file = new File(['x'], 'photo.png', { type: 'image/png' });

    render(<App />);
    fireEvent.click(screen.getByText('Recognize'));

    expect(mocks.mockDocs.clearSelection).toHaveBeenCalled();
    expect(mocks.mockOcr.run).toHaveBeenCalledWith(mocks.mockUpload.file);
  });

  it('clears upload and OCR state when Clear is clicked', () => {
    render(<App />);
    fireEvent.click(screen.getByText('Clear'));

    expect(mocks.mockUpload.clear).toHaveBeenCalled();
    expect(mocks.mockOcr.reset).toHaveBeenCalled();
  });

  it('switches to text mode, clears image upload state, and submits pasted text', () => {
    mocks.mockUpload.file = new File(['x'], 'photo.png', { type: 'image/png' });

    render(<App />);

    fireEvent.click(screen.getByText('Paste Text'));

    expect(mocks.mockUpload.clear).toHaveBeenCalled();
    expect(screen.queryByText('Recognize')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('document name')).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText('document name'), {
      target: { value: 'notes.md' },
    });
    fireEvent.change(screen.getByPlaceholderText('Paste markdown or plain text here'), {
      target: { value: '# Notes' },
    });
    fireEvent.click(screen.getByText('Load Text'));

    expect(mocks.mockDocs.clearSelection).toHaveBeenCalled();
    expect(mocks.mockOcr.submitText).toHaveBeenCalledWith('# Notes', 'notes.md');
  });

  it('switches back to image mode from text mode', () => {
    render(<App />);

    fireEvent.click(screen.getByText('Paste Text'));
    fireEvent.click(screen.getByText('Image OCR'));

    expect(screen.getByText('Recognize')).toBeInTheDocument();
  });

  it('renders the empty result state when no data is available', () => {
    render(<App />);

    expect(screen.getByText('Structured output will appear here')).toBeInTheDocument();
  });

  it('renders the result panel from OCR state and wires save/add callbacks', () => {
    mocks.mockOcr.result = {
      rawText: 'Hello',
      markdown: '# Hello',
      richTextHtml: null,
      filename: 'doc.png',
    };

    render(<App />);

    expect(screen.getByText('# Hello')).toBeInTheDocument();

    fireEvent.click(screen.getByText('save-result'));
    expect(mocks.mockDocs.save).toHaveBeenCalledWith({
      markdown: '# saved markdown',
      richTextHtml: '<p>saved</p>',
      filename: 'doc.png',
    });

    fireEvent.click(screen.getByText('add-vocab'));
    expect(mocks.mockVocab.addWord).toHaveBeenCalledWith(
      'hello',
      'word',
      'привет',
      'Hello there.',
      undefined,
      undefined,
    );
  });

  it('renders a saved document and wires update callback', () => {
    mocks.mockDocs.documents = [
      {
        id: 'saved-1',
        markdown: '# Saved doc',
        richTextHtml: '<p>Saved doc</p>',
        filename: 'saved.md',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        analysisStatus: 'idle',
        analysisError: null,
        analysisUpdatedAt: null,
      },
    ];
    mocks.mockDocs.activeSavedId = 'saved-1';

    render(<App />);

    expect(screen.getByText('# Saved doc')).toBeInTheDocument();
    fireEvent.click(screen.getByText('update-result'));
    expect(mocks.mockDocs.update).toHaveBeenCalledWith('saved-1', {
      markdown: '# updated markdown',
      richTextHtml: '<p>updated</p>',
    });
  });

  it('renders PracticeView and forwards practice callbacks', async () => {
    mocks.mockPractice.phase = 'preview';
    mocks.mockPractice.previewWords = [
      {
        id: 'v1',
        word: 'hello',
        translation: 'привет',
        contextSentence: 'Hello there.',
        attemptCount: 0,
        incorrectCount: 0,
      },
    ];
    mocks.mockPractice.currentBatchMode = 'unseen';
    mocks.mockPractice.currentExercise = {
      vocabularyId: 'v1',
      word: 'hello',
      exerciseType: 'spelling',
      prompt: 'Spell hello',
      correctAnswer: 'hello',
    };
    mocks.mockPractice.exercises = [mocks.mockPractice.currentExercise];
    mocks.mockPractice.isLastExercise = true;

    render(<App />);

    await waitFor(() => expect(screen.getByTestId('practice-view')).toBeInTheDocument());

    fireEvent.click(screen.getByText('practice-ready'));
    expect(mocks.mockPractice.ready).toHaveBeenCalled();

    fireEvent.click(screen.getByText('practice-answer'));
    expect(mocks.mockPractice.answer).toHaveBeenCalledWith('typed answer');

    fireEvent.click(screen.getByText('practice-next'));
    expect(mocks.mockPractice.next).toHaveBeenCalled();

    fireEvent.click(screen.getByText('practice-complete'));
    expect(mocks.mockPractice.complete).toHaveBeenCalled();

    fireEvent.click(screen.getByText('practice-reset'));
    expect(mocks.mockPractice.reset).toHaveBeenCalled();
    expect(mocks.mockVocab.refresh).toHaveBeenCalled();
  });
});
