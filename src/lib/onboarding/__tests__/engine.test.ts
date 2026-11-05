const mockHighlight = jest.fn();
const mockDestroy = jest.fn();
let capturedDriverConfig: {
  onPopoverRender?: (popover: {
    wrapper?: HTMLElement;
    footer?: HTMLElement;
    progress?: HTMLElement;
  }) => void;
} | null = null;

jest.mock("../../reportError", () => ({
  reportError: jest.fn(),
}));

jest.mock("../dom", () => ({
  waitForElement: jest.fn(),
  isVisible: jest.requireActual("../dom").isVisible,
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

  it("keeps a step's interaction unlock when it recentres the card", async () => {
    jest.useFakeTimers();
    const anchor = document.createElement("div");
    anchor.id = "anchor";
    document.body.appendChild(anchor);
    (waitForElement as jest.Mock).mockResolvedValue(anchor);

    await runTour({
      id: "demo",
      steps: [
        {
          title: "Scroll it",
          description: "Look through the list",
          anchor: "#anchor",
          allowInteraction: true,
        },
        { title: "Done", description: "Finish" },
      ],
    });

    expect(mockHighlight.mock.calls[0][0].disableActiveInteraction).toBe(false);

    anchor.remove();
    jest.advanceTimersByTime(400);

    // The recentred card must stay unlocked: without this the list goes dead to
    // scrolling and ticking while the card still asks the reader to use it.
    const recentred = mockHighlight.mock.calls.at(-1)?.[0];
    expect(recentred.element).toBeUndefined();
    expect(recentred.disableActiveInteraction).toBe(false);

    jest.useRealTimers();
  });

  it("leaves the card alone when the anchor is inside a fixed dialog", async () => {
    jest.useFakeTimers();
    const anchor = document.createElement("div");
    anchor.id = "anchor";
    // Laid out, but with no offset parent — what every element inside a
    // fixed-position dialog reports.
    Object.defineProperty(anchor, "getClientRects", {
      configurable: true,
      value: () => [{ width: 10, height: 10 }],
    });
    Object.defineProperty(anchor, "offsetParent", {
      configurable: true,
      value: null,
    });
    document.body.appendChild(anchor);
    (waitForElement as jest.Mock).mockResolvedValue(anchor);

    await runTour({
      id: "demo",
      steps: [
        {
          title: "Pick it",
          description: "Tick a row",
          anchor: "#anchor",
          allowInteraction: true,
        },
        { title: "Done", description: "Finish" },
      ],
    });

    const before = mockHighlight.mock.calls.length;
    jest.advanceTimersByTime(1200);
    expect(mockHighlight.mock.calls.length).toBe(before);

    anchor.remove();
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
      steps: [
        { title: "One", description: "First" },
        { title: "Two", description: "Last" },
      ],
    });

    const footer = document.createElement("div");
    capturedDriverConfig?.onPopoverRender?.({
      wrapper: document.createElement("div"),
      footer,
    });

    const skip = footer.querySelector<HTMLButtonElement>(
      ".calibrate-tour-skip",
    );
    expect(skip?.textContent).toBe("Skip tour");
    skip?.click();

    expect(getTourStatus("demo")).toBe("skipped");
  });

  it("leaves Skip tour off the last card", async () => {
    await runTour({
      id: "demo",
      steps: [{ title: "One", description: "Only" }],
    });

    const footer = document.createElement("div");
    capturedDriverConfig?.onPopoverRender?.({
      wrapper: document.createElement("div"),
      footer,
    });

    expect(footer.querySelector(".calibrate-tour-skip")).toBeNull();
  });

  it("shows the step's place only on a tour that asks for it, and keeps it current", async () => {
    const render = (progress: HTMLElement) =>
      capturedDriverConfig?.onPopoverRender?.({ progress });
    const steps = [
      { title: "One", description: "First" },
      { title: "Two", description: "Last" },
    ];
    await runTour({ id: "plain", steps });
    const plain = document.createElement("span");
    render(plain);
    expect(plain.textContent).toBe("");

    await runTour({ id: "counted", steps, showStepCount: true });
    const counted = document.createElement("span");
    render(counted);
    expect(counted.textContent).toBe("1 of 2");
    expect(counted.style.display).toBe("block");

    mockHighlight.mock.calls.at(-1)?.[0].popover.onNextClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    render(counted);
    expect(counted.textContent).toBe("2 of 2");
  });

  it("offers Back from the second card on a tour that allows it, and steps back", async () => {
    const steps = [
      { title: "One", description: "First" },
      { title: "Two", description: "Last" },
    ];
    await runTour({ id: "back", steps, allowBack: true });
    const shown = () => mockHighlight.mock.calls.at(-1)?.[0].popover;
    expect(shown().showButtons).toEqual(["next", "close"]);
    shown().onNextClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(shown().title).toBe("Two");
    expect(shown().showButtons).toEqual(["previous", "next", "close"]);
    expect(shown().prevBtnText).toBe("Back");
    shown().onPrevClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(shown().title).toBe("One");
  });

  it("runs a step's leave however the step ends", async () => {
    const leave = jest.fn();
    const steps = [
      { title: "One", description: "First", leave },
      { title: "Two", description: "Last" },
    ];
    await runTour({ id: "left", steps, allowBack: true });
    mockHighlight.mock.calls.at(-1)?.[0].popover.onNextClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(leave).toHaveBeenCalledTimes(1);

    mockHighlight.mock.calls.at(-1)?.[0].popover.onPrevClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    stopTour();
    expect(leave).toHaveBeenCalledTimes(2);
  });

  it("does not offer Back on a tour that does not allow it", async () => {
    await runTour({
      id: "plain",
      steps: [
        { title: "One", description: "First" },
        { title: "Two", description: "Last" },
      ],
    });
    const shown = () => mockHighlight.mock.calls.at(-1)?.[0].popover;
    shown().onNextClick();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(shown().showButtons).toEqual(["next", "close"]);
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
