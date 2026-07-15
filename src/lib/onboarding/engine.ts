/**
 * Auto-driving tour engine.
 *
 * A tour is an ordered list of steps. Each step spotlights an anchor element and
 * shows a popover whose primary button runs an optional `action()` — the action
 * injects sample values into the app's real forms / clicks its real buttons and
 * then the engine advances. Because actions trigger client-side navigation and
 * open dialogs, every step waits (with a timeout) for its anchor to appear, so
 * the same loop naturally spans routes, tabs, and modals. If an anchor never
 * appears the popover is shown centered and the user can act manually — the tour
 * degrades instead of breaking.
 */

import { driver, type Driver } from "driver.js";
import { reportError } from "@/lib/reportError";
import { waitForElement } from "./dom";
import {
  clearProgress,
  markTourSeen,
  saveProgress,
  type TourSeenStatus,
} from "./state";

export type TourStep = {
  /** CSS selector for the element to spotlight (usually a `[data-tour="…"]`). */
  anchor?: string;
  title: string;
  description: string;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** Label for the advance button (defaults to "Next" / "Finish" on the last). */
  actionLabel?: string;
  /**
   * Runs after the anchor is found but before the popover is shown — use it to
   * put the app into the state this card describes (e.g. fill a sample value)
   * so the card explains something the user can already see.
   */
  prepare?: () => Promise<void> | void;
  /** Runs when the user clicks the advance button, before moving on. */
  action?: () => Promise<void> | void;
  /** How long to wait for this step's anchor before showing it centered. */
  timeout?: number;
};

export type Tour = {
  id: string;
  steps: TourStep[];
};

type ActiveTour = {
  tour: Tour;
  index: number;
  driverObj: Driver;
  /** Guards user-initiated close vs. our own destroy on finish. */
  ending: boolean;
};

let active: ActiveTour | null = null;

export function isTourActive(): boolean {
  return active !== null;
}

/** Start (or resume) `tour` at `startIndex`. Only one tour runs at a time. */
export async function runTour(tour: Tour, startIndex = 0): Promise<void> {
  // Tear down any previous run without recording a skip.
  if (active) {
    active.ending = true;
    active.driverObj.destroy();
    active = null;
  }

  const driverObj = driver({
    allowClose: true,
    // No cross-fade between steps: since we drive via highlight(), the fade can
    // briefly show the old and new popover at once (looks like two popovers).
    animate: false,
    overlayColor: "rgba(10, 10, 12, 0.6)",
    stagePadding: 6,
    stageRadius: 8,
    popoverClass: "calibrate-tour",
    showProgress: true,
    onPopoverRender: (popover) => {
      if (!active) return;
      // We advance steps manually via highlight(), so driver can't compute the
      // "X of N" itself — inject it from our own step state (creating the node
      // if driver didn't render one for a single highlight).
      const text = `${active.index + 1} of ${active.tour.steps.length}`;
      const footer = popover.footer;
      if (popover.progress) {
        popover.progress.textContent = text;
      } else if (footer && !footer.querySelector(".driver-popover-progress-text")) {
        const span = document.createElement("span");
        span.className = "driver-popover-progress-text";
        span.textContent = text;
        footer.insertBefore(span, footer.firstChild);
      }
      // A visible "Skip tour" affordance so the guide can be ended any time,
      // placed just left of the advance button.
      const nav = footer?.querySelector(".driver-popover-navigation-btns");
      if (nav && !nav.querySelector(".calibrate-tour-skip")) {
        const skip = document.createElement("button");
        skip.type = "button";
        skip.className = "calibrate-tour-skip";
        skip.textContent = "Skip tour";
        skip.addEventListener("click", (e) => {
          e.preventDefault();
          finish("skipped");
        });
        nav.insertBefore(skip, nav.firstChild);
      }
    },
    onDestroyStarted: () => {
      // Fires on user close (X / overlay / Esc). Our finish path sets `ending`.
      if (active && !active.ending) {
        finish("skipped");
      }
    },
  });

  active = { tour, index: startIndex, driverObj, ending: false };
  await showStep();
}

async function showStep(): Promise<void> {
  if (!active) return;
  const { tour, index, driverObj } = active;
  const step = tour.steps[index];
  if (!step) {
    finish("completed");
    return;
  }

  saveProgress({ tourId: tour.id, stepIndex: index });

  const element = step.anchor
    ? (await waitForElement(step.anchor, { timeout: step.timeout }))
    : null;
  if (!active) return; // torn down while waiting

  // Put the app into the state this card describes before showing the popover.
  if (step.prepare) {
    try {
      await step.prepare();
    } catch (err) {
      reportError("Onboarding tour step prepare failed", err);
    }
    if (!active) return;
  }

  const isLast = index === tour.steps.length - 1;

  driverObj.highlight({
    element: element ?? undefined,
    popover: {
      // Set per-step too: the global popoverClass isn't reliably applied on the
      // highlight() path, so the theme class must ride on each step's popover.
      popoverClass: "calibrate-tour",
      title: step.title,
      description: step.description,
      side: step.side ?? "bottom",
      align: step.align ?? "start",
      showButtons: ["next", "close"],
      nextBtnText: step.actionLabel ?? (isLast ? "Finish" : "Next"),
      onNextClick: () => {
        void advance();
      },
      onCloseClick: () => {
        finish("skipped");
      },
    },
  });
}

async function advance(): Promise<void> {
  if (!active) return;
  const step = active.tour.steps[active.index];

  if (step.action) {
    try {
      await step.action();
    } catch (err) {
      reportError("Onboarding tour step action failed", err);
    }
  }
  if (!active) return; // action may have ended the tour

  const isLast = active.index === active.tour.steps.length - 1;
  if (isLast) {
    finish("completed");
    return;
  }

  active.index += 1;
  await showStep();
}

function finish(status: TourSeenStatus): void {
  if (!active) return;
  const { tour, driverObj } = active;
  active.ending = true;
  active = null;
  markTourSeen(tour.id, status);
  clearProgress();
  driverObj.destroy();
}

/** Programmatically end the active tour (e.g. on sign-out). */
export function stopTour(): void {
  if (active) finish("skipped");
}
