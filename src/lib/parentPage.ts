"use client";

/**
 * The page the reader came from, so a page reached from several places can
 * show the right trail back.
 *
 * Only the evaluator page uses this today: it is reachable from an agent, a
 * speech-to-text or text-to-speech evaluation, a simulation run and a
 * labelling task, and its trail should name whichever one the reader was on.
 *
 * `Breadcrumbs` records the page it is drawn on, which is every detail page in
 * the app. A page with no trail of its own records nothing, so the reader
 * simply sees the evaluator's own name with no step before it.
 */

const KEY = "calibrate:parent-page";

export type ParentPage = {
  /** Address of the page, without the workspace. */
  href: string;
  /** Its name, as shown on the page itself. */
  label: string;
};

export function rememberParentPage(page: ParentPage): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(KEY, JSON.stringify(page));
  } catch {
    // Private browsing can refuse to store. The trail just loses a step.
  }
}

export function forgetParentPage(): void {
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.removeItem(KEY);
  } catch {
    // As above.
  }
}

export function getParentPage(): ParentPage | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      parsed &&
      typeof parsed === "object" &&
      typeof (parsed as ParentPage).href === "string" &&
      typeof (parsed as ParentPage).label === "string"
    ) {
      return parsed as ParentPage;
    }
    return null;
  } catch {
    return null;
  }
}
