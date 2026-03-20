import { useEffect, useRef } from 'react';
import type { VocabType } from '../model/types';
import { VOCAB_TYPE_LABELS } from '../model/types';
import './VocabContextMenu.css';

interface Props {
  x: number;
  y: number;
  onSelect: (type: VocabType) => void;
  onClose: () => void;
}

const VOCAB_TYPES: VocabType[] = [
  'word',
  'phrasal_verb',
  'idiom',
  'collocation',
  'expression',
];

export function VocabContextMenu({ x, y, onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handler);
    document.addEventListener('keydown', keyHandler);
    return () => {
      document.removeEventListener('mousedown', handler);
      document.removeEventListener('keydown', keyHandler);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="vocab-context-menu"
      style={{ top: y, left: x }}
      data-testid="vocab-context-menu"
    >
      <div className="vocab-context-menu__title">Add to Vocabulary</div>
      {VOCAB_TYPES.map((type) => (
        <button
          key={type}
          className="vocab-context-menu__item"
          onClick={() => onSelect(type)}
        >
          {VOCAB_TYPE_LABELS[type]}
        </button>
      ))}
    </div>
  );
}
