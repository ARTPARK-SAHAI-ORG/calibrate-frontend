import { useLayoutEffect, useState, type RefObject } from "react";

/** Gap kept between a panel and the edge of the window, in pixels. */
const EDGE_GAP = 16;

/**
 * How far to move a panel sideways so it stays inside the window. A panel
 * pinned to its button runs off the edge when the button sits close to it in a
 * narrow window.
 */
export function useKeepInView(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
): number {
  const [shift, setShift] = useState(0);
  useLayoutEffect(() => {
    if (!open || !ref.current) {
      setShift(0);
      return;
    }
    const { left, right } = ref.current.getBoundingClientRect();
    if (right > window.innerWidth - EDGE_GAP) {
      setShift(Math.max(window.innerWidth - EDGE_GAP - right, EDGE_GAP - left));
    } else if (left < EDGE_GAP) {
      setShift(EDGE_GAP - left);
    }
  }, [open, ref]);
  return shift;
}
