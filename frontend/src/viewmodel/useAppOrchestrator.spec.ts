import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppOrchestrator, HEALTH_LABELS } from './useAppOrchestrator';

vi.mock('./useImageUpload', () => ({
  useImageUpload: vi.fn(),
}));
vi.mock('./useOCR', () => ({
  useOCR: vi.fn(),
}));
vi.mock('./useHealthStatus', () => ({
  useHealthStatus: vi.fn(),
}));
vi.mock('./useSessionHistory', () => ({
  useSessionHistory: vi.fn(),
}));
vi.mock('./useSavedDocuments', () => ({
  useSavedDocuments: vi.fn(),
}));
vi.mock('./useVocabulary', () => ({
  useVocabulary: vi.fn(),
}));
vi.mock('./usePractice', () => ({
  usePractice: vi.fn(),
}));

import { useImageUpload } from './useImageUpload';
import { useOCR } from './useOCR';
import { useHealthStatus } from './useHealthStatus';
import { useSessionHistory } from './useSessionHistory';
import { useSavedDocuments } from './useSavedDocuments';
import { useVocabulary } from './useVocabulary';
import { usePractice } from './usePractice';

const mockFile = new File(['test'], 'test.png', { type: 'image/png' });

function setupMocks(overrides: Record<string, unknown> = {}) {
  const uploadMock = {
    file: null,
    preview: null,
    error: null,
    onFileChange: vi.fn(),
    onDrop: vi.fn(),
    clear: vi.fn(),
    ...overrides.upload as object,
  };

  const ocrMock = {
    status: 'idle' as const,
    result: null,
    error: null,
    run: vi.fn(),
    reset: vi.fn(),
    ...overrides.ocr as object,
  };

  const healthMock = {
    color: 'red' as const,
    tooltip: 'Checking...',
    ...overrides.health as object,
  };

  const historyMock = {
    entries: [],
    activeId: null,
    addEntry: vi.fn(),
    selectEntry: vi.fn(),
    removeEntry: vi.fn(),
    ...overrides.history as object,
  };

  const savedDocsMock = {
    documents: [],
    loading: false,
    saveStatus: 'idle' as const,
    save: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
    ...overrides.savedDocs as object,
  };

  const vocabMock = {
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
    existingWordsSet: new Set<string>(),
    ...overrides.vocab as object,
  };

  const practiceMock = {
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
    ...overrides.practice as object,
  };

  vi.mocked(useImageUpload).mockReturnValue(uploadMock);
  vi.mocked(useOCR).mockReturnValue(ocrMock);
  vi.mocked(useHealthStatus).mockReturnValue(healthMock);
  vi.mocked(useSessionHistory).mockReturnValue(historyMock);
  vi.mocked(useSavedDocuments).mockReturnValue(savedDocsMock);
  vi.mocked(useVocabulary).mockReturnValue(vocabMock);
  vi.mocked(usePractice).mockReturnValue(practiceMock);

  return { uploadMock, ocrMock, healthMock, historyMock, savedDocsMock, vocabMock, practiceMock };
}

describe('useAppOrchestrator', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('exposes isProcessing when OCR is loading', () => {
    setupMocks({ ocr: { status: 'loading', result: null, error: null, run: vi.fn(), reset: vi.fn() } });

    const { result } = renderHook(() => useAppOrchestrator());

    expect(result.current.isProcessing).toBe(true);
  });

  it('maps health color to label', () => {
    setupMocks({ health: { color: 'blue', tooltip: 'All OK' } });

    const { result } = renderHook(() => useAppOrchestrator());

    expect(result.current.healthLabel).toBe(HEALTH_LABELS.blue);
  });

  describe('displayedResult priority', () => {
    it('shows saved document when activeSavedId is set', () => {
      const doc = { id: 'saved-1', filename: 'doc.png', markdown: '# Hello', createdAt: '', updatedAt: '' };
      const mocks = setupMocks({ savedDocs: { documents: [doc], loading: false, saveStatus: 'idle', save: vi.fn(), update: vi.fn(), remove: vi.fn() } });

      const { result, rerender } = renderHook(() => useAppOrchestrator());

      act(() => {
        result.current.handleSelectSaved('saved-1');
      });
      rerender();

      expect(result.current.displayedResult).toEqual({
        rawText: '# Hello',
        markdown: '# Hello',
        filename: 'doc.png',
      });
      expect(result.current.isSavedDocument).toBe(true);
    });

    it('shows history entry when history activeId is set', () => {
      const ocrResult = { rawText: 'raw', markdown: 'md', filename: 'test.png' };
      setupMocks({
        history: {
          entries: [{ id: 'h1', file: mockFile, result: ocrResult, processedAt: new Date() }],
          activeId: 'h1',
          addEntry: vi.fn(),
          selectEntry: vi.fn(),
        },
      });

      const { result } = renderHook(() => useAppOrchestrator());

      expect(result.current.displayedResult).toEqual(ocrResult);
    });

    it('falls back to OCR result', () => {
      const ocrResult = { rawText: 'raw', markdown: 'md', filename: 'img.png' };
      setupMocks({ ocr: { status: 'success', result: ocrResult, error: null, run: vi.fn(), reset: vi.fn() } });

      const { result } = renderHook(() => useAppOrchestrator());

      expect(result.current.displayedResult).toEqual(ocrResult);
    });

    it('returns null when nothing is active', () => {
      setupMocks();

      const { result } = renderHook(() => useAppOrchestrator());

      expect(result.current.displayedResult).toBeNull();
      expect(result.current.hasResult).toBe(false);
    });
  });

  describe('handleProcess', () => {
    it('calls ocr.run with the uploaded file', () => {
      const mocks = setupMocks({ upload: { file: mockFile, preview: 'url', error: null, onFileChange: vi.fn(), onDrop: vi.fn(), clear: vi.fn() } });

      const { result } = renderHook(() => useAppOrchestrator());
      result.current.handleProcess();

      expect(mocks.ocrMock.run).toHaveBeenCalledWith(mockFile);
    });
  });

  describe('handleReset', () => {
    it('calls upload.clear and ocr.reset', () => {
      const mocks = setupMocks();

      const { result } = renderHook(() => useAppOrchestrator());
      result.current.handleReset();

      expect(mocks.uploadMock.clear).toHaveBeenCalled();
      expect(mocks.ocrMock.reset).toHaveBeenCalled();
    });
  });

  describe('handleSelectSession', () => {
    it('selects history entry and clears saved id', () => {
      const mocks = setupMocks();

      const { result } = renderHook(() => useAppOrchestrator());

      act(() => {
        result.current.handleSelectSaved('saved-1');
      });
      act(() => {
        result.current.handleSelectSession('h1');
      });

      expect(mocks.historyMock.selectEntry).toHaveBeenCalledWith('h1');
      expect(result.current.activeSavedId).toBeNull();
    });
  });

  describe('handleDeleteSession', () => {
    it('removes a history entry', () => {
      const mocks = setupMocks();

      const { result } = renderHook(() => useAppOrchestrator());

      act(() => {
        result.current.handleDeleteSession('h1');
      });

      expect(mocks.historyMock.removeEntry).toHaveBeenCalledWith('h1');
    });
  });

  describe('handlePracticeReset', () => {
    it('resets practice and refreshes vocabulary', () => {
      const mocks = setupMocks();

      const { result } = renderHook(() => useAppOrchestrator());
      result.current.handlePracticeReset();

      expect(mocks.practiceMock.reset).toHaveBeenCalled();
      expect(mocks.vocabMock.refresh).toHaveBeenCalled();
    });
  });

  it('formats file meta correctly', () => {
    const bigFile = new File(['x'.repeat(2 * 1024 * 1024)], 'big.png', { type: 'image/png' });
    setupMocks({ upload: { file: bigFile, preview: 'url', error: null, onFileChange: vi.fn(), onDrop: vi.fn(), clear: vi.fn() } });

    const { result } = renderHook(() => useAppOrchestrator());

    expect(result.current.fileMeta).toContain('MB');
    expect(result.current.fileMeta).toContain('image/png');
  });
});
