import { render, act } from "@/test-utils";
import {
  hasSeenTour,
  markTourSeen,
  TOUR_IDS,
  TOUR_REQUEST_EVENT,
} from "../../lib/onboarding";

const mockRunTour = jest.fn().mockResolvedValue(undefined);
const mockIsTourActive = jest.fn().mockReturnValue(false);

jest.mock("../../lib/onboarding", () => {
  const actual = jest.requireActual<typeof import("../../lib/onboarding")>(
    "../../lib/onboarding",
  );
  return {
    ...actual,
    runTour: (...args: unknown[]) => mockRunTour(...args),
    isTourActive: () => mockIsTourActive(),
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
    jest.clearAllMocks();
    mockUsePathname.mockReturnValue("/agents");
    mockIsTourActive.mockReturnValue(false);
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
    expect(hasSeenTour(TOUR_IDS.firstEval)).toBe(false);
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

  it("starts on explicit request after clearing the seen flag", async () => {
    markTourSeen(TOUR_IDS.firstEval, "skipped");
    render(<OnboardingTour />);

    await act(async () => {
      window.dispatchEvent(
        new CustomEvent(TOUR_REQUEST_EVENT, { detail: TOUR_IDS.firstEval }),
      );
    });

    expect(hasSeenTour(TOUR_IDS.firstEval)).toBe(false);
    expect(mockRunTour).toHaveBeenCalledTimes(1);
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
});
