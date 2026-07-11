import React from "react";
import { render, screen } from "@/test-utils";
import { BenchmarkCombinedLeaderboard } from "../BenchmarkCombinedLeaderboard";
import type {
  BenchmarkLeaderboardSummaryRow,
  BenchmarkModelLike,
} from "@/lib/benchmarkEvaluatorSummary";

describe("BenchmarkCombinedLeaderboard", () => {
  it("shows the empty state when there is no leaderboard data", () => {
    render(<BenchmarkCombinedLeaderboard modelResults={[]} filename="bench" />);
    expect(screen.getByText("No leaderboard data available")).toBeInTheDocument();
  });

  it("renders full table + charts with passed/total, pass rate, latency, cost, tokens, tool-call rate, binary and rating evaluators", () => {
    const leaderboardSummary: BenchmarkLeaderboardSummaryRow[] = [
      {
        model: "gpt-4.1",
        passed: "8",
        total: "10",
        pass_rate: "80",
        latency_p50: "1200",
        cost: "0.05",
        total_tokens: "500",
      },
      {
        model: "claude-3",
        passed: "9",
        total: "10",
        pass_rate: "90",
        latency_p50: "900",
        cost: "0.03",
        total_tokens: "400",
      },
    ];

    const modelResults: BenchmarkModelLike[] = [
      {
        model: "gpt-4.1",
        evaluator_summary: [
          {
            metric_key: "safety",
            name: "Safety",
            type: "binary",
            passed: 8,
            total: 10,
            pass_rate: 80,
          },
          {
            metric_key: "quality",
            name: "Quality",
            type: "rating",
            mean: 4.2,
            min: 1,
            max: 5,
            count: 10,
            scale_min: 1,
            scale_max: 5,
          },
        ],
        test_results: [
          {
            passed: true,
            test_case: { evaluation: { type: "tool_call" } },
          },
          {
            passed: false,
            test_case: { evaluation: { type: "tool_call" } },
          },
        ],
      },
      {
        model: "claude-3",
        evaluator_summary: [
          {
            metric_key: "safety",
            name: "Safety",
            type: "binary",
            passed: 9,
            total: 10,
            pass_rate: 90,
          },
          {
            metric_key: "quality",
            name: "Quality",
            type: "rating",
            mean: 4.5,
            min: 1,
            max: 5,
            count: 10,
            scale_min: 1,
            scale_max: 5,
          },
        ],
        test_results: [],
      },
    ];

    render(
      <BenchmarkCombinedLeaderboard
        leaderboardSummary={leaderboardSummary}
        modelResults={modelResults}
        filename="bench"
        formatModelName={(m) => `Model: ${m}`}
      />,
    );

    // Table headers
    expect(screen.getByText("Model")).toBeInTheDocument();
    expect(screen.getByText("Passed")).toBeInTheDocument();
    expect(screen.getByText("Total")).toBeInTheDocument();
    expect(screen.getAllByText("Test pass rate (%)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Latency").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Tool-call pass rate (%)").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Safety").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Quality (1–5)").length).toBeGreaterThan(0);

    // Rows render with formatted model name
    expect(screen.getAllByText("Model: gpt-4.1").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Model: claude-3").length).toBeGreaterThan(0);
  });

  it("uses a custom benchmarkScoreLabel for the pass-rate column and chart", () => {
    const leaderboardSummary: BenchmarkLeaderboardSummaryRow[] = [
      { model: "gpt-4.1", pass_rate: "50" },
    ];
    const modelResults: BenchmarkModelLike[] = [{ model: "gpt-4.1" }];

    render(
      <BenchmarkCombinedLeaderboard
        leaderboardSummary={leaderboardSummary}
        modelResults={modelResults}
        filename="bench"
        benchmarkScoreLabel="Custom Score (%)"
      />,
    );
    expect(screen.getAllByText("Custom Score (%)").length).toBeGreaterThan(0);
  });

  it("renders only evaluator columns when there is no leaderboardSummary", () => {
    const modelResults: BenchmarkModelLike[] = [
      {
        model: "gpt-4.1",
        evaluator_summary: [
          {
            metric_key: "helpfulness",
            type: "binary",
            passed: 5,
            total: 5,
            pass_rate: 100,
          },
        ],
      },
    ];
    render(<BenchmarkCombinedLeaderboard modelResults={modelResults} filename="bench" />);
    expect(screen.queryByText("Passed")).not.toBeInTheDocument();
    // "helpfulness" appears both as the table header and the chart title.
    expect(screen.getAllByText("helpfulness").length).toBeGreaterThan(0);
    expect(screen.getAllByText("gpt-4.1").length).toBeGreaterThan(0);
  });

  it("applies a custom className", () => {
    const leaderboardSummary: BenchmarkLeaderboardSummaryRow[] = [
      { model: "gpt-4.1", pass_rate: "50" },
    ];
    const modelResults: BenchmarkModelLike[] = [{ model: "gpt-4.1" }];
    const { container } = render(
      <BenchmarkCombinedLeaderboard
        leaderboardSummary={leaderboardSummary}
        modelResults={modelResults}
        filename="bench"
        className="my-custom-class"
      />,
    );
    expect(container.querySelector(".my-custom-class")).toBeInTheDocument();
  });
});
