import { useState, useRef, useEffect } from 'react';
import { useImageUpload } from './useImageUpload';
import { useOCR } from './useOCR';
import { useHealthStatus } from './useHealthStatus';
import { useSessionHistory } from './useSessionHistory';
import { useSavedDocuments } from './useSavedDocuments';
import { useVocabulary } from './useVocabulary';
import { usePractice } from './usePractice';
import type { VocabType } from '../model/types';

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export const HEALTH_LABELS = {
  blue: 'All systems ready',
  green: 'OCR ready',
  yellow: 'CPU mode',
  red: 'Service issue',
} as const;

export function useAppOrchestrator() {
  const upload = useImageUpload();
  const ocr = useOCR();
  const health = useHealthStatus();
  const history = useSessionHistory();
  const savedDocs = useSavedDocuments();
  const vocab = useVocabulary();
  const practice = usePractice();
  const pendingFileRef = useRef<File | null>(null);
  const [activeSavedId, setActiveSavedId] = useState<string | null>(null);

  const handleProcess = () => {
    if (upload.file) {
      pendingFileRef.current = upload.file;
      ocr.run(upload.file);
    }
  };

  const handleReset = () => {
    upload.clear();
    ocr.reset();
  };

  useEffect(() => {
    if (ocr.status === 'success' && ocr.result !== null && pendingFileRef.current !== null) {
      history.addEntry(pendingFileRef.current, ocr.result);
      pendingFileRef.current = null;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ocr.status, ocr.result]);

  const handleSelectSession = (id: string) => {
    history.selectEntry(id);
    setActiveSavedId(null);
  };

  const handleDeleteSession = (id: string) => {
    history.removeEntry(id);
  };

  const handleSelectSaved = (id: string) => {
    setActiveSavedId(id);
  };

  const handleDeleteSaved = async (id: string) => {
    const deleted = await savedDocs.remove(id);
    if (deleted && activeSavedId === id) {
      setActiveSavedId(null);
    }
  };

  const handleAddVocabulary = async (
    word: string,
    vocabType: VocabType,
    translation: string,
    contextSentence: string,
  ) => {
    await vocab.addWord(word, vocabType, translation, contextSentence);
  };

  const handleStartPractice = () => {
    void practice.start(vocab.langPair.targetLang, vocab.langPair.nativeLang);
  };

  const handlePracticeReset = () => {
    practice.reset();
    void vocab.refresh();
  };

  const isProcessing = ocr.status === 'loading';

  const activeSavedDoc = activeSavedId
    ? savedDocs.documents.find(d => d.id === activeSavedId) ?? null
    : null;

  const displayedResult = activeSavedDoc
    ? { rawText: activeSavedDoc.markdown, markdown: activeSavedDoc.markdown, filename: activeSavedDoc.filename }
    : history.activeId !== null
      ? (history.entries.find(e => e.id === history.activeId)?.result ?? null)
      : ocr.result;

  const isSavedDocument = activeSavedDoc !== null;
  const hasResult = displayedResult !== null;
  const fileMeta = upload.file
    ? `${formatFileSize(upload.file.size)} · ${upload.file.type || 'image'}`
    : null;

  return {
    // Upload
    upload,

    // OCR
    ocrStatus: ocr.status,
    ocrError: ocr.error,
    isProcessing,

    // Health
    healthColor: health.color,
    healthLabel: HEALTH_LABELS[health.color],
    healthTooltip: health.tooltip,

    // History
    historyEntries: history.entries,
    historyActiveId: activeSavedId ? null : history.activeId,

    // Saved documents
    savedDocuments: savedDocs.documents,
    savedLoading: savedDocs.loading,
    savedSaveStatus: savedDocs.saveStatus,
    activeSavedId,
    handleSave: (markdown: string, filename: string) => void savedDocs.save(markdown, filename),
    handleUpdate: activeSavedId
      ? (markdown: string) => void savedDocs.update(activeSavedId, markdown)
      : undefined,

    // Vocabulary
    vocabWords: vocab.words,
    vocabLoading: vocab.loading,
    vocabLangPair: vocab.langPair,
    vocabDueCount: vocab.dueCount,
    vocabExistingWordsSet: vocab.existingWordsSet,
    onVocabLangPairChange: vocab.setLangPair,
    onVocabDelete: (id: string) => void vocab.removeWord(id),

    // Practice
    practice,

    // Display
    displayedResult,
    isSavedDocument,
    hasResult,
    fileMeta,

    // Handlers
    handleProcess,
    handleReset,
    handleSelectSession,
    handleDeleteSession,
    handleSelectSaved,
    handleDeleteSaved,
    handleAddVocabulary,
    handleStartPractice,
    handlePracticeReset,
  };
}
