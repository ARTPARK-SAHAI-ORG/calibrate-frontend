"use client";

import { useEffect, useState } from "react";

/**
 * True while the space around the name is narrow enough to cut it off. A name
 * that is fully readable must not put the same name in a hover popup: it
 * covers what is underneath and tells the reader nothing.
 *
 * Put the `ref` on the element that does the shortening: the one carrying
 * `truncate`, `line-clamp-*`, or a fixed height it scrolls inside. Text can be
 * cut off either way, sideways on one line or after a few lines, and a cell
 * that cuts it off downwards needs the hover text just as much.
 */
export function useIsNameClipped(name: string) {
  const [el, setEl] = useState<HTMLSpanElement | null>(null);
  const [clipped, setClipped] = useState(false);
  useEffect(() => {
    if (!el) return;
    const measure = () =>
      setClipped(
        el.scrollWidth > el.clientWidth || el.scrollHeight > el.clientHeight,
      );
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [el, name]);
  // The wrapper around the name changes when it turns out to be cut off,
  // which mounts a new span. Keeping the span in state rather than a ref
  // re-runs the effect on that new one, so more room later still clears the
  // hover text.
  return { ref: setEl, clipped };
}
