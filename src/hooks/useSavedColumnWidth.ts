"use client";

import { useCallback, useState } from "react";
import { useMouseDrag } from "./useMouseDrag";

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
 * The width of a column at one end of a row, as a percentage of the row,
 * dragged by a handle that is a direct child of that row. `side` says which
 * end the column sits at. A percentage rather
 * than pixels, so the limits hold at any window size. Saved when the mouse is
 * released, so a click that moves nothing saves nothing. Read before the first
 * render, so only mount this in the browser, after the page has loaded.
 */
export function useSavedColumnWidth(
  storageKey: string,
  initial: number,
  min: number,
  max: number,
  side: "left" | "right" = "right",
) {
  const [percent, setPercent] = useState(() =>
    savedWidth(storageKey, initial, min, max),
  );
  const beginDrag = useMouseDrag();

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      const row = e.currentTarget.parentElement!;
      let latest: number | null = null;

      beginDrag(
        e,
        (ev) => {
          const { left, right, width } = row.getBoundingClientRect();
          const span = side === "left" ? ev.clientX - left : right - ev.clientX;
          latest = Math.min(max, Math.max(min, (span / width) * 100));
          setPercent(latest);
        },
        () => {
          if (latest === null) return;
          try {
            window.localStorage.setItem(storageKey, String(latest));
          } catch {
            // Site data is blocked, so the width lasts for this visit only.
          }
        },
      );
    },
    [storageKey, min, max, side, beginDrag],
  );

  return { percent, startDrag };
}
