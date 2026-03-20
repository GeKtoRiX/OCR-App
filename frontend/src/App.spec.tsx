import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import App from './App';

const useImageUploadMock = vi.fn();
const useOCRMock = vi.fn();
const useHealthStatusMock = vi.fn();
const useSessionHistoryMock = vi.fn();
const useSavedDocumentsMock = vi.fn();
const useVocabularyMock = vi.fn();
const usePracticeMock = vi.fn();

vi.mock('./viewmodel/useImageUpload', () => ({
  useImageUpload: () => useImageUploadMock(),
}));

vi.mock('./viewmodel/useOCR', () => ({
  useOCR: () => useOCRMock(),
}));

vi.mock('./viewmodel/useHealthStatus', () => ({
  useHealthStatus: () => useHealthStatusMock(),
}));

vi.mock('./viewmodel/useSessionHistory', () => ({
  useSessionHistory: () => useSessionHistoryMock(),
}));

vi.mock('./viewmodel/useSavedDocuments', () => ({
  useSavedDocuments: () => useSavedDocumentsMock(),
}));

vi.mock('./viewmodel/useVocabulary', () => ({
  useVocabulary: () => useVocabularyMock(),
}));

vi.mock('./viewmodel/usePractice', () => ({
  usePractice: () => usePracticeMock(),
}));

const defaultUpload = () => ({
  file: null,
  preview: null,
  error: null,
  onFileChange: vi.fn(),
  onDrop: vi.fn(),
  clear: vi.fn(),
});

const defaultOcr = () => ({
  status: 'idle' as const,
  result: null,
  error: null,
  run: vi.fn(),
  reset: vi.fn(),
});

describe('App', () => {
  beforeEach(() => {
    global.URL.createObjectURL = vi.fn(() => 'blob:test');
    global.URL.revokeObjectURL = vi.fn();

    useImageUploadMock.mockReturnValue(defaultUpload());
    useOCRMock.mockReturnValue(defaultOcr());
    useHealthStatusMock.mockReturnValue({ color: 'blue', tooltip: 'All OK' });
    useSessionHistoryMock.mockReturnValue({
      entries: [],
      activeId: null,
      addEntry: vi.fn(),
      selectEntry: vi.fn(),
    });
    useSavedDocumentsMock.mockReturnValue({
      documents: [],
      loading: false,
      saveStatus: 'idle',
      error: null,
      save: vi.fn(),
      update: vi.fn(),
      remove: vi.fn(),
      refresh: vi.fn(),
    });
    useVocabularyMock.mockReturnValue({
      words: [],
      loading: false,
      error: null,
      langPair: { targetLang: 'en', nativeLang: 'ru' },
      setLangPair: vi.fn(),
      dueCount: 0,
      addWord: vi.fn(),
      removeWord: vi.fn(),
      updateWord: vi.fn(),
      refresh: vi.fn(),
      existingWordsSet: new Set(),
    });
    usePracticeMock.mockReturnValue({
      phase: 'idle',
      sessionId: null,
      exercises: [],
      currentIndex: 0,
      currentExercise: null,
      answers: [],
      lastAnswer: null,
      analysis: null,
      error: null,
      isLastExercise: false,
      start: vi.fn(),
      answer: vi.fn(),
      next: vi.fn(),
      complete: vi.fn(),
      reset: vi.fn(),
    });
  });

  it('should render section headings', () => {
    render(<App />);

    expect(screen.getByText('Prepare source image')).toBeInTheDocument();
    expect(screen.getByText('Recognition output')).toBeInTheDocument();
    expect(screen.getByText('Session')).toBeInTheDocument();
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
    useImageUploadMock.mockReturnValue({
      ...defaultUpload(),
      file: new File(['x'], 'photo.png', { type: 'image/png' }),
    });

    render(<App />);

    expect(screen.getByText('Recognize')).not.toBeDisabled();
  });

  it('should show "Awaiting file" badge when no file is selected', () => {
    render(<App />);

    expect(screen.getByText('Awaiting file')).toBeInTheDocument();
  });

  it('should show "File selected" badge when a file is ready', () => {
    useImageUploadMock.mockReturnValue({
      ...defaultUpload(),
      file: new File(['x'], 'photo.png', { type: 'image/png' }),
    });

    render(<App />);

    expect(screen.getByText('File selected')).toBeInTheDocument();
  });

  it('should show "Processing…" on button during OCR', () => {
    useImageUploadMock.mockReturnValue({
      ...defaultUpload(),
      file: new File(['x'], 'photo.png', { type: 'image/png' }),
    });
    useOCRMock.mockReturnValue({ ...defaultOcr(), status: 'loading' });

    render(<App />);

    expect(screen.getByText('Processing…')).toBeInTheDocument();
  });

  it('should render result placeholder when no result', () => {
    render(<App />);

    expect(screen.getByText('Structured output will appear here')).toBeInTheDocument();
  });

  it('should render ResultPanel when OCR result is available', () => {
    useOCRMock.mockReturnValue({
      ...defaultOcr(),
      status: 'success',
      result: { rawText: 'Hello', markdown: '# Hello', filename: 'doc.png' },
    });

    render(<App />);

    expect(screen.getByText('# Hello')).toBeInTheDocument();
  });

  it('should show upload validation error', () => {
    useImageUploadMock.mockReturnValue({
      ...defaultUpload(),
      error: 'Unsupported file type: application/pdf',
    });

    render(<App />);

    expect(screen.getByText('Unsupported file type: application/pdf')).toBeInTheDocument();
  });

  it('should call ocr.run when Recognize is clicked', () => {
    const run = vi.fn();
    const file = new File(['x'], 'photo.png', { type: 'image/png' });
    useImageUploadMock.mockReturnValue({ ...defaultUpload(), file });
    useOCRMock.mockReturnValue({ ...defaultOcr(), run });

    render(<App />);
    fireEvent.click(screen.getByText('Recognize'));

    expect(run).toHaveBeenCalledWith(file);
  });

  it('should call upload.clear and ocr.reset when Clear is clicked', () => {
    const clear = vi.fn();
    const reset = vi.fn();
    useImageUploadMock.mockReturnValue({ ...defaultUpload(), clear });
    useOCRMock.mockReturnValue({ ...defaultOcr(), reset });

    render(<App />);
    fireEvent.click(screen.getByText('Clear'));

    expect(clear).toHaveBeenCalled();
    expect(reset).toHaveBeenCalled();
  });
});
