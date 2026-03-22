import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import App from './App';

const useAppOrchestratorMock = vi.fn();

vi.mock('./viewmodel/useAppOrchestrator', () => ({
  useAppOrchestrator: () => useAppOrchestratorMock(),
}));

vi.mock('./view/HistoryPanel', () => ({
  HistoryPanel: (props: any) => (
    <div data-testid="history-panel">
      <div>Session</div>
      <button onClick={() => props.onSelect('session-1')}>select-session</button>
      <button onClick={() => props.onDeleteSession('session-1')}>delete-session</button>
      <button onClick={() => props.saved.onSelect('saved-1')}>select-saved</button>
      <button onClick={() => props.saved.onDelete('saved-1')}>delete-saved</button>
      <button onClick={() => props.vocab.onStartPractice()}>start-practice</button>
    </div>
  ),
}));

vi.mock('./view/PracticeView', () => ({
  PracticeView: (props: any) => (
    <div data-testid="practice-view">
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
      {onSave && <button onClick={() => onSave('# saved markdown')}>save-result</button>}
      {onUpdate && <button onClick={() => onUpdate('# updated markdown')}>update-result</button>}
      {onAddVocabulary && (
        <button
          onClick={() => onAddVocabulary('hello', 'word', 'привет', 'Hello there.')}
        >
          add-vocab
        </button>
      )}
    </div>
  ),
}));

function defaultApp() {
  return {
    upload: {
      file: null,
      preview: null,
      error: null,
      onFileChange: vi.fn(),
      onDrop: vi.fn(),
      clear: vi.fn(),
    },
    ocrStatus: 'idle' as const,
    ocrError: null,
    isProcessing: false,
    healthColor: 'blue' as const,
    healthLabel: 'All systems ready',
    healthTooltip: 'All OK',
    historyEntries: [],
    historyActiveId: null,
    savedDocuments: [],
    savedLoading: false,
    savedSaveStatus: 'idle' as const,
    activeSavedId: null,
    handleSave: vi.fn(),
    handleUpdate: undefined,
    vocabWords: [],
    vocabLoading: false,
    vocabLangPair: { targetLang: 'en', nativeLang: 'ru' },
    vocabDueCount: 0,
    vocabExistingWordsSet: new Set<string>(),
    onVocabLangPairChange: vi.fn(),
    onVocabDelete: vi.fn(),
    practice: {
      phase: 'idle' as const,
      exercises: [],
      currentExercise: null,
      currentIndex: 0,
      lastAnswer: null,
      isLastExercise: false,
      analysis: null,
      error: null,
      start: vi.fn(),
      answer: vi.fn(),
      next: vi.fn(),
      complete: vi.fn(),
      reset: vi.fn(),
    },
    displayedResult: null,
    isSavedDocument: false,
    hasResult: false,
    fileMeta: null,
    handleProcess: vi.fn(),
    handleReset: vi.fn(),
    handleSelectSession: vi.fn(),
    handleDeleteSession: vi.fn(),
    handleSelectSaved: vi.fn(),
    handleDeleteSaved: vi.fn(),
    handleAddVocabulary: vi.fn(),
    handleStartPractice: vi.fn(),
    handlePracticeReset: vi.fn(),
  };
}

describe('App', () => {
  beforeEach(() => {
    useAppOrchestratorMock.mockReturnValue(defaultApp());
  });

  it('should render section headings', async () => {
    render(<App />);

    expect(screen.getByText('Prepare source image')).toBeInTheDocument();
    expect(screen.getByText('Recognition output')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('Session')).toBeInTheDocument();
    });
  });

  it('should render Recognize and Clear buttons', () => {
    render(<App />);

    expect(screen.getByText('Recognize')).toBeInTheDocument();
    expect(screen.getByText('Clear')).toBeInTheDocument();
  });

  it('should have Recognize button disabled when no file is selected', () => {
    render(<App />);

    expect(screen.getByText('Recognize')).toBeDisabled();
  });

  it('should have Recognize button enabled when a file is selected', () => {
    useAppOrchestratorMock.mockReturnValue({
      ...defaultApp(),
      upload: {
        ...defaultApp().upload,
        file: new File(['x'], 'photo.png', { type: 'image/png' }),
      },
    });

    render(<App />);

    expect(screen.getByText('Recognize')).not.toBeDisabled();
  });

  it('should show "Awaiting file" badge when no file is selected', () => {
    render(<App />);

    expect(screen.getByText('Awaiting file')).toBeInTheDocument();
  });

  it('should show "File selected" badge when a file is ready', () => {
    useAppOrchestratorMock.mockReturnValue({
      ...defaultApp(),
      upload: {
        ...defaultApp().upload,
        file: new File(['x'], 'photo.png', { type: 'image/png' }),
      },
    });

    render(<App />);

    expect(screen.getByText('File selected')).toBeInTheDocument();
  });

  it('should show "Processing\u2026" on button during OCR', () => {
    useAppOrchestratorMock.mockReturnValue({
      ...defaultApp(),
      upload: {
        ...defaultApp().upload,
        file: new File(['x'], 'photo.png', { type: 'image/png' }),
      },
      ocrStatus: 'loading',
      isProcessing: true,
    });

    render(<App />);

    expect(screen.getByText('Processing\u2026')).toBeInTheDocument();
  });

  it('should render result placeholder when no result', () => {
    render(<App />);

    expect(screen.getByText('Structured output will appear here')).toBeInTheDocument();
  });

  it('should render ResultPanel when OCR result is available', () => {
    useAppOrchestratorMock.mockReturnValue({
      ...defaultApp(),
      displayedResult: { rawText: 'Hello', markdown: '# Hello', filename: 'doc.png' },
      hasResult: true,
    });

    render(<App />);

    expect(screen.getByText('# Hello')).toBeInTheDocument();
  });

  it('should show upload validation error', () => {
    useAppOrchestratorMock.mockReturnValue({
      ...defaultApp(),
      upload: { ...defaultApp().upload, error: 'Unsupported file type: application/pdf' },
    });

    render(<App />);

    expect(screen.getByText('Unsupported file type: application/pdf')).toBeInTheDocument();
  });

  it('should call handleProcess when Recognize is clicked', () => {
    const handleProcess = vi.fn();
    useAppOrchestratorMock.mockReturnValue({
      ...defaultApp(),
      upload: {
        ...defaultApp().upload,
        file: new File(['x'], 'photo.png', { type: 'image/png' }),
      },
      handleProcess,
    });

    render(<App />);
    fireEvent.click(screen.getByText('Recognize'));

    expect(handleProcess).toHaveBeenCalled();
  });

  it('should call handleReset when Clear is clicked', () => {
    const handleReset = vi.fn();
    useAppOrchestratorMock.mockReturnValue({
      ...defaultApp(),
      handleReset,
    });

    render(<App />);
    fireEvent.click(screen.getByText('Clear'));

    expect(handleReset).toHaveBeenCalled();
  });

  it('should pass save callback into ResultPanel', () => {
    const handleSave = vi.fn();
    useAppOrchestratorMock.mockReturnValue({
      ...defaultApp(),
      handleSave,
      displayedResult: { rawText: 'Hello', markdown: '# Hello', filename: 'doc.png' },
      hasResult: true,
    });

    render(<App />);
    fireEvent.click(screen.getByText('save-result'));

    expect(handleSave).toHaveBeenCalledWith('# saved markdown', 'doc.png');
  });

  it('should pass update and add-vocabulary callbacks into ResultPanel', () => {
    const handleUpdate = vi.fn();
    const handleAddVocabulary = vi.fn();
    useAppOrchestratorMock.mockReturnValue({
      ...defaultApp(),
      handleUpdate,
      handleAddVocabulary,
      displayedResult: { rawText: 'Hello', markdown: '# Hello', filename: 'doc.png' },
      hasResult: true,
    });

    render(<App />);

    fireEvent.click(screen.getByText('update-result'));
    fireEvent.click(screen.getByText('add-vocab'));

    expect(handleUpdate).toHaveBeenCalledWith('# updated markdown');
    expect(handleAddVocabulary).toHaveBeenCalledWith('hello', 'word', 'привет', 'Hello there.');
  });

  it('should forward history panel actions', async () => {
    const handleSelectSession = vi.fn();
    const handleDeleteSession = vi.fn();
    const handleSelectSaved = vi.fn();
    const handleDeleteSaved = vi.fn();
    const handleStartPractice = vi.fn();
    useAppOrchestratorMock.mockReturnValue({
      ...defaultApp(),
      handleSelectSession,
      handleDeleteSession,
      handleSelectSaved,
      handleDeleteSaved,
      handleStartPractice,
    });

    render(<App />);
    await waitFor(() => expect(screen.getByTestId('history-panel')).toBeInTheDocument());

    fireEvent.click(screen.getByText('select-session'));
    fireEvent.click(screen.getByText('delete-session'));
    fireEvent.click(screen.getByText('select-saved'));
    fireEvent.click(screen.getByText('delete-saved'));
    fireEvent.click(screen.getByText('start-practice'));

    expect(handleSelectSession).toHaveBeenCalledWith('session-1');
    expect(handleDeleteSession).toHaveBeenCalledWith('session-1');
    expect(handleSelectSaved).toHaveBeenCalledWith('saved-1');
    expect(handleDeleteSaved).toHaveBeenCalledWith('saved-1');
    expect(handleStartPractice).toHaveBeenCalled();
  });

  it('should render PracticeView and forward practice callbacks', async () => {
    const answer = vi.fn();
    const complete = vi.fn();
    const handlePracticeReset = vi.fn();
    useAppOrchestratorMock.mockReturnValue({
      ...defaultApp(),
      practice: {
        ...defaultApp().practice,
        phase: 'practicing',
        exercises: [{ id: '1' }],
        answer,
        complete,
      },
      handlePracticeReset,
    });

    render(<App />);

    await waitFor(() => expect(screen.getByText('practice-answer')).toBeInTheDocument());
    fireEvent.click(screen.getByText('practice-answer'));
    fireEvent.click(screen.getByText('practice-complete'));
    fireEvent.click(screen.getByText('practice-reset'));

    expect(answer).toHaveBeenCalledWith('typed answer');
    expect(complete).toHaveBeenCalled();
    expect(handlePracticeReset).toHaveBeenCalled();
  });
});
