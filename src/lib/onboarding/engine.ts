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
    // No "X of N" counter — it reads as a long checklist and intimidates.
    showProgress: false,
    onPopoverRender: (popover) => {
      if (!active) return;
      // Guarantee a single popover on screen. Because the tour drives across the
      // app's route changes (which remount the layer that hosts it), driver can
      // leave the previous popover/overlay orphaned in the DOM — remove any that
      // aren't the one currently rendering.
      const wrapper = popover.wrapper;
      if (wrapper) {
        document.querySelectorAll(".driver-popover").forEach((el) => {
          if (el !== wrapper) el.remove();
        });
        const overlays = document.querySelectorAll(".driver-overlay");
        overlays.forEach((el, i) => {
          if (i < overlays.length - 1) el.remove();
        });
      }
      const footer = popover.footer;
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
    // Fires when driver requests a close from a backdrop click or Esc. The X
    // and "Skip tour" buttons close through their own handlers (which call
    // finish() → destroy() directly), so do nothing here: the tour ends only
    // via those explicit controls, never by clicking away.
    onDestroyStarted: () => {},
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
