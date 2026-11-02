"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/** The saved width, or `initial` when there is none or it is outside the limits. */
function savedWidth(
  storageKey: string,
  initial: number,
  min: number,
  max: number,
): number {
  // A browser set to block site data throws on both reading and writing here.
  try {
    const stored = window.localStorage.getItem(storageKey);
    const width = stored === null ? NaN : Number(stored);
    return width >= min && width <= max ? width : initial;
  } catch {
    return initial;
  }
}

/**
 * The width of a right-hand column as a percentage of the row it sits in,
 * dragged by a handle that is a direct child of that row. A percentage rather
 * than pixels, so the limits hold at any window size. Saved when the mouse is
 * released, so a click that moves nothing saves nothing. Read before the first
 * render, so only mount this in the browser, after the page has loaded.
 */
export function useSavedColumnWidth(
  storageKey: string,
  initial: number,
  min: number,
  max: number,
) {
  const [percent, setPercent] = useState(() =>
    savedWidth(storageKey, initial, min, max),
  );
  const stopListening = useRef<(() => void) | null>(null);

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      // A right-click opens a menu that swallows the mouse release.
      if (e.button !== 0) return;
      e.preventDefault();
      stopListening.current?.();
      const row = e.currentTarget.parentElement!;
      let latest: number | null = null;

      const move = (ev: MouseEvent) => {
        const { right, width } = row.getBoundingClientRect();
        latest = Math.min(
          max,
          Math.max(min, ((right - ev.clientX) / width) * 100),
        );
        setPercent(latest);
      };
      const remove = () => {
        document.removeEventListener("mousemove", move);
        document.removeEventListener("mouseup", up);
        stopListening.current = null;
      };
      const up = () => {
        remove();
        if (latest === null) return;
        try {
          window.localStorage.setItem(storageKey, String(latest));
        } catch {
          // Site data is blocked, so the width lasts for this visit only.
        }
      };
      stopListening.current = remove;
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    },
    [storageKey, min, max],
  );

  // Drop the listeners if the component unmounts mid-drag.
  useEffect(() => () => stopListening.current?.(), []);

  return { percent, startDrag };
}
