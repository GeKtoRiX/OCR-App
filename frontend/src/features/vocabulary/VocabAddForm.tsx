import { useRef, useState } from 'react';
import type { VocabType } from '../../shared/types';
import { VOCAB_TYPE_LABELS, } from '../../shared/types';
import { useFloatingPosition } from '../../shared/lib/floating-position';
import './VocabAddForm.css';

const VOCAB_TYPES: VocabType[] = [
  'word',
  'phrasal_verb',
  'idiom',
  'collocation',
  'expression',
];

interface Props {
  x: number;
  y: number;
  selectedText: string;
  vocabType: VocabType;
  contextSentence: string;
  isDuplicate: boolean;
  onAdd: (word: string, translation: string, contextSentence: string, vocabType: VocabType) => void;
  onClose: () => void;
}

export function VocabAddForm({
  x,
  y,
  selectedText,
  vocabType,
  contextSentence,
  isDuplicate,
  onAdd,
  onClose,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const position = useFloatingPosition(x, y, ref);

  const [word, setWord] = useState(selectedText);
  const [type, setType] = useState<VocabType>(vocabType);
  const [translation, setTranslation] = useState('');
  const [context, setContext] = useState(contextSentence);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!word.trim() || !translation.trim()) return;
    onAdd(word.trim(), translation.trim(), context.trim(), type);
  };

  return (
    <div
      ref={ref}
      className="vocab-add-form"
      style={{ top: position.top, left: position.left }}
      data-testid="vocab-add-form"
    >
      <div className="vocab-add-form__header">
        <span className="vocab-add-form__title">Add to Vocabulary</span>
        <button
          className="vocab-add-form__close"
          onClick={onClose}
          aria-label="Close"
        >
          ✕
        </button>
      </div>

      {isDuplicate && (
        <div className="vocab-add-form__warning" data-testid="duplicate-warning">
          This word already exists in your vocabulary
        </div>
      )}

      <form onSubmit={handleSubmit} className="vocab-add-form__form">
        <div className="vocab-add-form__row">
          <div className="vocab-add-form__field vocab-add-form__field--word">
            <label className="vocab-add-form__label">Word</label>
            <input
              className="vocab-add-form__input"
              type="text"
              value={word}
              onChange={e => setWord(e.target.value)}
              spellCheck={false}
              autoFocus
            />
          </div>
          <div className="vocab-add-form__field vocab-add-form__field--type">
            <label className="vocab-add-form__label">Type</label>
            <select
              className="vocab-add-form__select"
              value={type}
              onChange={e => setType(e.target.value as VocabType)}
            >
              {VOCAB_TYPES.map(t => (
                <option key={t} value={t}>
                  {VOCAB_TYPE_LABELS[t]}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="vocab-add-form__field">
          <label className="vocab-add-form__label">Translation</label>
          <input
            className="vocab-add-form__input"
            type="text"
            value={translation}
            onChange={e => setTranslation(e.target.value)}
            placeholder="Translation..."
            spellCheck={false}
          />
        </div>

        <div className="vocab-add-form__field">
          <label className="vocab-add-form__label">Context</label>
          <textarea
            className="vocab-add-form__textarea"
            value={context}
            onChange={e => setContext(e.target.value)}
            rows={2}
            spellCheck={false}
            placeholder="Context sentence..."
          />
        </div>

        <button
          className="vocab-add-form__submit"
          type="submit"
          disabled={!word.trim() || !translation.trim()}
        >
          Add
        </button>
      </form>
    </div>
  );
}
