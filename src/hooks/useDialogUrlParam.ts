import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Deep-links a dialog (or any single "open item") to a URL query param, e.g.
 * `?testId=<uuid>`, so a reload re-opens the same item, the URL can be shared
 * to open it directly, and the browser Back button closes it.
 *
 * - When the param appears in the URL (load, shared link, or the Forward
 *   button), `onOpen(value)` is called so the caller can open the item.
 * - When the param disappears (the Back button pops the entry we pushed on
 *   open), `onClose()` is called so the caller can close the item.
 * - `setParam(value)` writes the param: opening (`value` set) pushes a new
 *   history entry so Back has something to pop; closing (`null`) replaces the
 *   current entry in place. Callers wire it into their open/close handlers.
 *
 * Reads take the value from the live `window.location` rather than only the
 * router snapshot, so a history write we just made can't be observed in a
 * stale, pre-sync state (which would otherwise re-open/re-close the dialog).
 * `useSearchParams` is used only as the re-render trigger — it updates on real
 * navigations including Back/Forward (popstate) and push/replaceState.
 */
export function useDialogUrlParam({
  param,
  enabled = true,
  onOpen,
  onClose,
}: {
  param: string;
  enabled?: boolean;
  onOpen: (value: string) => void;
  onClose?: () => void;
}): { setParam: (value: string | null) => void } {
  const searchParams = useSearchParams();
  // The last param value we've already opened/closed for. Guards against
  // acting twice on the same value, and lets us detect a present→absent
  // transition (Back button) so we can close.
  const lastHandledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const value = new URLSearchParams(window.location.search).get(param);
    if (lastHandledRef.current === value) return;
    const prev = lastHandledRef.current;
    lastHandledRef.current = value;
    if (value) {
      onOpen(value);
    } else if (prev) {
      onClose?.();
    }
  }, [enabled, param, searchParams, onOpen, onClose]);

  const setParam = (value: string | null) => {
    const current = new URLSearchParams(window.location.search).get(param);
    // Record intent before any history write so a stale re-render can't act on
    // it again. When the URL already matches, there's nothing to write.
    lastHandledRef.current = value;
    if (value === current) return;

    const params = new URLSearchParams(window.location.search);
    if (value) {
      params.set(param, value);
    } else {
      params.delete(param);
    }
    const qs = params.toString();
    const url = qs
      ? `${window.location.pathname}?${qs}`
      : window.location.pathname;
    // Opening pushes a new history entry so the Back button closes the dialog;
    // closing replaces in place so it doesn't strand a redundant forward entry.
    if (value) {
      window.history.pushState(null, "", url);
    } else {
      window.history.replaceState(null, "", url);
    }
  };

  return { setParam };
}
