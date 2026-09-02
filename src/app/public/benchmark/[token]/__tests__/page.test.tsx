import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import PublicBenchmarkPage from "../page";

// The two charts are rendered for real elsewhere; here we only need the file
// name each one would download under.
const topPicksProps = jest.fn();
const leaderboardProps = jest.fn();
jest.mock("../../../../../components/eval-details", () => {
  const actual = jest.requireActual(
    "../../../../../components/eval-details",
  );
  return {
    ...actual,
    BenchmarkTopPicks: (props: { filename: string }) => {
      topPicksProps(props);
      return <div data-testid="top-picks" />;
    },
    BenchmarkCombinedLeaderboard: (props: { filename: string }) => {
      leaderboardProps(props);
      return <div data-testid="leaderboard" />;
    },
  };
});

jest.mock("next/navigation", () => ({
  useParams: () => ({ token: "tok-1" }),
  useRouter: () => ({ push: jest.fn(), replace: jest.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/public/benchmark/tok-1",
}));

const RUN = {
  task_id: "run-1",
  status: "done",
  leaderboard_summary: [
    { model: "alpha", pass_rate: "95", cost: "0.10", latency_p50: "1000" },
    { model: "beta", pass_rate: "70", cost: "0.02", latency_p50: "500" },
  ],
  model_results: [
    { model: "alpha", pass_rate: 95, test_results: [] },
    { model: "beta", pass_rate: 70, test_results: [] },
  ],
};

describe("PublicBenchmarkPage", () => {
  beforeEach(() => {
    // The public page chrome asks the browser whether it is in dark mode.
    window.matchMedia = jest.fn().mockReturnValue({
      matches: false,
      media: "(prefers-color-scheme: dark)",
      addEventListener: jest.fn(),
      removeEventListener: jest.fn(),
      addListener: jest.fn(),
      removeListener: jest.fn(),
      dispatchEvent: jest.fn(),
    });
    process.env.NEXT_PUBLIC_BACKEND_URL = "http://backend.test";
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => RUN,
    }) as unknown as typeof fetch;
    topPicksProps.mockClear();
    leaderboardProps.mockClear();
  });

  it("shows the priority sliders on the Model selection tab", async () => {
    const user = setupUser();
    render(<PublicBenchmarkPage />);

    const tab = await screen.findByRole("button", { name: /model selection/i });
    await user.click(tab);

    expect(screen.getByText("Rank by your priorities")).toBeInTheDocument();
    expect(screen.getByLabelText("Quality weight")).toBeInTheDocument();
    expect(screen.getByLabelText("Cost weight")).toBeInTheDocument();
    expect(screen.getByLabelText("Latency weight")).toBeInTheDocument();
  });

  it("names the two charts after what each one shows", async () => {
    const user = setupUser();
    render(<PublicBenchmarkPage />);

    await screen.findByTestId("leaderboard");
    expect(leaderboardProps).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "benchmark-leaderboard-tok-1" }),
    );

    await user.click(screen.getByRole("button", { name: /model selection/i }));
    expect(topPicksProps).toHaveBeenCalledWith(
      expect.objectContaining({ filename: "benchmark-top-picks-tok-1" }),
    );
  });
});
