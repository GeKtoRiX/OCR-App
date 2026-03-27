import { lazy, Suspense, useEffect, useState } from 'react';
import { useDocumentsStore } from './features/documents/documents.store';
import { useHealthStore } from './features/health/health.store';
import { DropZone } from './features/ocr/DropZone';
import { useImageUpload } from './features/ocr/useImageUpload';
import { useOcrStore } from './features/ocr/ocr.store';
import { TextInputPanel } from './features/ocr/TextInputPanel';
import { useTextInput } from './features/ocr/useTextInput';
import { usePracticeStore } from './features/practice/practice.store';
import { SaveVocabularyOverlay } from './features/vocabulary/SaveVocabularyOverlay';
import { useVocabularyStore } from './features/vocabulary/vocabulary.store';
import { formatFileSize } from './shared/lib/format';
import type { VocabType } from './shared/types';
import { StatusBar } from './ui/StatusBar';
import { ResultPanel } from './view/ResultPanel';

const HistoryPanel = lazy(() =>
  import('./view/HistoryPanel').then((module) => ({ default: module.HistoryPanel })),
);
const PracticeView = lazy(() =>
  import('./features/practice/PracticeView').then((module) => ({ default: module.PracticeView })),
);

export default function App() {
  const [saveVocabularyDocumentId, setSaveVocabularyDocumentId] = useState<string | null>(null);
  const [inputMode, setInputMode] = useState<'image' | 'text'>('image');
  const upload = useImageUpload();
  const textInput = useTextInput();
  const ocr = useOcrStore();
  const docs = useDocumentsStore();
  const vocab = useVocabularyStore();
  const practice = usePracticeStore();
  const health = useHealthStore();
  const loadDocuments = docs.load;
  const loadVocabulary = vocab.load;

  useEffect(() => {
    void loadDocuments();
  }, [loadDocuments]);

  useEffect(() => {
    void loadVocabulary();
  }, [loadVocabulary]);

  useEffect(() => {
    return health.startPolling();
  }, [health.startPolling]);

  const isProcessing = ocr.status === 'loading';

  const activeSavedDoc = docs.activeSavedId
    ? docs.documents.find((document) => document.id === docs.activeSavedId) ?? null
    : null;

  const displayedResult = activeSavedDoc
    ? {
        rawText: activeSavedDoc.markdown,
        markdown: activeSavedDoc.markdown,
        filename: activeSavedDoc.filename,
      }
    : ocr.activeHistoryId !== null
      ? ocr.entries.find((entry) => entry.id === ocr.activeHistoryId)?.result ?? null
      : ocr.result;

  const fileMeta = upload.file
    ? `${formatFileSize(upload.file.size)} · ${upload.file.type || 'image'}`
    : null;

  const uploadBadge =
    inputMode === 'image'
      ? upload.file
        ? 'File selected'
        : 'Awaiting file'
      : textInput.canSubmit
        ? 'Text ready'
        : 'Awaiting text';

  const handleProcess = () => {
    if (!upload.file) {
      return;
    }

    docs.clearSelection();
    void ocr.run(upload.file);
  };

  const handleReset = () => {
    if (inputMode === 'image') {
      upload.clear();
    } else {
      textInput.clear();
    }
    ocr.reset();
  };

  const handleLoadText = () => {
    if (!textInput.canSubmit) {
      return;
    }

    docs.clearSelection();
    ocr.submitText(textInput.text, textInput.filename);
    textInput.clear();
  };

  const handleInputModeChange = (nextMode: 'image' | 'text') => {
    if (nextMode === inputMode) {
      return;
    }

    if (nextMode === 'image') {
      textInput.clear();
    } else {
      upload.clear();
    }

    setInputMode(nextMode);
  };

  const handleSave = (markdown: string, filename: string) => {
    void docs.save(markdown, filename);
  };

  const handleSaveVocabulary = () => {
    if (!activeSavedDoc) {
      return;
    }
    docs.clearVocabularyReview();
    setSaveVocabularyDocumentId(activeSavedDoc.id);
  };

  const handleUpdate = docs.activeSavedId
    ? (markdown: string) => {
        void docs.update(docs.activeSavedId!, markdown);
      }
    : undefined;

  const handleAddVocabulary = (
    word: string,
    vocabType: VocabType,
    translation: string,
    contextSentence: string,
  ) => {
    void vocab.addWord(
      word,
      vocabType,
      translation,
      contextSentence,
      activeSavedDoc?.id,
    );
  };

  const handlePracticeReset = () => {
    practice.reset();
    void vocab.refresh();
  };

  return (
    <div className="app">
      <main className="workspace">
        <section className="panel panel--upload">
          <div className="panel__heading">
            <div>
              <span className="panel__eyebrow">Upload</span>
              <h2>Prepare source</h2>
            </div>
            <span className={`panel__badge ${uploadBadge !== 'Awaiting file' && uploadBadge !== 'Awaiting text' ? 'panel__badge--ready' : ''}`}>
              {uploadBadge}
            </span>
          </div>

          <div className="mode-toggle" role="tablist" aria-label="Input mode">
            <button
              className={`mode-toggle__btn ${inputMode === 'image' ? 'mode-toggle__btn--active' : ''}`}
              onClick={() => handleInputModeChange('image')}
              disabled={isProcessing}
              role="tab"
              aria-selected={inputMode === 'image'}
            >
              Image OCR
            </button>
            <button
              className={`mode-toggle__btn ${inputMode === 'text' ? 'mode-toggle__btn--active' : ''}`}
              onClick={() => handleInputModeChange('text')}
              disabled={isProcessing}
              role="tab"
              aria-selected={inputMode === 'text'}
            >
              Paste Text
            </button>
          </div>

          {inputMode === 'image' ? (
            <>
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
                <button className="btn btn--secondary" onClick={handleReset} disabled={isProcessing}>
                  Clear
                </button>
              </div>
            </>
          ) : (
            <>
              <TextInputPanel
                text={textInput.text}
                filename={textInput.filename}
                canSubmit={textInput.canSubmit}
                disabled={isProcessing}
                onTextChange={textInput.setText}
                onFilenameChange={textInput.setFilename}
                onSubmit={handleLoadText}
              />

              <div className="app__actions">
                <button className="btn btn--secondary" onClick={handleReset} disabled={isProcessing}>
                  Clear
                </button>
              </div>
            </>
          )}

          <StatusBar status={ocr.status} error={ocr.error} />
        </section>

        <aside className="sidebar">
          <Suspense fallback={<div className="panel-loading">Loading sidebar…</div>}>
            <HistoryPanel />
          </Suspense>
        </aside>

        <section className="panel panel--result">
          <div className="panel__heading">
            <div>
              <span className="panel__eyebrow">Result</span>
              <h2>Recognition output</h2>
            </div>
            <span className={`panel__badge ${displayedResult ? 'panel__badge--ready' : ''}`}>
              {displayedResult ? 'Ready' : 'Empty'}
            </span>
          </div>

          {displayedResult ? (
            <ResultPanel
              result={displayedResult}
              onSave={(markdown) => handleSave(markdown, displayedResult.filename)}
              onSaveVocabulary={activeSavedDoc ? handleSaveVocabulary : undefined}
              saveStatus={docs.saveStatus}
              onUpdate={handleUpdate}
              isSavedDocument={activeSavedDoc !== null}
              vocabularyDisabled={
                activeSavedDoc === null ||
                docs.vocabularyReviewStatus === 'preparing' ||
                docs.vocabularyReviewStatus === 'reviewing' ||
                docs.vocabularyReviewStatus === 'saving'
              }
              existingWordsSet={vocab.existingWordsSet}
              onAddVocabulary={handleAddVocabulary}
            />
          ) : (
            <div className="result-empty">
              <strong>Structured output will appear here</strong>
              <p>
                After processing, switch between Markdown and raw text and copy either
                format with one click.
              </p>
            </div>
          )}
        </section>
      </main>

      {practice.phase !== 'idle' && (
        <Suspense fallback={<div className="panel-loading">Loading practice…</div>}>
          <PracticeView
            phase={practice.phase}
            currentExercise={practice.currentExercise}
            currentIndex={practice.currentIndex}
            totalExercises={practice.exercises.length}
            lastAnswer={practice.lastAnswer}
            isLastExercise={practice.isLastExercise}
            analysis={practice.analysis}
            error={practice.error}
            onAnswer={(answer) => void practice.answer(answer)}
            onNext={practice.next}
            onComplete={() => void practice.complete()}
            onReset={handlePracticeReset}
          />
        </Suspense>
      )}

      {activeSavedDoc && saveVocabularyDocumentId === activeSavedDoc.id && (
        <SaveVocabularyOverlay
          document={activeSavedDoc}
          langPair={vocab.langPair}
          status={docs.vocabularyReviewStatus}
          candidates={docs.vocabularyReviewCandidates}
          error={docs.vocabularyReviewError}
          llmReviewApplied={docs.vocabularyReviewLlmApplied}
          confirmResult={docs.vocabularyConfirmResult}
          onPrepare={(llmReview) =>
            docs.prepareVocabulary(activeSavedDoc.id, {
              llmReview,
              targetLang: vocab.langPair.targetLang,
              nativeLang: vocab.langPair.nativeLang,
            })
          }
          onConfirm={async (items) => {
            const result = await docs.confirmVocabulary(activeSavedDoc.id, {
              targetLang: vocab.langPair.targetLang,
              nativeLang: vocab.langPair.nativeLang,
              items,
            });
            if (result) {
              await vocab.refresh();
            }
          }}
          onClose={() => {
            docs.clearVocabularyReview();
            setSaveVocabularyDocumentId(null);
          }}
        />
      )}
    </div>
  );
}
