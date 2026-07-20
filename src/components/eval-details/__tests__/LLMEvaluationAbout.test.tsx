import React from "react";
import { render, screen } from "../../../test-utils";
import {
  LLMEvaluationAbout,
  evaluatorSummaryToAbout,
  evaluatorColumnsToAbout,
} from "../LLMEvaluationAbout";

// The real AboutMetricsTable renders a table; assert on visible text.

describe("LLMEvaluationAbout", () => {
  it("always shows Test pass rate; built-in metrics gate on their flags", () => {
    render(<LLMEvaluationAbout />);
    expect(screen.getAllByText("Test pass rate").length).toBeGreaterThan(0);
    expect(screen.queryByText("Latency")).not.toBeInTheDocument();
    expect(screen.queryByText("Average cost")).not.toBeInTheDocument();
    expect(screen.queryByText("Average tokens")).not.toBeInTheDocument();
    expect(screen.queryByText("Tool-call pass rate")).not.toBeInTheDocument();
  });

  it("shows the flagged built-in metrics with the p50 / mean wording", () => {
    render(
      <LLMEvaluationAbout showToolCalls showLatency showCost showTokens />,
    );
    expect(screen.getAllByText("Tool-call pass rate").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Latency").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Average cost").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Average tokens").length).toBeGreaterThan(0);
    // Latency is disclosed as a median (p50), cost/tokens as averages.
    expect(screen.getAllByText(/median \(p50\)/i).length).toBeGreaterThan(0);
  });

  it("renders a row per evaluator with type-appropriate preference/range", () => {
    render(
      <LLMEvaluationAbout
        evaluators={[
          { key: "corr", label: "Correctness", description: "Is it right?", type: "binary" },
          {
            key: "help",
            label: "Helpfulness",
            description: "How helpful",
            type: "rating",
            scaleMin: 1,
            scaleMax: 5,
          },
        ]}
      />,
    );
    expect(screen.getAllByText("Correctness").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Helpfulness").length).toBeGreaterThan(0);
    // binary → Pass / Fail range; rating → its scale.
    expect(screen.getAllByText("Pass / Fail").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 - 5").length).toBeGreaterThan(0);
  });

  it("renders a rating evaluator with no scale as range '-'", () => {
    render(
      <LLMEvaluationAbout
        evaluators={[{ key: "q", label: "Quality", type: "rating" }]}
      />,
    );
    expect(screen.getAllByText("Quality").length).toBeGreaterThan(0);
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });
});

describe("evaluatorSummaryToAbout", () => {
  it("maps binary + rating summary entries, pulling scale from rating only", () => {
    const rows = evaluatorSummaryToAbout([
      { metric_key: "a", name: "A", description: "da", type: "binary", passed: 1, total: 2, pass_rate: 50 },
      {
        metric_key: "b",
        name: "B",
        description: "db",
        type: "rating",
        mean: 4,
        min: 1,
        max: 5,
        count: 3,
        scale_min: 1,
        scale_max: 5,
      },
    ]);
    expect(rows[0]).toEqual({
      key: "a",
      label: "A",
      description: "da",
      type: "binary",
      scaleMin: undefined,
      scaleMax: undefined,
    });
    expect(rows[1]).toMatchObject({ key: "b", label: "B", scaleMin: 1, scaleMax: 5 });
  });

  it("falls back to metric_key when name is absent, and tolerates null", () => {
    expect(evaluatorSummaryToAbout(null)).toEqual([]);
    const [row] = evaluatorSummaryToAbout([
      { metric_key: "k", type: "binary", passed: 0, total: 0, pass_rate: 0 },
    ]);
    expect(row.label).toBe("k");
  });
});

describe("evaluatorColumnsToAbout", () => {
  it("maps leaderboard evaluator columns to About rows", () => {
    const rows = evaluatorColumnsToAbout([
      { metric_key: "a", dataKey: "a", label: "A", type: "binary" },
      { metric_key: "b", dataKey: "b", label: "B", type: "rating", scale_min: 0, scale_max: 10, description: "d" },
    ]);
    expect(rows[0]).toMatchObject({ key: "a", label: "A", type: "binary" });
    expect(rows[1]).toMatchObject({ key: "b", scaleMin: 0, scaleMax: 10, description: "d" });
    expect(evaluatorColumnsToAbout(null)).toEqual([]);
  });
});
