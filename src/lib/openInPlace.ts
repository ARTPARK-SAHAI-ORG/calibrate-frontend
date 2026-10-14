import type { MouseEvent } from "react";

/**
 * For a link that opens a window on the same page: a plain left click opens
 * the window in place, while middle-click and Cmd, Ctrl or Shift-click fall
 * through to the browser so the link opens in a new tab.
 */
export function openInPlace(e: MouseEvent, open: () => void): void {
  if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
    return;
  }
  e.preventDefault();
  open();
}
