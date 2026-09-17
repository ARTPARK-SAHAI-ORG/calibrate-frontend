"use client";

import { useCallback, useEffect, useState } from "react";
// The raw router on purpose: a link's address already carries the workspace,
// so it must be pushed exactly as written. `@/lib/nav`'s router would add the
// workspace a second time.
import { useRouter } from "next/navigation";

/**
 * Asks before leaving a page whose changes have not been saved.
 *
 * Covers closing or reloading the tab, and clicking any link in the app. For
 * a button the page navigates itself, wrap the call: `guard(() => router.push(...))`.
 */
export function useUnsavedChangesPrompt(hasUnsavedChanges: boolean) {
  const router = useRouter();
  const [pending, setPending] = useState<{ run: () => void } | null>(null);

  // Closing or reloading the tab. The browser shows its own wording here; it
  // does not let a page choose the words.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedChanges]);

  // Any link in the app: the sidebar, the trail of pages at the top, a link in
  // the page itself. Caught before the link acts, so nothing navigates until
  // the reader says so.
  useEffect(() => {
    if (!hasUnsavedChanges) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      // A modified click opens a new tab, which leaves this page alone.
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const anchor = target?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      const href = anchor.getAttribute("href") ?? "";
      // Only pages inside the app. An outside address, a download and a jump
      // within this page all leave the work where it is.
      if (!href.startsWith("/")) return;
      if (href === window.location.pathname + window.location.search) return;
      e.preventDefault();
      e.stopPropagation();
      setPending({ run: () => router.push(href) });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [hasUnsavedChanges, router]);

  /** Run something that leaves the page, asking first when there is work to lose. */
  const guard = useCallback(
    (run: () => void) => {
      if (!hasUnsavedChanges) {
        run();
        return;
      }
      setPending({ run });
    },
    [hasUnsavedChanges],
  );

  return {
    guard,
    isPrompting: pending !== null,
    stay: useCallback(() => setPending(null), []),
    leave: useCallback(() => {
      const run = pending?.run;
      setPending(null);
      run?.();
    }, [pending]),
  };
}
