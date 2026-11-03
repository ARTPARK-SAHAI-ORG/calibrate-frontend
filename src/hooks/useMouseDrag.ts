"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * The mouse handling behind every draggable divider. Call the returned function
 * from `onMouseDown`: `onMove` then gets each mouse movement, anywhere on the
 * page, and `onRelease` runs when the button comes up. A drag cut short by a new
 * press or by unmounting gets no `onRelease`.
 */
export function useMouseDrag() {
  const stopListening = useRef<(() => void) | null>(null);

  // Drop the listeners if the component unmounts mid-drag.
  useEffect(() => () => stopListening.current?.(), []);

  return useCallback(
    (
      e: React.MouseEvent,
      onMove: (ev: MouseEvent) => void,
      onRelease?: () => void,
    ) => {
      // A right-click opens a menu that swallows the mouse release.
      if (e.button !== 0) return;
      e.preventDefault();
      stopListening.current?.();

      const remove = () => {
        document.removeEventListener("mousemove", onMove);
        document.removeEventListener("mouseup", up);
        stopListening.current = null;
      };
      const up = () => {
        remove();
        onRelease?.();
      };
      stopListening.current = remove;
      document.addEventListener("mousemove", onMove);
      document.addEventListener("mouseup", up);
    },
    [],
  );
}
