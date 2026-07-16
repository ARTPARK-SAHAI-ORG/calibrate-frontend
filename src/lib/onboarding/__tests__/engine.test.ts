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
