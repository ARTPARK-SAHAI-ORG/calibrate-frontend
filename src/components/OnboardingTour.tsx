"use client";

import { useEffect, useRef } from "react";
import "driver.js/dist/driver.css";
import { useAccessToken } from "@/hooks";
import {
  buildFirstEvalTour,
  clearTourSeen,
  isTourActive,
  runTour,
  TOUR_IDS,
  TOUR_REQUEST_EVENT,
  type TourId,
} from "@/lib/onboarding";

// TEMP (manual testing): the tour does NOT auto-start and does NOT auto-run any
// steps — it only starts when the user clicks "Start tour", and every card
// requires a click to advance. Re-enable the auto-start effect (see git history
// of this file) for production onboarding before merge.
const AUTOSTART_ENABLED = false;

/**
 * Mounts the onboarding tours. Rendered once in the root layout, so it persists
 * across in-app navigation — which lets an auto-driving tour keep running as it
 * moves the user between routes and dialogs.
 *
 * Today it only starts on explicit request (profile menu / sidebar "Start
 * tour"); auto-start on first visit is gated off while the flow is iterated on.
 */
export function OnboardingTour() {
  const accessToken = useAccessToken();

  // The tour is built once but its API calls fire seconds later, so hand it a
  // getter over a ref that always holds the latest token (it may still be
  // hydrating when the tour starts).
  const tokenRef = useRef<string | null>(accessToken);
  tokenRef.current = accessToken;

  const startTour = (tourId: TourId) => {
    if (tourId === TOUR_IDS.firstEval) {
      void runTour(
        buildFirstEvalTour({ getAccessToken: () => tokenRef.current }),
      );
    }
  };

  // Start only on explicit request (the "Start tour" button / profile menu).
  useEffect(() => {
    const handler = (e: Event) => {
      const tourId = (e as CustomEvent<TourId>).detail;
      if (!tourId) return;
      clearTourSeen(tourId);
      if (isTourActive()) return;
      startTour(tourId);
    };
    window.addEventListener(TOUR_REQUEST_EVENT, handler);
    return () => window.removeEventListener(TOUR_REQUEST_EVENT, handler);
    // startTour closes over accessToken; re-bind when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // Auto-start on first visit is intentionally disabled while iterating; flip
  // AUTOSTART_ENABLED to restore it. Referenced so the constant is not flagged.
  void AUTOSTART_ENABLED;

  return null;
}
