import { useEffect, useLayoutEffect, useRef, useState } from 'react';
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
  const [position, setPosition] = useState({ top: y, left: x });

  useLayoutEffect(() => {
    const menu = ref.current;
    if (!menu) {
      return;
    }

    const { width, height } = menu.getBoundingClientRect();
    const viewportPadding = 8;
    const menuOffset = 10;
    const maxLeft = Math.max(viewportPadding, window.innerWidth - width - viewportPadding);
    const maxTop = Math.max(viewportPadding, window.innerHeight - height - viewportPadding);
    const centeredLeft = x - (width / 2);
    const belowTop = y + menuOffset;
    const aboveTop = y - height - menuOffset;

    let nextTop = belowTop;
    if (belowTop > maxTop) {
      nextTop = aboveTop >= viewportPadding
        ? aboveTop
        : Math.min(Math.max(y - (height / 2), viewportPadding), maxTop);
    }

    setPosition({
      left: Math.min(Math.max(centeredLeft, viewportPadding), maxLeft),
      top: nextTop,
    });
  }, [x, y]);

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
