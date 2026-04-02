import { useState } from 'react';
import type {
  DocumentCandidatePos,
  VocabularyWord,
  LanguagePair,
  VocabType,
} from '../../shared/types';
import {
  VOCAB_POS_LABELS,
  VOCAB_POS_OPTIONS,
  VOCAB_TYPE_LABELS,
} from '../../shared/types';
import './VocabularyPanel.css';

interface Props {
  words: VocabularyWord[];
  loading: boolean;
  langPair: LanguagePair;
  dueCount: number;
  onLangPairChange: (lp: LanguagePair) => void;
  onDelete: (id: string) => void;
  onUpdate: (
    id: string,
    word: string,
    translation: string,
    contextSentence: string,
    vocabType: VocabType,
    pos?: DocumentCandidatePos,
  ) => void;
  onStartPractice: () => void;
}

export function VocabularyPanel({
  words,
  loading,
  langPair,
  dueCount,
  onLangPairChange,
  onDelete,
  onUpdate,
  onStartPractice,
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editWord, setEditWord] = useState('');
  const [editTranslation, setEditTranslation] = useState('');
  const [editContextSentence, setEditContextSentence] = useState('');
  const [editVocabType, setEditVocabType] = useState<VocabType>('word');
  const [editPos, setEditPos] = useState<DocumentCandidatePos>(null);

  const startEdit = (w: VocabularyWord) => {
    setEditingId(w.id);
    setEditWord(w.word);
    setEditTranslation(w.translation);
    setEditContextSentence(w.contextSentence);
    setEditVocabType(w.vocabType);
    setEditPos(w.pos ?? null);
  };

  const cancelEdit = () => setEditingId(null);

  const saveEdit = () => {
    if (!editingId) return;
    const trimmedWord = editWord.trim();
    const trimmedTranslation = editTranslation.trim();
    if (!trimmedWord || !trimmedTranslation) return;
    onUpdate(
      editingId,
      trimmedWord,
      trimmedTranslation,
      editContextSentence.trim(),
      editVocabType,
      editPos,
    );
    setEditingId(null);
  };

  return (
    <div className="vocab-panel" data-testid="vocabulary-panel">
      <div className="vocab-panel__controls">
        <div className="vocab-panel__lang-pair">
          <input
            className="vocab-panel__lang-input"
            type="text"
            value={langPair.targetLang}
            data-testid="vocab-target-lang"
            onChange={(e) =>
              onLangPairChange({ ...langPair, targetLang: e.target.value })
            }
            placeholder="Target"
            maxLength={5}
          />
          <span className="vocab-panel__arrow">&rarr;</span>
          <input
            className="vocab-panel__lang-input"
            type="text"
            value={langPair.nativeLang}
            data-testid="vocab-native-lang"
            onChange={(e) =>
              onLangPairChange({ ...langPair, nativeLang: e.target.value })
            }
            placeholder="Native"
            maxLength={5}
          />
        </div>
        <button
          className="vocab-panel__practice-btn"
          onClick={onStartPractice}
          disabled={words.length === 0}
          data-testid="vocab-practice-button"
        >
          Practice {words.length > 0 && <span className="vocab-panel__badge">{words.length}</span>}
        </button>
      </div>

      {loading ? (
        <div className="vocab-panel__empty">Loading...</div>
      ) : words.length === 0 ? (
        <div className="vocab-panel__empty">
          No vocabulary words yet. Select text in normal mode and right-click to add words.
        </div>
      ) : (
        <ul className="vocab-panel__list">
          {words.map((w) => (
            <li key={w.id} className="vocab-panel__item">
              {editingId === w.id ? (
                <div className="vocab-panel__edit-form" data-testid="vocab-edit-form">
                  <div className="vocab-panel__edit-row">
                    <span className="vocab-panel__edit-label">Word</span>
                    <input
                      className="vocab-panel__edit-input"
                      value={editWord}
                      onChange={(e) => setEditWord(e.target.value)}
                      data-testid="vocab-edit-word"
                      autoFocus
                    />
                  </div>
                  <div className="vocab-panel__edit-row">
                    <span className="vocab-panel__edit-label">Translation</span>
                    <input
                      className="vocab-panel__edit-input"
                      value={editTranslation}
                      onChange={(e) => setEditTranslation(e.target.value)}
                      data-testid="vocab-edit-translation"
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveEdit();
                        if (e.key === 'Escape') cancelEdit();
                      }}
                    />
                  </div>
                  <div className="vocab-panel__edit-row">
                    <span className="vocab-panel__edit-label">Type</span>
                    <select
                      className="vocab-panel__edit-input"
                      value={editVocabType}
                      onChange={(e) => setEditVocabType(e.target.value as VocabType)}
                      data-testid="vocab-edit-type"
                    >
                      {Object.entries(VOCAB_TYPE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="vocab-panel__edit-row">
                    <span className="vocab-panel__edit-label">POS</span>
                    <select
                      className="vocab-panel__edit-input"
                      value={editPos ?? ''}
                      onChange={(e) => setEditPos((e.target.value || null) as DocumentCandidatePos)}
                      data-testid="vocab-edit-pos"
                    >
                      <option value="">Not set</option>
                      {VOCAB_POS_OPTIONS.map((item) => (
                        <option key={item} value={item}>
                          {VOCAB_POS_LABELS[item]}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="vocab-panel__edit-row vocab-panel__edit-row--textarea">
                    <span className="vocab-panel__edit-label">Context</span>
                    <textarea
                      className="vocab-panel__edit-input vocab-panel__edit-textarea"
                      value={editContextSentence}
                      onChange={(e) => setEditContextSentence(e.target.value)}
                      data-testid="vocab-edit-context"
                      rows={3}
                    />
                  </div>
                  <div className="vocab-panel__edit-actions">
                    <button
                      className="vocab-panel__edit-save"
                      onClick={saveEdit}
                      title="Save"
                      data-testid="vocab-edit-save"
                    >
                      ✓
                    </button>
                    <button
                      className="vocab-panel__edit-cancel"
                      onClick={cancelEdit}
                      title="Cancel"
                      data-testid="vocab-edit-cancel"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="vocab-panel__item-main">
                    <span className="vocab-panel__word">{w.word}</span>
                    <div className="vocab-panel__badges">
                      <span className="vocab-panel__type-badge">
                        {VOCAB_TYPE_LABELS[w.vocabType]}
                      </span>
                      {w.pos && (
                        <span className="vocab-panel__pos-badge">
                          {VOCAB_POS_LABELS[w.pos]}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="vocab-panel__translation">{w.translation}</div>
                  <div className="vocab-panel__meta">
                    <span>Rep: {w.repetitions}</span>
                    <span>EF: {w.easinessFactor.toFixed(1)}</span>
                    <button
                      className="vocab-panel__edit-btn"
                      onClick={() => startEdit(w)}
                      title="Edit"
                      data-testid={`vocab-edit-btn-${w.id}`}
                    >
                      ✏
                    </button>
                    <button
                      className="vocab-panel__delete-btn"
                      onClick={() => onDelete(w.id)}
                      title="Remove"
                    >
                      ✕
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
