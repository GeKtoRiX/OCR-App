import { useState, useEffect } from 'react';
import type { HistoryEntry, SavedDocument, VocabularyWord, LanguagePair } from '../model/types';
import type { LightColor } from '../model/health-status';
import { StatusLight } from './StatusLight';
import { VocabularyPanel } from './VocabularyPanel';
import './HistoryPanel.css';

type HistoryTab = 'session' | 'saved' | 'vocab';

export interface HealthProps {
  color: LightColor;
  label: string;
  tooltip: string;
}

export interface SavedDocsProps {
  documents: SavedDocument[];
  loading: boolean;
  activeId: string | null;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

export interface VocabProps {
  words: VocabularyWord[];
  loading: boolean;
  langPair: LanguagePair;
  dueCount: number;
  onLangPairChange: (lp: LanguagePair) => void;
  onDelete: (id: string) => void;
  onStartPractice: () => void;
}

interface Props {
  entries: HistoryEntry[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onDeleteSession: (id: string) => void;
  health: HealthProps;
  saved: SavedDocsProps;
  vocab: VocabProps;
}

interface ItemProps {
  entry: HistoryEntry;
  isActive: boolean;
  onSelect: (id: string) => void;
  onDelete: (id: string) => void;
}

function HistoryItem({ entry, isActive, onSelect, onDelete }: ItemProps) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  useEffect(() => {
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
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSelect(entry.id); }}
      aria-pressed={isActive}
    >
      <div className="history-item__thumb">
        {thumbUrl && <img src={thumbUrl} alt={entry.result.filename} />}
      </div>
      <div className="history-item__body">
        <span className="history-item__name">{entry.result.filename}</span>
        <span className="history-item__stats">
          {rawCount.toLocaleString('en-US')} raw · {mdCount.toLocaleString('en-US')} md
        </span>
      </div>
      <button
        className="history-item__delete"
        onClick={(e) => { e.stopPropagation(); onDelete(entry.id); }}
        title="Delete screenshot"
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
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') onSelect(doc.id); }}
      aria-pressed={isActive}
    >
      <div className="history-item__icon">📄</div>
      <div className="history-item__body">
        <span className="history-item__name">{doc.filename}</span>
        <span className="history-item__stats">
          {doc.markdown.length.toLocaleString('en-US')} chars · {date}
        </span>
      </div>
      <button
        className="history-item__delete"
        onClick={e => { e.stopPropagation(); onDelete(doc.id); }}
        title="Delete saved document"
        aria-label={`Delete ${doc.filename}`}
      >
        🗑
      </button>
    </li>
  );
}

export function HistoryPanel({
  entries,
  activeId,
  onSelect,
  onDeleteSession,
  health,
  saved,
  vocab,
}: Props) {
  const [tab, setTab] = useState<HistoryTab>('session');

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
              Saved {saved.documents.length > 0 && `(${saved.documents.length})`}
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
        <StatusLight color={health.color} label={health.label} tooltip={health.tooltip} />
      </div>

      {tab === 'session' ? (
        entries.length === 0 ? (
          <div className="history-empty">
            <p>No images processed yet.</p>
            <p>Recognize an image to see it here.</p>
          </div>
        ) : (
          <ul className="history-list">
            {entries.map(entry => (
              <HistoryItem
                key={entry.id}
                entry={entry}
                isActive={entry.id === activeId}
                onSelect={onSelect}
                onDelete={onDeleteSession}
              />
            ))}
          </ul>
        )
      ) : tab === 'saved' ? (
        saved.loading ? (
          <div className="history-empty">
            <p>Loading saved documents…</p>
          </div>
        ) : saved.documents.length === 0 ? (
          <div className="history-empty">
            <p>No saved documents yet.</p>
            <p>Use 💾 Save to keep OCR results.</p>
          </div>
        ) : (
          <ul className="history-list">
            {saved.documents.map(doc => (
              <SavedItem
                key={doc.id}
                doc={doc}
                isActive={doc.id === saved.activeId}
                onSelect={saved.onSelect}
                onDelete={saved.onDelete}
              />
            ))}
          </ul>
        )
      ) : (
        <VocabularyPanel
          words={vocab.words}
          loading={vocab.loading}
          langPair={vocab.langPair}
          dueCount={vocab.dueCount}
          onLangPairChange={vocab.onLangPairChange}
          onDelete={vocab.onDelete}
          onStartPractice={vocab.onStartPractice}
        />
      )}
    </section>
  );
}
