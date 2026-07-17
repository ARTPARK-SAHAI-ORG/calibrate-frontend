import { render, act } from "@/test-utils";
import {
  hasSeenTour,
  markTourSeen,
  TOUR_IDS,
  TOUR_REQUEST_EVENT,
} from "../../lib/onboarding";

const mockRunTour = jest.fn().mockResolvedValue(undefined);
const mockIsTourActive = jest.fn().mockReturnValue(false);
const mockResolvePlan = jest.fn().mockResolvedValue({
  correctnessName: "Correctness",
  secondEvaluatorName: null,
});

jest.mock("../../lib/onboarding", () => {
  const actual = jest.requireActual<typeof import("../../lib/onboarding")>(
    "../../lib/onboarding",
  );
  return {
    ...actual,
    runTour: (...args: unknown[]) => mockRunTour(...args),
    isTourActive: () => mockIsTourActive(),
    resolveEvaluatorPlan: (...args: unknown[]) => mockResolvePlan(...args),
    buildFirstEvalTour: jest.fn(() => ({ id: "first-eval", steps: [] })),
  };
});

const mockUsePathname = jest.fn(() => "/agents");

jest.mock("next/navigation", () => ({
  __esModule: true,
  usePathname: () => mockUsePathname(),
  useRouter: () => ({
    push: jest.fn(),
    replace: jest.fn(),
    back: jest.fn(),
    forward: jest.fn(),
    refresh: jest.fn(),
    prefetch: jest.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
  redirect: jest.fn(),
  notFound: jest.fn(),
}));

import { OnboardingTour } from "../OnboardingTour";

describe("OnboardingTour", () => {
  const originalInnerWidth = window.innerWidth;

  beforeEach(() => {
    localStorage.clear();
    // A token so the tour's pre-start token wait resolves immediately (the plan
    // lookup itself is mocked).
    localStorage.setItem("access_token", "test-token");
    jest.clearAllMocks();
    mockUsePathname.mockReturnValue("/agents");
    mockIsTourActive.mockReturnValue(false);
    mockResolvePlan.mockResolvedValue({
      correctnessName: "Correctness",
      secondEvaluatorName: null,
    });
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1024,
    });
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: originalInnerWidth,
    });
  });

  it("auto-starts the flagship tour on the first desktop visit to /agents", async () => {
    render(<OnboardingTour />);

    await act(async () => {
      jest.advanceTimersByTime(700);
    });

    expect(mockRunTour).toHaveBeenCalledTimes(1);
    // Marked seen the moment it starts, so a reload won't auto-restart it.
    expect(hasSeenTour(TOUR_IDS.firstEval)).toBe(true);
  });

  it("does not auto-start when the tour was already seen", async () => {
    markTourSeen(TOUR_IDS.firstEval, "completed");
    render(<OnboardingTour />);

    await act(async () => {
      jest.advanceTimersByTime(700);
    });

    expect(mockRunTour).not.toHaveBeenCalled();
  });

  it("does not auto-start on mobile or off the agents page", async () => {
    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 500,
    });
    render(<OnboardingTour />);
    await act(async () => {
      jest.advanceTimersByTime(700);
    });
    expect(mockRunTour).not.toHaveBeenCalled();

    Object.defineProperty(window, "innerWidth", {
      configurable: true,
      value: 1024,
    });
    mockUsePathname.mockReturnValue("/tools");
    render(<OnboardingTour />);
    await act(async () => {
      jest.advanceTimersByTime(700);
    });
    expect(mockRunTour).not.toHaveBeenCalled();
  });

  it("replays on explicit request even when already seen, without un-seeing it", async () => {
    markTourSeen(TOUR_IDS.firstEval, "completed");
    render(<OnboardingTour />);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(TOUR_REQUEST_EVENT, { detail: TOUR_IDS.firstEval }),
      );
    });

    // The button starts it regardless of the flag, and does NOT clear the flag
    // (clearing would make a later reload auto-restart it).
    expect(mockRunTour).toHaveBeenCalledTimes(1);
    expect(hasSeenTour(TOUR_IDS.firstEval)).toBe(true);
  });

  it("does not auto-restart after the button starts it (reload)", async () => {
    // Fresh user clicks the button: it starts and marks seen.
    render(<OnboardingTour />);
    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(TOUR_REQUEST_EVENT, { detail: TOUR_IDS.firstEval }),
      );
    });
    expect(mockRunTour).toHaveBeenCalledTimes(1);

    // Simulate a reload: a fresh mount on /agents must NOT auto-start again.
    mockRunTour.mockClear();
    render(<OnboardingTour />);
    await act(async () => {
      jest.advanceTimersByTime(700);
    });
    expect(mockRunTour).not.toHaveBeenCalled();
  });

  it("ignores tour requests while a tour is already active", async () => {
    mockIsTourActive.mockReturnValue(true);
    render(<OnboardingTour />);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(TOUR_REQUEST_EVENT, { detail: TOUR_IDS.firstEval }),
      );
    });

    expect(mockRunTour).not.toHaveBeenCalled();
  });

  it("still starts (with the fallback plan) when the token never hydrates", async () => {
    // No token: the pre-start token wait loops to its cap, then proceeds.
    localStorage.removeItem("access_token");
    markTourSeen(TOUR_IDS.firstEval, "skipped");
    render(<OnboardingTour />);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(TOUR_REQUEST_EVENT, { detail: TOUR_IDS.firstEval }),
      );
    });

    // Drive the token-wait loop (20 × 100ms) to completion.
    for (let i = 0; i < 21; i++) {
      await act(async () => {
        jest.advanceTimersByTime(100);
      });
    }

    expect(mockRunTour).toHaveBeenCalledTimes(1);
  });
});
