import { useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";

/**
 * Deep-links a dialog (or any single "open item") to a URL query param, e.g.
 * `?testId=<uuid>`, so a reload re-opens the same item and the URL can be
 * shared to open it directly.
 *
 * - On load — and whenever the param appears/changes in the URL — `onOpen`
 *   is called once with the value so the caller can open the matching item.
 * - `setParam(value)` writes (or, with `null`, clears) the param. Callers wire
 *   it into their open handler (write the id) and their close handler (clear).
 *
 * URL writes use `window.history.replaceState` rather than the router so they
 * don't push a history entry per open/close and don't re-trigger the read
 * effect (`useSearchParams` doesn't react to manual history changes). The
 * value written is also recorded so a subsequent router-driven param change to
 * the same value won't re-fire `onOpen`.
 */
export function useDialogUrlParam({
  param,
  enabled = true,
  onOpen,
}: {
  param: string;
  enabled?: boolean;
  onOpen: (value: string) => void;
}): { setParam: (value: string | null) => void } {
  const searchParams = useSearchParams();
  // The last param value we've already acted on. Guards against re-opening on
  // every re-render / list refetch while still honouring a genuine URL change.
  // It also makes `onOpen` safe as an effect dependency: an inline closure that
  // changes identity each render re-runs the effect, but the guard early-returns
  // unless the param value itself is new.
  const lastHandledRef = useRef<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const value = searchParams.get(param);
    if (lastHandledRef.current === value) return;
    if (!value) {
      lastHandledRef.current = null;
      return;
    }
    lastHandledRef.current = value;
    onOpen(value);
  }, [enabled, param, searchParams, onOpen]);

  const setParam = (value: string | null) => {
    lastHandledRef.current = value;
    const params = new URLSearchParams(window.location.search);
    if (value) {
      params.set(param, value);
    } else {
      params.delete(param);
    }
    const qs = params.toString();
    window.history.replaceState(
      null,
      "",
      qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
    );
  };

  return { setParam };
}
