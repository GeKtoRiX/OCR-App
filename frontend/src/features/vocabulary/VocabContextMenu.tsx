import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useFloatingPosition } from '../../shared/lib/floating-position';
import './VocabContextMenu.css';

interface Props {
  x: number;
  y: number;
  onSelect: () => void;
  onClose: () => void;
}

export function VocabContextMenu({ x, y, onSelect, onClose }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const position = useFloatingPosition(x, y, ref);

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

  const menu = (
    <div
      ref={ref}
      className="vocab-context-menu"
      style={{ top: position.top, left: position.left }}
      data-testid="vocab-context-menu"
    >
          <button
            type="button"
            className="vocab-context-menu__item"
            onClick={() => onSelect()}
          >
            Add to Vocabulary
          </button>
    </div>
  );

  return createPortal(menu, document.body);
}
