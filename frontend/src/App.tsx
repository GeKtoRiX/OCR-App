import { lazy, Suspense } from 'react';
import { useAppOrchestrator } from './viewmodel/useAppOrchestrator';
import { DropZone } from './view/DropZone';
import { ResultPanel } from './view/ResultPanel';
import { StatusBar } from './view/StatusBar';

const HistoryPanel = lazy(() =>
  import('./view/HistoryPanel').then((m) => ({ default: m.HistoryPanel })),
);
const PracticeView = lazy(() =>
  import('./view/PracticeView').then((m) => ({ default: m.PracticeView })),
);

export default function App() {
  const app = useAppOrchestrator();

  return (
    <div className="app">
      <main className="workspace">
        <section className="panel panel--upload">
          <div className="panel__heading">
            <div>
              <span className="panel__eyebrow">Upload</span>
              <h2>Prepare source image</h2>
            </div>
            <span className={`panel__badge ${app.upload.file ? 'panel__badge--ready' : ''}`}>
              {app.upload.file ? 'File selected' : 'Awaiting file'}
            </span>
          </div>

          <DropZone
            preview={app.upload.preview}
            fileName={app.upload.file?.name ?? null}
            fileMeta={app.fileMeta}
            onFileChange={app.upload.onFileChange}
            onDrop={app.upload.onDrop}
            disabled={app.isProcessing}
          />

          {app.upload.error && <div className="inline-alert inline-alert--error">{app.upload.error}</div>}

          <div className="app__actions">
            <button
              className="btn btn--primary"
              onClick={app.handleProcess}
              disabled={!app.upload.file || app.isProcessing}
            >
              {app.isProcessing ? 'Processing\u2026' : 'Recognize'}
            </button>
            <button
              className="btn btn--secondary"
              onClick={app.handleReset}
              disabled={app.isProcessing}
            >
              Clear
            </button>
          </div>

          <StatusBar status={app.ocrStatus} error={app.ocrError} />
        </section>

        <aside className="sidebar">
          <Suspense fallback={<div className="panel-loading">Loading sidebar…</div>}>
            <HistoryPanel
              entries={app.historyEntries}
              activeId={app.historyActiveId}
              onSelect={app.handleSelectSession}
              onDeleteSession={app.handleDeleteSession}
              health={{
                color: app.healthColor,
                label: app.healthLabel,
                tooltip: app.healthTooltip,
              }}
              saved={{
                documents: app.savedDocuments,
                loading: app.savedLoading,
                activeId: app.activeSavedId,
                onSelect: app.handleSelectSaved,
                onDelete: app.handleDeleteSaved,
              }}
              vocab={{
                words: app.vocabWords,
                loading: app.vocabLoading,
                langPair: app.vocabLangPair,
                dueCount: app.vocabDueCount,
                onLangPairChange: app.onVocabLangPairChange,
                onDelete: app.onVocabDelete,
                onStartPractice: app.handleStartPractice,
              }}
            />
          </Suspense>
        </aside>

        <section className="panel panel--result">
          <div className="panel__heading">
            <div>
              <span className="panel__eyebrow">Result</span>
              <h2>Recognition output</h2>
            </div>
            <span className={`panel__badge ${app.hasResult ? 'panel__badge--ready' : ''}`}>
              {app.hasResult ? 'Ready' : 'Empty'}
            </span>
          </div>

          {app.displayedResult ? (
            <ResultPanel
              result={app.displayedResult}
              onSave={(markdown) => app.handleSave(markdown, app.displayedResult!.filename)}
              saveStatus={app.savedSaveStatus}
              onUpdate={app.handleUpdate}
              isSavedDocument={app.isSavedDocument}
              existingWordsSet={app.vocabExistingWordsSet}
              onAddVocabulary={app.handleAddVocabulary}
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

      {app.practice.phase !== 'idle' && (
        <Suspense fallback={<div className="panel-loading">Loading practice…</div>}>
          <PracticeView
            phase={app.practice.phase}
            currentExercise={app.practice.currentExercise}
            currentIndex={app.practice.currentIndex}
            totalExercises={app.practice.exercises.length}
            lastAnswer={app.practice.lastAnswer}
            isLastExercise={app.practice.isLastExercise}
            analysis={app.practice.analysis}
            error={app.practice.error}
            onAnswer={(a) => void app.practice.answer(a)}
            onNext={app.practice.next}
            onComplete={() => void app.practice.complete()}
            onReset={app.handlePracticeReset}
          />
        </Suspense>
      )}
    </div>
  );
}
