"use client";

import { useCallback, useState } from "react";
import { useMouseDrag } from "./useMouseDrag";

/**
 * A pixel width the user can drag a handle to resize, clamped to
 * [min, max]. `direction: "grow-right"` is for a panel that sits to the
 * LEFT of its handle (dragging right makes it wider); `"grow-left"` is
 * for a panel that sits to the RIGHT of its handle, anchored to the far
 * edge (dragging right makes it narrower). Not persisted — resets to
 * `initial` on remount.
 */
export function useResizableWidth(
  initial: number,
  min: number,
  max: number,
  direction: "grow-right" | "grow-left" = "grow-right",
) {
  const [width, setWidth] = useState(initial);
  const beginDrag = useMouseDrag();

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      const startX = e.clientX;
      beginDrag(e, (ev) => {
        const delta = ev.clientX - startX;
        const signed = direction === "grow-right" ? delta : -delta;
        setWidth(Math.min(max, Math.max(min, width + signed)));
      });
    },
    [width, direction, min, max, beginDrag],
  );

  return { width, startDrag };
}
