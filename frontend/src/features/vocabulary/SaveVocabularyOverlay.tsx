import { useEffect, useRef, useState } from 'react';
import type {
  ConfirmDocumentVocabularyResult,
  DocumentVocabCandidate,
  LanguagePair,
  SavedDocument,
  VocabType,
} from '../../shared/types';
import { VOCAB_TYPE_LABELS } from '../../shared/types';
import type { VocabularyReviewStatus } from '../documents';
import './SaveVocabularyOverlay.css';

const LLM_REVIEW_STORAGE_KEY = 'ocr-app.save-vocabulary.llm-review.enabled';

interface EditableCandidate extends DocumentVocabCandidate {
  checked: boolean;
  word: string;
}

const BUSY_STATUSES: VocabularyReviewStatus[] = ['preparing', 'reviewing', 'saving'];

interface Props {
  document: SavedDocument;
  langPair: LanguagePair;
  status: VocabularyReviewStatus;
  candidates: DocumentVocabCandidate[];
  error: string | null;
  llmReviewApplied: boolean;
  confirmResult: ConfirmDocumentVocabularyResult | null;
  onPrepare: (llmReview: boolean) => Promise<DocumentVocabCandidate[]>;
  onConfirm: (items: Array<{
    candidateId: string;
    word: string;
    vocabType: VocabType;
    translation: string;
    contextSentence: string;
  }>) => Promise<void>;
  onClose: () => void;
}

function loadStoredLlmReviewPreference() {
  if (typeof window === 'undefined') {
    return false;
  }
  return window.localStorage.getItem(LLM_REVIEW_STORAGE_KEY) === 'true';
}

export function SaveVocabularyOverlay({
  document,
  langPair,
  status,
  candidates,
  error,
  llmReviewApplied,
  confirmResult,
  onPrepare,
  onConfirm,
  onClose,
}: Props) {
  const [llmReview, setLlmReview] = useState(loadStoredLlmReviewPreference);
  const [items, setItems] = useState<EditableCandidate[]>([]);
  const [activeItemId, setActiveItemId] = useState<string | null>(null);
  const prepareRef = useRef(onPrepare);

  useEffect(() => {
    prepareRef.current = onPrepare;
  }, [onPrepare]);

  useEffect(() => {
    window.localStorage.setItem(LLM_REVIEW_STORAGE_KEY, String(llmReview));
  }, [llmReview]);

  useEffect(() => {
    const nextItems = candidates.map((candidate) => ({
        ...candidate,
        checked: candidate.selectedByDefault && !candidate.isDuplicate,
        word: candidate.normalized,
      }));
    setItems(nextItems);
    setActiveItemId((current) => {
      if (nextItems.length === 0) {
        return null;
      }
      if (current && nextItems.some((item) => item.id === current)) {
        return current;
      }
      return nextItems[0]?.id ?? null;
    });
  }, [candidates]);

  useEffect(() => {
    void prepareRef.current(llmReview);
  }, [document.id, llmReview]);

  const isBusy = BUSY_STATUSES.includes(status);
  const selectedCount = items.filter((item) => item.checked).length;
  const invalidSelectedCount = items.filter((item) => item.checked && !item.word.trim()).length;
  const activeIndex = items.findIndex((item) => item.id === activeItemId);
  const activeItem =
    activeIndex >= 0 ? items[activeIndex] : items[0] ?? null;

  const updateItem = (id: string, patch: Partial<EditableCandidate>) => {
    setItems((current) =>
      current.map((entry) => (entry.id === id ? { ...entry, ...patch } : entry)),
    );
  };

  const handleConfirm = async () => {
    await onConfirm(
      items
        .filter((item) => item.checked)
        .map((item) => ({
          candidateId: item.id,
          word: item.word.trim(),
          vocabType: item.vocabType,
          translation: item.translation.trim(),
          contextSentence: item.contextSentence.trim(),
        })),
    );
  };

  return (
    <div className="save-vocab-overlay" data-testid="save-vocabulary-overlay">
      <div className="save-vocab-card">
        <button className="save-vocab-card__close" onClick={onClose}>
          Close
        </button>

        <div className="save-vocab-card__header">
          <div>
            <div className="save-vocab-card__eyebrow">Save Vocabulary</div>
            <h2 className="save-vocab-card__title">{document.filename}</h2>
            <div className="save-vocab-card__meta">
              {langPair.targetLang} {'->'} {langPair.nativeLang}
            </div>
          </div>
          <label className="save-vocab-card__toggle">
            <input
              type="checkbox"
              checked={llmReview}
              onChange={(event) => setLlmReview(event.target.checked)}
              disabled={status === 'preparing' || status === 'reviewing' || status === 'saving'}
            />
            <span>LLM review</span>
          </label>
        </div>

        {status === 'preparing' && (
          <div className="save-vocab-card__loading">Extracting base vocabulary candidates…</div>
        )}
        {status === 'reviewing' && (
          <div className="save-vocab-card__loading">Running LLM review over extracted candidates…</div>
        )}
        {status === 'saving' && (
          <div className="save-vocab-card__loading">Saving selected vocabulary items…</div>
        )}
        {status === 'error' && error && (
          <div className="save-vocab-card__error">{error}</div>
        )}

        {status === 'saved' && confirmResult ? (
          <div className="save-vocab-card__summary">
            <div className="save-vocab-card__summary-row">
              Saved: <strong>{confirmResult.savedCount}</strong>
            </div>
            <div className="save-vocab-card__summary-row">
              Skipped duplicates: <strong>{confirmResult.skippedDuplicateCount}</strong>
            </div>
            <div className="save-vocab-card__summary-row">
              Failed: <strong>{confirmResult.failedCount}</strong>
            </div>
            <button className="save-vocab-card__primary" onClick={onClose}>
              Done
            </button>
          </div>
        ) : (
          <>
            <div className="save-vocab-card__status-row">
              <span>{selectedCount} selected</span>
              <span>{candidates.length} total</span>
              <span>{llmReviewApplied ? 'LLM reviewed' : 'Base NLP only'}</span>
            </div>

            {invalidSelectedCount > 0 && (
              <div className="save-vocab-card__error">
                Selected items must have a non-empty word before saving.
              </div>
            )}

            <div className="save-vocab-card__workspace">
              <section
                className="save-vocab-card__editor"
                aria-label="Vocabulary editor"
                data-testid="save-vocab-editor"
              >
                <div className="save-vocab-card__editor-header">
                  <div>
                    <div className="save-vocab-card__editor-eyebrow">Editor</div>
                    <div className="save-vocab-card__editor-title">
                      {activeItem ? `Editing ${activeIndex + 1} of ${items.length}` : 'No selection'}
                    </div>
                  </div>
                  {activeItem && (
                    <label className="save-vocab-card__editor-toggle">
                      <input
                        type="checkbox"
                        checked={activeItem.checked}
                        disabled={isBusy}
                        onChange={(event) =>
                          updateItem(activeItem.id, { checked: event.target.checked })
                        }
                      />
                      <span>Include in save</span>
                    </label>
                  )}
                </div>

                {activeItem ? (
                  <>
                    <div className="save-vocab-card__editor-grid">
                      <label className="save-vocab-card__field">
                        <span>Word</span>
                        <input
                          data-testid="save-vocab-editor-word"
                          value={activeItem.word}
                          onChange={(event) =>
                            updateItem(activeItem.id, { word: event.target.value })
                          }
                          disabled={isBusy}
                          spellCheck={false}
                        />
                      </label>
                      <label className="save-vocab-card__field">
                        <span>Type</span>
                        <select
                          data-testid="save-vocab-editor-type"
                          value={activeItem.vocabType}
                          onChange={(event) =>
                            updateItem(activeItem.id, {
                              vocabType: event.target.value as VocabType,
                            })
                          }
                          disabled={isBusy}
                        >
                          {Object.entries(VOCAB_TYPE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>

                    <label className="save-vocab-card__field">
                      <span>Translation</span>
                      <input
                        data-testid="save-vocab-editor-translation"
                        value={activeItem.translation}
                        onChange={(event) =>
                          updateItem(activeItem.id, { translation: event.target.value })
                        }
                        disabled={isBusy}
                        placeholder="Translation"
                        spellCheck={false}
                      />
                    </label>

                    <label className="save-vocab-card__field">
                      <span>Context</span>
                      <textarea
                        data-testid="save-vocab-editor-context"
                        value={activeItem.contextSentence}
                        onChange={(event) =>
                          updateItem(activeItem.id, { contextSentence: event.target.value })
                        }
                        disabled={isBusy}
                        rows={4}
                        spellCheck={false}
                      />
                    </label>

                    <div className="save-vocab-card__editor-meta">
                      <span>Surface: {activeItem.surface}</span>
                      <span>Lemma: {activeItem.lemma || 'n/a'}</span>
                      <span>POS: {activeItem.pos ?? 'n/a'}</span>
                    </div>
                  </>
                ) : (
                  <div className="save-vocab-card__empty">
                    Select a candidate from the list to edit it before saving.
                  </div>
                )}
              </section>

              <div className="save-vocab-card__list" data-testid="save-vocab-list">
              {items.map((item) => (
                <div
                  key={item.id}
                  className={`save-vocab-item ${item.id === activeItem?.id ? 'save-vocab-item--active' : ''}`}
                  data-testid="save-vocab-list-item"
                >
                  <label className="save-vocab-item__check">
                    <input
                      type="checkbox"
                      checked={item.checked}
                      disabled={isBusy}
                      onChange={(event) =>
                        updateItem(item.id, { checked: event.target.checked })
                      }
                    />
                  </label>
                  <button
                    type="button"
                    className="save-vocab-item__body"
                    onClick={() => setActiveItemId(item.id)}
                  >
                    <div className="save-vocab-item__top">
                      <span className="save-vocab-item__word">{item.word || item.normalized}</span>
                      <span className="save-vocab-item__badge">
                        {VOCAB_TYPE_LABELS[item.vocabType]}
                      </span>
                      {item.reviewSource !== 'base_nlp' && (
                        <span className="save-vocab-item__badge save-vocab-item__badge--review">
                          {item.reviewSource === 'llm_added' ? 'LLM added' : 'LLM checked'}
                        </span>
                      )}
                      {item.isDuplicate && (
                        <span className="save-vocab-item__badge save-vocab-item__badge--duplicate">
                          Duplicate
                        </span>
                      )}
                    </div>
                    <div className="save-vocab-item__translation">
                      {item.translation || 'No translation yet'}
                    </div>
                    <div className="save-vocab-item__context">{item.contextSentence}</div>
                  </button>
                </div>
              ))}

              {items.length === 0 && status === 'ready' && (
                <div className="save-vocab-card__empty">No vocabulary candidates found for this document.</div>
              )}
              </div>
            </div>

            <div className="save-vocab-card__actions">
              <button className="save-vocab-card__secondary" onClick={onClose}>
                Cancel
              </button>
              <button
                className="save-vocab-card__primary"
                onClick={() => void handleConfirm()}
                disabled={status !== 'ready' || selectedCount === 0 || invalidSelectedCount > 0}
              >
                Confirm Save
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
