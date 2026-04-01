import { useEffect, useRef, useState } from 'react';
import type { VocabType } from '../../shared/types';
import { VOCAB_TYPE_LABELS } from '../../shared/types';
import { useFloatingPosition } from '../../shared/lib/floating-position';
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
  const position = useFloatingPosition(x, y, ref);
  const [submenuOpen, setSubmenuOpen] = useState(false);

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
      style={{ top: position.top, left: position.left }}
      data-testid="vocab-context-menu"
      onMouseLeave={() => setSubmenuOpen(false)}
    >
      <div
        className={`vocab-context-menu__row${submenuOpen ? ' vocab-context-menu__row--active' : ''}`}
        onMouseEnter={() => setSubmenuOpen(true)}
      >
        <span className="vocab-context-menu__label">Add to Vocabulary</span>
        <span className="vocab-context-menu__arrow">›</span>

        {submenuOpen && (
          <div className="vocab-context-menu__submenu">
            {VOCAB_TYPES.map(type => (
              <button
                key={type}
                className="vocab-context-menu__item"
                onClick={() => onSelect(type)}
              >
                {VOCAB_TYPE_LABELS[type]}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
