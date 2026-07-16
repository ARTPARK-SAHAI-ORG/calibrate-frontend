"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import "driver.js/dist/driver.css";
import { useAccessToken } from "@/hooks";
import {
  buildFirstEvalTour,
  clearTourSeen,
  hasSeenTour,
  isTourActive,
  runTour,
  TOUR_IDS,
  TOUR_REQUEST_EVENT,
  type TourId,
} from "@/lib/onboarding";

/**
 * Mounts the onboarding tours. Rendered once in the root layout, so it persists
 * across in-app navigation — which lets an auto-driving tour keep running as it
 * moves the user between routes and dialogs.
 *
 * The tour starts in exactly two ways:
 *  - auto-start on the first desktop visit to `/agents` (once, until seen);
 *  - on explicit request (profile menu / sidebar "Product tour").
 * There is deliberately no mid-flight resume: a page reload just ends the tour
 * (the app state it drove is gone), and the user can restart it from the button.
 */
export function OnboardingTour() {
  const pathname = usePathname();
  const accessToken = useAccessToken();

  // The tour is built once but its API calls fire seconds later, so hand it a
  // getter over a ref that always holds the latest token (it may still be
  // hydrating when the tour starts).
  const tokenRef = useRef<string | null>(accessToken);
  tokenRef.current = accessToken;

  const startTour = (tourId: TourId) => {
    if (tourId === TOUR_IDS.firstEval) {
      void runTour(buildFirstEvalTour({ getAccessToken: () => tokenRef.current }));
    }
  };

  // Replay on request from anywhere in the app.
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

  // Auto-start the flagship tour on the first desktop visit to /agents.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isTourActive()) return;

    if (pathname !== "/agents") return;
    if (window.innerWidth < 768) return;
    if (hasSeenTour(TOUR_IDS.firstEval)) return;

    const timer = window.setTimeout(() => {
      if (!isTourActive() && !hasSeenTour(TOUR_IDS.firstEval)) {
        startTour(TOUR_IDS.firstEval);
      }
    }, 700);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname, accessToken]);

  return null;
}
