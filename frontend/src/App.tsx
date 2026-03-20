import { useState, useRef, useEffect } from 'react';
import { useImageUpload } from './viewmodel/useImageUpload';
import { useOCR } from './viewmodel/useOCR';
import { useHealthStatus } from './viewmodel/useHealthStatus';
import { useSessionHistory } from './viewmodel/useSessionHistory';
import { useSavedDocuments } from './viewmodel/useSavedDocuments';
import { useVocabulary } from './viewmodel/useVocabulary';
import { usePractice } from './viewmodel/usePractice';
import { DropZone } from './view/DropZone';
import { ResultPanel } from './view/ResultPanel';
import { StatusBar } from './view/StatusBar';
import { HistoryPanel } from './view/HistoryPanel';
import { PracticeView } from './view/PracticeView';

function formatFileSize(size: number) {
  if (size < 1024 * 1024) {
    return `${Math.round(size / 1024)} KB`;
  }

  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

const HEALTH_LABELS = {
  blue: 'All systems ready',
  green: 'OCR ready',
  yellow: 'CPU mode',
  red: 'Service issue',
} as const;

export default function App() {
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
    vocabType: Parameters<typeof vocab.addWord>[1],
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

  // Determine what to display
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

  return (
    <div className="app">
      <main className="workspace">
        <section className="panel panel--upload">
          <div className="panel__heading">
            <div>
              <span className="panel__eyebrow">Upload</span>
              <h2>Prepare source image</h2>
            </div>
            <span className={`panel__badge ${upload.file ? 'panel__badge--ready' : ''}`}>
              {upload.file ? 'File selected' : 'Awaiting file'}
            </span>
          </div>

          <DropZone
            preview={upload.preview}
            fileName={upload.file?.name ?? null}
            fileMeta={fileMeta}
            onFileChange={upload.onFileChange}
            onDrop={upload.onDrop}
            disabled={isProcessing}
          />

          {upload.error && <div className="inline-alert inline-alert--error">{upload.error}</div>}

          <div className="app__actions">
            <button
              className="btn btn--primary"
              onClick={handleProcess}
              disabled={!upload.file || isProcessing}
            >
              {isProcessing ? 'Processing…' : 'Recognize'}
            </button>
            <button
              className="btn btn--secondary"
              onClick={handleReset}
              disabled={isProcessing}
            >
              Clear
            </button>
          </div>

          <StatusBar status={ocr.status} error={ocr.error} />
        </section>

        <aside className="sidebar">
          <HistoryPanel
            entries={history.entries}
            activeId={activeSavedId ? null : history.activeId}
            onSelect={handleSelectSession}
            healthColor={health.color}
            healthLabel={HEALTH_LABELS[health.color]}
            healthTooltip={health.tooltip}
            savedDocuments={savedDocs.documents}
            savedLoading={savedDocs.loading}
            activeSavedId={activeSavedId}
            onSelectSaved={handleSelectSaved}
            onDeleteSaved={handleDeleteSaved}
            vocabWords={vocab.words}
            vocabLoading={vocab.loading}
            vocabLangPair={vocab.langPair}
            vocabDueCount={vocab.dueCount}
            onVocabLangPairChange={vocab.setLangPair}
            onVocabDelete={(id) => void vocab.removeWord(id)}
            onStartPractice={handleStartPractice}
          />
        </aside>

        <section className="panel panel--result">
          <div className="panel__heading">
            <div>
              <span className="panel__eyebrow">Result</span>
              <h2>Recognition output</h2>
            </div>
            <span className={`panel__badge ${hasResult ? 'panel__badge--ready' : ''}`}>
              {hasResult ? 'Ready' : 'Empty'}
            </span>
          </div>

          {displayedResult ? (
            <ResultPanel
              result={displayedResult}
              onSave={(markdown) => void savedDocs.save(markdown, displayedResult.filename)}
              saveStatus={savedDocs.saveStatus}
              onUpdate={activeSavedId ? (markdown) => void savedDocs.update(activeSavedId, markdown) : undefined}
              isSavedDocument={isSavedDocument}
              existingWordsSet={vocab.existingWordsSet}
              onAddVocabulary={handleAddVocabulary}
            />
          ) : (
            <div className="result-empty">
              <strong>Structured output will appear here</strong>
              <p>
                After processing, switch between Markdown and raw text and copy either format with one click.
              </p>
            </div>
          )}
        </section>
      </main>

      {practice.phase !== 'idle' && (
        <PracticeView
          phase={practice.phase}
          currentExercise={practice.currentExercise}
          currentIndex={practice.currentIndex}
          totalExercises={practice.exercises.length}
          lastAnswer={practice.lastAnswer}
          isLastExercise={practice.isLastExercise}
          analysis={practice.analysis}
          error={practice.error}
          onAnswer={(a) => void practice.answer(a)}
          onNext={practice.next}
          onComplete={() => void practice.complete()}
          onReset={handlePracticeReset}
        />
      )}
    </div>
  );
}
