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
import { markTourSeen, type TourSeenStatus } from "./state";

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
  /**
   * Show with no advance button and auto-advance once `action` resolves — for a
   * "waiting on something" card (e.g. a run in progress) that should move on by
   * itself when the wait ends, not on a click.
   */
  autoAdvance?: boolean;
  /** Extra popover class(es) for this step, merged with the base theme class. */
  popoverClass?: string;
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
  /**
   * Steps below this index auto-advance (run their prepare/action without
   * waiting for a click), then the tour pauses for manual control. Used to
   * fast-forward the setup while testing a later step; 0 = no auto-advance.
   */
  autoAdvanceUntil: number;
  /** Interval that recenters the card if its anchored element is removed. */
  anchorWatch?: number;
};

let active: ActiveTour | null = null;

export function isTourActive(): boolean {
  return active !== null;
}

/**
 * Hide/show every popover instantly (no fade). We hide it while a step sets up
 * (its `prepare` may open a dialog, tick options with animation delays, etc.) so
 * the PREVIOUS card never dangles in place during that work; it is shown again
 * the moment the new card renders. Not used during a step's `action` — a
 * "waiting" card (e.g. a run in progress) must stay visible while it waits.
 */
function setPopoverHidden(hidden: boolean): void {
  document.querySelectorAll<HTMLElement>(".driver-popover").forEach((el) => {
    el.style.transition = "none";
    el.style.opacity = hidden ? "0" : "1";
    el.style.pointerEvents = hidden ? "none" : "auto";
  });
}

function clearAnchorWatch(): void {
  if (active?.anchorWatch) {
    window.clearInterval(active.anchorWatch);
    active.anchorWatch = undefined;
  }
}

/**
 * Start (or resume) `tour` at `startIndex`. Only one tour runs at a time.
 * `autoAdvanceUntil` fast-forwards the steps before it (running their
 * prepare/action automatically), then pauses for manual control — a testing aid
 * for iterating on a later step without clicking through the setup each time.
 */
export async function runTour(
  tour: Tour,
  startIndex = 0,
  autoAdvanceUntil = 0,
): Promise<void> {
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
    // Darker overlay so the spotlighted element clearly stands out from the rest.
    overlayColor: "rgba(6, 6, 8, 0.86)",
    stagePadding: 8,
    stageRadius: 10,
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
        // The new card is now positioned — reveal it (it was hidden during the
        // step's setup so the previous card did not dangle).
        const el = wrapper as HTMLElement;
        el.style.opacity = "1";
        el.style.pointerEvents = "auto";
      }
      // A visible "Skip tour" affordance so the guide can be ended any time,
      // placed just left of the advance button. Ensure the footer + nav group
      // exist even on auto-advance cards (which render no next/prev buttons), so
      // Skip still shows there too.
      const footer = popover.footer as HTMLElement | undefined;
      if (footer) {
        footer.style.display = "flex";
        let nav = footer.querySelector<HTMLElement>(
          ".driver-popover-navigation-btns",
        );
        if (!nav) {
          nav = document.createElement("div");
          nav.className = "driver-popover-navigation-btns";
          footer.appendChild(nav);
        }
        if (!nav.querySelector(".calibrate-tour-skip")) {
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
      }
    },
    // Fires when driver requests a close from a backdrop click or Esc. The X
    // and "Skip tour" buttons close through their own handlers (which call
    // finish() → destroy() directly), so do nothing here: the tour ends only
    // via those explicit controls, never by clicking away.
    onDestroyStarted: () => {},
  });

  active = { tour, index: startIndex, driverObj, ending: false, autoAdvanceUntil };
  await showStep();
}

async function showStep(): Promise<void> {
  if (!active) return;
  clearAnchorWatch();
  const { tour, index, driverObj } = active;
  const step = tour.steps[index];
  if (!step) {
    finish("completed");
    return;
  }

  // Hide the current card while this step sets up, so the previous card does not
  // dangle in place during prepare / the anchor wait.
  setPopoverHidden(true);

  // Put the app into the state this card describes BEFORE waiting for the
  // anchor: a prepare that navigates (closes a dialog, switches tab) creates the
  // very element we then anchor to, so waiting first would just time out on an
  // element that does not exist yet. Prepares that fill values use waiting
  // helpers (or act on already-present elements), so running them first is safe.
  if (step.prepare) {
    try {
      await step.prepare();
    } catch (err) {
      reportError("Onboarding tour step prepare failed", err);
    }
    if (!active) return;
  }

  const element = step.anchor
    ? (await waitForElement(step.anchor, { timeout: step.timeout }))
    : null;
  if (!active) return; // torn down while waiting

  const isLast = index === tour.steps.length - 1;
  const showButtons: ("next" | "previous" | "close")[] = step.autoAdvance
    ? ["close"]
    : ["next", "close"];
  const popover = {
    // Set per-step too: the global popoverClass isn't reliably applied on the
    // highlight() path, so the theme class must ride on each step's popover.
    popoverClass: ["calibrate-tour", step.popoverClass].filter(Boolean).join(" "),
    title: step.title,
    description: step.description,
    side: step.side ?? "bottom",
    align: step.align ?? "start",
    showButtons,
    nextBtnText: step.actionLabel ?? (isLast ? "Finish" : "Next"),
    onNextClick: () => {
      void advance();
    },
    onCloseClick: () => {
      finish("skipped");
    },
  };

  driverObj.highlight({ element: element ?? undefined, popover });

  // If the anchored element later disappears (e.g. the user closes the dialog it
  // was pointing at), recenter the card so it does not dangle over empty space.
  if (element && step.anchor) {
    const sel = step.anchor;
    active.anchorWatch = window.setInterval(() => {
      if (!active) return;
      const el = document.querySelector<HTMLElement>(sel);
      if (!el || el.offsetParent === null) {
        clearAnchorWatch();
        driverObj.highlight({ popover });
      }
    }, 400);
  }

  // Testing fast-forward: auto-run this step and move on without a click.
  if (active.index < active.autoAdvanceUntil) {
    const at = active.index;
    window.setTimeout(() => {
      if (active && active.index === at && !active.ending) void advance();
    }, 250);
    return;
  }

  // Auto-advance card: run its action (the wait) and move on when it settles,
  // with no click. Guarded by the step index so a late resolve can't skip past
  // a step the user already advanced.
  if (step.autoAdvance) {
    const at = active.index;
    void (async () => {
      try {
        await step.action?.();
      } catch (err) {
        reportError("Onboarding tour auto-advance action failed", err);
      }
      if (active && active.index === at && !active.ending) {
        active.index += 1;
        await showStep();
      }
    })();
  }
}

async function advance(): Promise<void> {
  if (!active) return;
  clearAnchorWatch();
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
  clearAnchorWatch();
  const { tour, driverObj } = active;
  active.ending = true;
  active = null;
  markTourSeen(tour.id, status);
  driverObj.destroy();
}

/** Programmatically end the active tour (e.g. on sign-out). */
export function stopTour(): void {
  if (active) finish("skipped");
}
