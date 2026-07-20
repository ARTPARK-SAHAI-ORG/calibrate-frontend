const mockHighlight = jest.fn();
const mockDestroy = jest.fn();
let capturedDriverConfig: {
  onPopoverRender?: (popover: {
    wrapper?: HTMLElement;
    footer?: HTMLElement;
  }) => void;
} | null = null;

jest.mock("../../reportError", () => ({
  reportError: jest.fn(),
}));

jest.mock("../dom", () => ({
  waitForElement: jest.fn(),
}));

jest.mock("driver.js", () => ({
  driver: jest.fn((config: typeof capturedDriverConfig) => {
    capturedDriverConfig = config;
    return { highlight: mockHighlight, destroy: mockDestroy };
  }),
}));

import { reportError } from "../../reportError";
import { waitForElement } from "../dom";
import { getTourStatus } from "../state";
import { isTourActive, runTour, stopTour } from "../engine";

describe("onboarding engine", () => {
  beforeEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    capturedDriverConfig = null;
    (waitForElement as jest.Mock).mockResolvedValue(null);
    stopTour();
  });

  it("runs a tour, advances on next, and marks completed on the last step", async () => {
    const action = jest.fn();
    await runTour({
      id: "demo",
      steps: [
        { title: "One", description: "First", action },
        { title: "Two", description: "Last" },
      ],
    });

    expect(isTourActive()).toBe(true);
    expect(mockHighlight).toHaveBeenCalled();

    const popover = mockHighlight.mock.calls[0][0].popover;
    await popover.onNextClick();
    expect(action).toHaveBeenCalled();

    const lastPopover = mockHighlight.mock.calls.at(-1)?.[0].popover;
    await lastPopover.onNextClick();

    expect(getTourStatus("demo")).toBe("completed");
    expect(isTourActive()).toBe(false);
    expect(mockDestroy).toHaveBeenCalled();
  });

  it("marks skipped when the close button is used or stopTour is called", async () => {
    await runTour({
      id: "demo",
      steps: [{ title: "One", description: "Only" }],
    });

    const popover = mockHighlight.mock.calls[0][0].popover;
    popover.onCloseClick();
    expect(getTourStatus("demo")).toBe("skipped");

    await runTour({
      id: "demo-2",
      steps: [{ title: "Again", description: "Step" }],
    });
    stopTour();
    expect(getTourStatus("demo-2")).toBe("skipped");
  });

  it("reports prepare and action failures without crashing the tour", async () => {
    await runTour({
      id: "demo",
      steps: [
        {
          title: "Prep",
          description: "Fails",
          prepare: async () => {
            throw new Error("prep failed");
          },
        },
        {
          title: "Act",
          description: "Fails",
          action: async () => {
            throw new Error("action failed");
          },
        },
        { title: "Done", description: "Finish" },
      ],
    });

    expect(reportError).toHaveBeenCalledWith(
      "Onboarding tour step prepare failed",
      expect.any(Error),
    );

    const firstPopover = mockHighlight.mock.calls[0][0].popover;
    await firstPopover.onNextClick();

    const secondPopover = mockHighlight.mock.calls.at(-1)?.[0].popover;
    await secondPopover.onNextClick();
    expect(reportError).toHaveBeenCalledWith(
      "Onboarding tour step action failed",
      expect.any(Error),
    );
  });

  it("auto-advances waiting steps and recenters when the anchor disappears", async () => {
    jest.useFakeTimers();
    const anchor = document.createElement("button");
    anchor.id = "anchor";
    document.body.appendChild(anchor);
    (waitForElement as jest.Mock).mockResolvedValue(anchor);

    const action = jest.fn().mockResolvedValue(undefined);
    await runTour({
      id: "demo",
      steps: [
        {
          title: "Wait",
          description: "Running",
          anchor: "#anchor",
          autoAdvance: true,
          action,
        },
        { title: "Done", description: "Finish" },
      ],
    });

    await Promise.resolve();
    expect(action).toHaveBeenCalled();

    anchor.remove();
    jest.advanceTimersByTime(400);
    expect(mockHighlight.mock.calls.length).toBeGreaterThan(1);

    jest.useRealTimers();
  });

  it("keeps the popover hidden while the next step sets up, then reveals it", async () => {
    let resolvePrepare!: () => void;
    const prepare = jest.fn(
      () => new Promise<void>((r) => (resolvePrepare = r)),
    );
    (waitForElement as jest.Mock).mockResolvedValue(null);

    await runTour({
      id: "demo",
      steps: [
        { title: "One", description: "First" },
        { title: "Two", description: "Second", prepare },
      ],
    });

    // Advance into step two; its prepare is pending, so the card is hidden.
    mockHighlight.mock.calls[0][0].popover.onNextClick();
    await Promise.resolve();
    expect(prepare).toHaveBeenCalled();

    // The dark overlay carries the highlight cutout; it must hide with the card.
    const overlay = document.createElement("div");
    overlay.className = "driver-overlay";
    document.body.appendChild(overlay);

    // A re-render during setup (e.g. driver refreshing while the app navigates)
    // must NOT un-hide the stale card or its highlight cutout.
    const midSetup = document.createElement("div");
    capturedDriverConfig?.onPopoverRender?.({ wrapper: midSetup });
    expect(midSetup.style.opacity).toBe("0");
    expect(overlay.style.visibility).toBe("hidden");

    // Once setup finishes the new card renders and both are revealed.
    resolvePrepare();
    await new Promise((r) => setTimeout(r, 0));
    const shown = document.createElement("div");
    capturedDriverConfig?.onPopoverRender?.({ wrapper: shown });
    expect(shown.style.opacity).toBe("1");
    expect(overlay.style.visibility).toBe("visible");

    overlay.remove();
  });

  it("hides the card and highlight as soon as a step's action starts", async () => {
    const overlay = document.createElement("div");
    overlay.className = "driver-overlay";
    const card = document.createElement("div");
    card.className = "driver-popover";
    document.body.appendChild(overlay);
    document.body.appendChild(card);

    let resolveAction!: () => void;
    const action = jest.fn(() => new Promise<void>((r) => (resolveAction = r)));
    (waitForElement as jest.Mock).mockResolvedValue(null);

    await runTour({
      id: "demo",
      steps: [
        { title: "One", description: "First", action },
        { title: "Two", description: "Second" },
      ],
    });

    // Step one is showing: simulate its render so the card and highlight show.
    capturedDriverConfig?.onPopoverRender?.({ wrapper: card });
    expect(card.style.opacity).toBe("1");
    expect(overlay.style.visibility).toBe("visible");

    // Click Next. The action is still running, but the card and its highlight
    // must already be hidden so they do not linger over the changing screen.
    mockHighlight.mock.calls[0][0].popover.onNextClick();
    await Promise.resolve();
    expect(action).toHaveBeenCalled();
    expect(card.style.opacity).toBe("0");
    expect(overlay.style.visibility).toBe("hidden");

    resolveAction();
    overlay.remove();
    card.remove();
  });

  it("injects a Skip tour button that ends the tour", async () => {
    await runTour({
      id: "demo",
      steps: [{ title: "One", description: "Only" }],
    });

    const footer = document.createElement("div");
    capturedDriverConfig?.onPopoverRender?.({
      wrapper: document.createElement("div"),
      footer,
    });

    const skip = footer.querySelector<HTMLButtonElement>(".calibrate-tour-skip");
    expect(skip?.textContent).toBe("Skip tour");
    skip?.click();

    expect(getTourStatus("demo")).toBe("skipped");
  });

  it("destroys a previous tour when a new one starts", async () => {
    await runTour({
      id: "first",
      steps: [{ title: "One", description: "Only" }],
    });
    const destroyCount = mockDestroy.mock.calls.length;

    await runTour({
      id: "second",
      steps: [{ title: "Two", description: "Only" }],
    });

    expect(mockDestroy.mock.calls.length).toBeGreaterThan(destroyCount);
    expect(getTourStatus("first")).toBeNull();
  });
});
