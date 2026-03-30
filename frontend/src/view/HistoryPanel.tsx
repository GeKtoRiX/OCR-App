import { useEffect, useState } from 'react';
import { useDocumentsStore } from '../features/documents/documents.store';
import { useHealthStore } from '../features/health/health.store';
import { useOcrStore } from '../features/ocr/ocr.store';
import { usePracticeStore } from '../features/practice/practice.store';
import { VocabularyPanel } from '../features/vocabulary/VocabularyPanel';
import { useVocabularyStore } from '../features/vocabulary/vocabulary.store';
import { HEALTH_LABELS } from '../shared/lib/health-status';
import type { HistoryEntry, SavedDocument } from '../shared/types';
import { StatusLight } from '../ui/StatusLight';
import './HistoryPanel.css';

type HistoryTab = 'session' | 'saved' | 'vocab';

interface ItemProps {
  entry: HistoryEntry;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

function HistoryItem({ entry, isActive, onSelect, onDelete }: ItemProps) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!entry.file) {
      setThumbUrl(null);
      return;
    }

    const url = URL.createObjectURL(entry.file);
    setThumbUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [entry.file]);

  const rawCount = entry.result.rawText.length;
  const mdCount = entry.result.markdown.length;

  return (
    <li
      className={`history-item history-item--session history-item--deletable ${isActive ? 'history-item--active' : ''}`}
      onClick={() => onSelect(entry.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          onSelect(entry.id);
        }
      }}
      aria-pressed={isActive}
    >
      <div className="history-item__thumb">
        {thumbUrl ? (
          <img src={thumbUrl} alt={entry.result.filename} />
        ) : (
          <span className="history-item__icon" aria-hidden="true">
            📄
          </span>
        )}
      </div>
      <div className="history-item__body">
        <span className="history-item__name">{entry.result.filename}</span>
        <span className="history-item__stats">
          {rawCount.toLocaleString('en-US')} raw · {mdCount.toLocaleString('en-US')} md
        </span>
      </div>
      <button
        className="history-item__delete"
        onClick={(event) => {
          event.stopPropagation();
          onDelete(entry.id);
        }}
        title="Delete session result"
        aria-label={`Delete ${entry.result.filename}`}
      >
        🗑
      </button>
    </li>
  );
}

interface SavedItemProps {
  doc: SavedDocument;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

function SavedItem({ doc, isActive, onSelect, onDelete }: SavedItemProps) {
  const date = new Date(doc.updatedAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <li
      className={`history-item history-item--saved history-item--deletable ${isActive ? 'history-item--active' : ''}`}
      onClick={() => onSelect(doc.id)}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          onSelect(doc.id);
        }
      }}
      aria-pressed={isActive}
    >
      <div className="history-item__icon">📄</div>
      <div className="history-item__body">
        <span className="history-item__name">{doc.filename}</span>
        <span className="history-item__stats">
          {doc.markdown.length.toLocaleString('en-US')} chars · {doc.analysisStatus} · {date}
        </span>
      </div>
      <button
        className="history-item__delete"
        onClick={(event) => {
          event.stopPropagation();
          onDelete(doc.id);
        }}
        title="Delete saved document"
        aria-label={`Delete ${doc.filename}`}
      >
        🗑
      </button>
    </li>
  );
}

export function HistoryPanel() {
  const [tab, setTab] = useState<HistoryTab>('session');
  const ocr = useOcrStore();
  const docs = useDocumentsStore();
  const vocab = useVocabularyStore();
  const health = useHealthStore();
  const practice = usePracticeStore();

  const handleSelectSession = (id: string) => {
    ocr.selectEntry(id);
    docs.clearSelection();
  };

  const handleSelectSaved = (id: string) => {
    docs.selectDocument(id);
  };

  const handleDeleteSaved = (id: string) => {
    void docs.remove(id);
  };

  const handleDeleteSession = (id: string) => {
    ocr.removeEntry(id);
  };

  const handleVocabDelete = (id: string) => {
    void vocab.removeWord(id);
  };

  const handleStartPractice = () => {
    void practice.start(vocab.langPair.targetLang, vocab.langPair.nativeLang);
  };

  return (
    <section className="panel panel--notes">
      <div className="panel__heading">
        <div>
          <span className="panel__eyebrow">History</span>
          <div className="history-tabs">
            <button
              className={`history-tabs__btn ${tab === 'session' ? 'history-tabs__btn--active' : ''}`}
              onClick={() => setTab('session')}
              data-testid="history-tab-session"
            >
              Session
            </button>
            <button
              className={`history-tabs__btn ${tab === 'saved' ? 'history-tabs__btn--active' : ''}`}
              onClick={() => setTab('saved')}
              data-testid="history-tab-saved"
            >
              Saved {docs.documents.length > 0 && `(${docs.documents.length})`}
            </button>
            <button
              className={`history-tabs__btn ${tab === 'vocab' ? 'history-tabs__btn--active' : ''}`}
              onClick={() => setTab('vocab')}
              data-testid="history-tab-vocab"
            >
              Vocab {vocab.words.length > 0 && `(${vocab.words.length})`}
            </button>
          </div>
        </div>
        <StatusLight
          color={health.color}
          label={HEALTH_LABELS[health.color]}
          tooltip={health.tooltip}
        />
      </div>

      {tab === 'session' ? (
        ocr.entries.length === 0 ? (
          <div className="history-empty">
            <p>No session results yet.</p>
            <p>Recognize an image or load pasted text to see it here.</p>
          </div>
        ) : (
          <ul className="history-list">
            {ocr.entries.map((entry) => (
              <HistoryItem
                key={entry.id}
                entry={entry}
                isActive={docs.activeSavedId === null && entry.id === ocr.activeHistoryId}
                onSelect={handleSelectSession}
                onDelete={handleDeleteSession}
              />
            ))}
          </ul>
        )
      ) : tab === 'saved' ? (
        docs.loading ? (
          <div className="history-empty">
            <p>Loading saved documents…</p>
          </div>
        ) : docs.documents.length === 0 ? (
          <div className="history-empty">
            <p>No saved documents yet.</p>
            <p>Use Save Document to keep OCR or pasted text results.</p>
          </div>
        ) : (
          <>
            {docs.error && (
              <div className="history-empty" style={{ color: 'var(--error, #f87171)', borderStyle: 'solid' }}>
                {docs.error}
              </div>
            )}
            <ul className="history-list">
              {docs.documents.map((doc) => (
                <SavedItem
                  key={doc.id}
                  doc={doc}
                  isActive={doc.id === docs.activeSavedId}
                  onSelect={handleSelectSaved}
                  onDelete={handleDeleteSaved}
                />
              ))}
            </ul>
          </>
        )
      ) : (
        <VocabularyPanel
          words={vocab.words}
          loading={vocab.loading}
          langPair={vocab.langPair}
          dueCount={vocab.dueCount}
          onLangPairChange={vocab.setLangPair}
          onDelete={handleVocabDelete}
          onStartPractice={handleStartPractice}
        />
      )}
    </section>
  );
}
