import React from "react";
import { render, screen } from "@/test-utils";
import { BenchmarkTopPicks } from "../BenchmarkTopPicks";
import type {
  BenchmarkLeaderboardSummaryRow,
  BenchmarkModelLike,
} from "@/lib/benchmarkEvaluatorSummary";

// recharts' ResponsiveContainer needs a measured box; jsdom reports 0×0, so the
// chart body never renders. Stub the observer + layout box so the scatter mounts.
beforeAll(() => {
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  Object.defineProperty(HTMLElement.prototype, "getBoundingClientRect", {
    configurable: true,
    value: () => ({
      width: 640,
      height: 460,
      top: 0,
      left: 0,
      bottom: 460,
      right: 640,
      x: 0,
      y: 0,
      toJSON: () => {},
    }),
  });
});

describe("BenchmarkTopPicks", () => {
  it("renders the pareto chart when models have cost and pass rate", () => {
    const leaderboardSummary: BenchmarkLeaderboardSummaryRow[] = [
      { model: "gpt-4.1", pass_rate: "80", cost: "0.05", latency_p50: "1200" },
      { model: "claude-3", pass_rate: "90", cost: "0.03", latency_p50: "900" },
    ];
    const modelResults: BenchmarkModelLike[] = [
      { model: "gpt-4.1" },
      { model: "claude-3" },
    ];

    render(
      <BenchmarkTopPicks
        leaderboardSummary={leaderboardSummary}
        modelResults={modelResults}
        filename="bench"
      />,
    );

    expect(screen.getByText("Top picks for their cost")).toBeInTheDocument();
  });

  it("shows the no-value empty state when rows lack cost", () => {
    const leaderboardSummary: BenchmarkLeaderboardSummaryRow[] = [
      { model: "gpt-4.1", pass_rate: "80" },
    ];
    const modelResults: BenchmarkModelLike[] = [{ model: "gpt-4.1" }];

    render(
      <BenchmarkTopPicks
        leaderboardSummary={leaderboardSummary}
        modelResults={modelResults}
        filename="bench"
      />,
    );

    expect(
      screen.getByText("No cost or pass-rate data to compare models on value."),
    ).toBeInTheDocument();
    expect(screen.queryByText("Top picks for their cost")).not.toBeInTheDocument();
  });

  it("shows the empty state when there is no leaderboard data", () => {
    render(<BenchmarkTopPicks modelResults={[]} filename="bench" />);
    expect(screen.getByText("No leaderboard data available")).toBeInTheDocument();
  });
});
