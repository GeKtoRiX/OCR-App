import type { VocabularyWord, LanguagePair } from '../../shared/types';
import { VOCAB_TYPE_LABELS } from '../../shared/types';
import './VocabularyPanel.css';

interface Props {
  words: VocabularyWord[];
  loading: boolean;
  langPair: LanguagePair;
  dueCount: number;
  onLangPairChange: (lp: LanguagePair) => void;
  onDelete: (id: string) => void;
  onStartPractice: () => void;
}

export function VocabularyPanel({
  words,
  loading,
  langPair,
  dueCount,
  onLangPairChange,
  onDelete,
  onStartPractice,
}: Props) {
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
          disabled={dueCount === 0}
          data-testid="vocab-practice-button"
        >
          Practice {dueCount > 0 && <span className="vocab-panel__badge">{dueCount}</span>}
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
              <div className="vocab-panel__item-main">
                <span className="vocab-panel__word">{w.word}</span>
                <span className="vocab-panel__type-badge">
                  {VOCAB_TYPE_LABELS[w.vocabType]}
                </span>
              </div>
              <div className="vocab-panel__translation">{w.translation}</div>
              <div className="vocab-panel__meta">
                <span>Rep: {w.repetitions}</span>
                <span>EF: {w.easinessFactor.toFixed(1)}</span>
                <button
                  className="vocab-panel__delete-btn"
                  onClick={() => onDelete(w.id)}
                  title="Remove"
                >
                  x
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
