"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import "driver.js/dist/driver.css";
import { useAccessToken } from "@/hooks";
import {
  buildFirstEvalTour,
  clearTourSeen,
  hasSeenTour,
  isTourActive,
  readProgress,
  runTour,
  TOUR_IDS,
  TOUR_REQUEST_EVENT,
  type TourId,
} from "@/lib/onboarding";

/**
 * Mounts the onboarding tours. Rendered once inside `AppLayout`, so it persists
 * across in-app navigation — which lets an auto-driving tour keep running as it
 * moves the user between routes and dialogs.
 *
 * Responsibilities:
 *  - auto-start the flagship "first evaluation" tour on the first desktop visit
 *    to `/agents`;
 *  - resume an in-flight tour if progress was persisted (e.g. after a reload);
 *  - replay any tour on request (profile menu → "Take a tour").
 */
export function OnboardingTour() {
  const pathname = usePathname();
  const accessToken = useAccessToken();

  const startTour = (tourId: TourId, fromStep = 0) => {
    if (tourId === TOUR_IDS.firstEval) {
      void runTour(buildFirstEvalTour({ accessToken }), fromStep);
    }
  };

  // Replay on request from anywhere in the app.
  useEffect(() => {
    const handler = (e: Event) => {
      const tourId = (e as CustomEvent<TourId>).detail;
      if (!tourId) return;
      clearTourSeen(tourId);
      startTour(tourId);
    };
    window.addEventListener(TOUR_REQUEST_EVENT, handler);
    return () => window.removeEventListener(TOUR_REQUEST_EVENT, handler);
    // startTour closes over accessToken; re-bind when it changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accessToken]);

  // Resume an in-flight tour, or auto-start the flagship on first /agents visit.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (isTourActive()) return;

    // Resume a tour that was mid-flight (survives reloads).
    const progress = readProgress();
    if (progress) {
      startTour(progress.tourId as TourId, progress.stepIndex);
      return;
    }

    // First-run auto-start: flagship tour, desktop only, agents landing.
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
