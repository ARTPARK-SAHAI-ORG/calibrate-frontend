/**
 * Persistence for onboarding tours.
 *
 * Two things are stored, both in localStorage:
 *  - a per-tour "seen" flag (completed | skipped), versioned so a tour can be
 *    re-introduced when its flow materially changes;
 *  - the in-flight progress of the active tour (which tour, which step) so an
 *    auto-driving tour survives the client navigations it triggers.
 */

export const ONBOARDING_VERSION = "v1";

export type TourSeenStatus = "completed" | "skipped";

const seenKey = (tourId: string) => `calibrate:onboarding:${ONBOARDING_VERSION}:${tourId}`;
const PROGRESS_KEY = `calibrate:onboarding:${ONBOARDING_VERSION}:active`;

export type TourProgress = { tourId: string; stepIndex: number };

function safeGet(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeSet(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // Private mode / disabled storage — tours simply won't be remembered.
  }
}

function safeRemove(key: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

/** True once the user has completed or skipped this tour. */
export function hasSeenTour(tourId: string): boolean {
  return safeGet(seenKey(tourId)) !== null;
}

export function getTourStatus(tourId: string): TourSeenStatus | null {
  const v = safeGet(seenKey(tourId));
  return v === "completed" || v === "skipped" ? v : null;
}

export function markTourSeen(tourId: string, status: TourSeenStatus): void {
  safeSet(seenKey(tourId), status);
}

/** Clear the seen flag so the tour can auto-run again (used by "replay"). */
export function clearTourSeen(tourId: string): void {
  safeRemove(seenKey(tourId));
}

export function saveProgress(progress: TourProgress): void {
  safeSet(PROGRESS_KEY, JSON.stringify(progress));
}

export function readProgress(): TourProgress | null {
  const raw = safeGet(PROGRESS_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as TourProgress;
    if (typeof parsed?.tourId === "string" && typeof parsed?.stepIndex === "number") {
      return parsed;
    }
  } catch {
    /* corrupt — treat as no progress */
  }
  return null;
}

export function clearProgress(): void {
  safeRemove(PROGRESS_KEY);
}
