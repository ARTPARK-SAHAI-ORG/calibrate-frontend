"use client";

import { useCallback, useEffect, useRef, useState } from "react";

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
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);
  const listeners = useRef<{
    move: (e: MouseEvent) => void;
    up: () => void;
  } | null>(null);

  const stopDrag = useCallback(() => {
    if (!listeners.current) return;
    document.removeEventListener("mousemove", listeners.current.move);
    document.removeEventListener("mouseup", listeners.current.up);
    listeners.current = null;
    drag.current = null;
  }, []);

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      drag.current = { startX: e.clientX, startWidth: width };
      const move = (ev: MouseEvent) => {
        if (!drag.current) return;
        const delta = ev.clientX - drag.current.startX;
        const signed = direction === "grow-right" ? delta : -delta;
        setWidth(
          Math.min(max, Math.max(min, drag.current.startWidth + signed)),
        );
      };
      const up = () => stopDrag();
      listeners.current = { move, up };
      document.addEventListener("mousemove", move);
      document.addEventListener("mouseup", up);
    },
    [width, direction, min, max, stopDrag],
  );

  // Drop the listeners if the component unmounts mid-drag.
  useEffect(() => stopDrag, [stopDrag]);

  return { width, startDrag };
}
