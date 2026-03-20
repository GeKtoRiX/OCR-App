import { useState } from 'react';
import type { VocabType } from '../model/types';
import { VOCAB_TYPE_LABELS } from '../model/types';
import './VocabAddForm.css';

interface Props {
  x: number;
  y: number;
  selectedText: string;
  vocabType: VocabType;
  isDuplicate: boolean;
  onAdd: (translation: string) => void;
  onClose: () => void;
}

export function VocabAddForm({
  x,
  y,
  selectedText,
  vocabType,
  isDuplicate,
  onAdd,
  onClose,
}: Props) {
  const [translation, setTranslation] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onAdd(translation);
  };

  return (
    <div
      className="vocab-add-form"
      style={{ top: y, left: x }}
      data-testid="vocab-add-form"
    >
      <div className="vocab-add-form__header">
        <span className="vocab-add-form__badge">
          {VOCAB_TYPE_LABELS[vocabType]}
        </span>
        <button
          className="vocab-add-form__close"
          onClick={onClose}
          aria-label="Close"
        >
          x
        </button>
      </div>

      <div className="vocab-add-form__word">{selectedText}</div>

      {isDuplicate ? (
        <div className="vocab-add-form__warning" data-testid="duplicate-warning">
          This word already exists in your vocabulary
        </div>
      ) : (
        <form onSubmit={handleSubmit}>
          <input
            className="vocab-add-form__input"
            type="text"
            value={translation}
            onChange={(e) => setTranslation(e.target.value)}
            placeholder="Translation..."
            autoFocus
            spellCheck={false}
          />
          <button className="vocab-add-form__submit" type="submit">
            Add
          </button>
        </form>
      )}
    </div>
  );
}
