/**
 * Onboarding tours — public surface.
 *
 * A registry of contextual, auto-driving tours. Today it ships the flagship
 * "Run your first evaluation" tour; section tours (Tools, STT, TTS, Simulation,
 * Human-alignment) plug into the same engine and registry.
 */

export { runTour, stopTour, isTourActive, type Tour, type TourStep } from "./engine";
export {
  hasSeenTour,
  getTourStatus,
  markTourSeen,
  clearTourSeen,
  readProgress,
  clearProgress,
  ONBOARDING_VERSION,
} from "./state";
export {
  buildFirstEvalTour,
  FIRST_EVAL_TOUR_ID,
  type FirstEvalDeps,
} from "./tours/firstEval";

/** Window event that requests (re)starting a tour; detail carries the tour id. */
export const TOUR_REQUEST_EVENT = "calibrate:start-tour";

/** Window event the tour fires after seeding demo tests so lists can refresh. */
export const AGENT_TESTS_UPDATED_EVENT = "calibrate:agent-tests-updated";

/** Registry of tours available for auto-run and manual replay. */
export const TOUR_IDS = {
  firstEval: "first-eval",
} as const;

export type TourId = (typeof TOUR_IDS)[keyof typeof TOUR_IDS];

/** Fire the request event so the mounted <OnboardingTour> starts a tour. */
export function requestTour(tourId: TourId): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(TOUR_REQUEST_EVENT, { detail: tourId }));
}
