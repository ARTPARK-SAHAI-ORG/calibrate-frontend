import {
  clearTourSeen,
  getTourStatus,
  hasSeenTour,
  markTourSeen,
  ONBOARDING_VERSION,
} from "../state";

const key = (tourId: string) =>
  `calibrate:onboarding:${ONBOARDING_VERSION}:${tourId}`;

describe("onboarding state", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("reports unseen until marked completed or skipped", () => {
    expect(hasSeenTour("first-eval")).toBe(false);
    expect(getTourStatus("first-eval")).toBeNull();

    markTourSeen("first-eval", "completed");
    expect(hasSeenTour("first-eval")).toBe(true);
    expect(getTourStatus("first-eval")).toBe("completed");
  });

  it("records skipped status and can be cleared for replay", () => {
    markTourSeen("first-eval", "skipped");
    expect(getTourStatus("first-eval")).toBe("skipped");

    clearTourSeen("first-eval");
    expect(hasSeenTour("first-eval")).toBe(false);
    expect(localStorage.getItem(key("first-eval"))).toBeNull();
  });

  it("ignores corrupt stored values", () => {
    localStorage.setItem(key("first-eval"), "garbage");
    expect(hasSeenTour("first-eval")).toBe(true);
    expect(getTourStatus("first-eval")).toBeNull();
  });

  it("tolerates disabled storage without throwing", () => {
    const getItem = jest
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const setItem = jest
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });

    expect(hasSeenTour("first-eval")).toBe(false);
    markTourSeen("first-eval", "completed");
    expect(hasSeenTour("first-eval")).toBe(false);
    clearTourSeen("first-eval");

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
