import { useLayoutEffect, useState, type RefObject } from 'react';

const VIEWPORT_PADDING = 8;

/**
 * Returns a { top, left } position for a fixed-positioned floating element.
 * Prefers appearing below-right of the anchor point; flips up or left when
 * the element would overflow the viewport.
 */
export function useFloatingPosition(
  x: number,
  y: number,
  ref: RefObject<HTMLElement | null>,
  offset = 8,
): { top: number; left: number } {
  const [position, setPosition] = useState({ top: y + offset, left: x + offset });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const { width, height } = el.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Keep a small gap from the cursor so the floating UI appears beside it,
    // not directly under it.
    let left = x + offset;
    if (left + width + VIEWPORT_PADDING > vw) {
      left = x - width - offset;
    }
    left = Math.max(VIEWPORT_PADDING, Math.min(left, vw - width - VIEWPORT_PADDING));

    // Vertical: prefer below point; flip above if overflows.
    let top = y + offset;
    if (top + height + VIEWPORT_PADDING > vh) {
      top = y - height - offset;
    }
    top = Math.max(VIEWPORT_PADDING, Math.min(top, vh - height - VIEWPORT_PADDING));

    setPosition({ top, left });
  }, [x, y, ref, offset]);

  return position;
}
