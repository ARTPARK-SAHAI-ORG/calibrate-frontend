"use client";

import { useEffect, type RefObject } from "react";

/**
 * Close a panel when the reader clicks outside it or presses Escape. Both
 * toolbar panels on the Monitoring tab, the filter and the sort, carried their
 * own copy of this.
 *
 * Nothing is listened for while the panel is closed, and both listeners go
 * with it.
 */
export function useDismissOnOutside(
  open: boolean,
  ref: RefObject<HTMLElement | null>,
  onDismiss: () => void,
): void {
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const target = e.target as Element;
      if (ref.current?.contains(target)) return;
      // A dropdown opened from inside the panel floats outside it.
      if (target.closest?.("[data-floating-picker]")) return;
      onDismiss();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
}
