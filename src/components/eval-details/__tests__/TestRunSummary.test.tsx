import React from "react";
import { render, screen } from "@/test-utils";
import { TestRunSummary } from "../TestRunSummary";
import type { BenchmarkEvaluatorSummaryEntry } from "@/lib/benchmarkEvaluatorSummary";

describe("TestRunSummary", () => {
  it("renders pass rate, latency, cost, tokens with null aggregates as em dashes", () => {
    render(<TestRunSummary passed={0} total={0} />);
    expect(screen.getByText("Pass rate")).toBeInTheDocument();
    expect(screen.getByText("Latency")).toBeInTheDocument();
    expect(screen.getByText("Average cost")).toBeInTheDocument();
    expect(screen.getByText("Average tokens")).toBeInTheDocument();
    // total=0 -> rate is null -> "—"
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.getByText("0/0")).toBeInTheDocument();
  });

  it("computes pass rate percentage and progress bar width", () => {
    render(<TestRunSummary passed={3} total={4} />);
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("3/4")).toBeInTheDocument();
  });

  it("shows the tool-call card only when toolCall.total > 0, using a 5-col grid", () => {
    const { container, rerender } = render(
      <TestRunSummary passed={3} total={4} toolCall={{ passed: 1, total: 2 }} />,
    );
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();
    expect(container.querySelector(".md\\:grid-cols-5")).not.toBeNull();

    rerender(<TestRunSummary passed={2} total={4} toolCall={{ passed: 0, total: 0 }} />);
    expect(screen.queryByText("Tool calls")).not.toBeInTheDocument();
    expect(container.querySelector(".md\\:grid-cols-4")).not.toBeNull();
  });

  it("formats latency using p50 with a p95/p99 caption", () => {
    render(
      <TestRunSummary
        passed={1}
        total={1}
        latency={{ p50: 850, p95: 1200, p99: 1500, count: 5 }}
      />,
    );
    expect(screen.getByText("850 ms")).toBeInTheDocument();
    expect(screen.getByText("p95 1.2 s · p99 1.5 s")).toBeInTheDocument();
  });

  it("falls back to legacy mean latency and min-max caption", () => {
    render(
      <TestRunSummary
        passed={1}
        total={1}
        latency={{ mean: 500, min: 400, max: 600, count: 3 }}
      />,
    );
    expect(screen.getByText("500 ms")).toBeInTheDocument();
    expect(screen.getByText("400 ms – 600 ms")).toBeInTheDocument();
  });

  it("renders cost and tokens subtitles as min-max ranges when values differ across multiple samples", () => {
    render(
      <TestRunSummary
        passed={1}
        total={1}
        cost={{ mean: 0.05, min: 0.01, max: 0.1, count: 3 }}
        tokens={{ mean: 1234, min: 1000, max: 1500, count: 3 }}
      />,
    );
    expect(screen.getByText("$0.05")).toBeInTheDocument();
    expect(screen.getByText("$0.01 – $0.1")).toBeInTheDocument();
    expect(screen.getByText("1,234")).toBeInTheDocument();
    expect(screen.getByText("1,000 – 1,500")).toBeInTheDocument();
  });

  it("omits cost/tokens subtitle when count<=1 or min===max", () => {
    render(
      <TestRunSummary
        passed={1}
        total={1}
        cost={{ mean: 0.05, min: 0.05, max: 0.05, count: 1 }}
        tokens={{ mean: 100, min: 100, max: 100, count: 5 }}
      />,
    );
    expect(screen.getByText("$0.05")).toBeInTheDocument();
    expect(screen.getByText("100")).toBeInTheDocument();
  });

  it("renders binary evaluator card with pass-rate progress and evaluator link when uuid present", () => {
    const evaluatorSummary: BenchmarkEvaluatorSummaryEntry[] = [
      {
        metric_key: "semantic_match",
        name: "Semantic Match",
        description: "Checks meaning",
        evaluator_uuid: "uuid-123",
        type: "binary",
        passed: 8,
        total: 10,
        pass_rate: 80,
      },
    ];
    render(<TestRunSummary passed={1} total={1} evaluatorSummary={evaluatorSummary} />);
    expect(screen.getByText("Evaluators")).toBeInTheDocument();
    expect(screen.getByText("Semantic Match")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("8/10")).toBeInTheDocument();
    const link = screen.getByRole("link");
    expect(link).toHaveAttribute("href", "/evaluators/uuid-123");
  });

  it("renders binary evaluator as a plain div (no link) when enableEvaluatorLinks=false", () => {
    const evaluatorSummary: BenchmarkEvaluatorSummaryEntry[] = [
      {
        metric_key: "semantic_match",
        name: "Semantic Match",
        evaluator_uuid: "uuid-123",
        type: "binary",
        passed: 8,
        total: 10,
        pass_rate: 80,
      },
    ];
    render(
      <TestRunSummary
        passed={1}
        total={1}
        evaluatorSummary={evaluatorSummary}
        enableEvaluatorLinks={false}
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Semantic Match")).toBeInTheDocument();
  });

  it("renders binary evaluator as a plain div when uuid is missing even with links enabled", () => {
    const evaluatorSummary: BenchmarkEvaluatorSummaryEntry[] = [
      {
        metric_key: "no_uuid_metric",
        type: "binary",
        passed: 1,
        total: 2,
        pass_rate: 50,
      },
    ];
    render(<TestRunSummary passed={1} total={1} evaluatorSummary={evaluatorSummary} />);
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    // falls back to metric_key when name absent
    expect(screen.getByText("no_uuid_metric")).toBeInTheDocument();
  });

  it("renders rating evaluator card with scale caption and mean/scale value", () => {
    const evaluatorSummary: BenchmarkEvaluatorSummaryEntry[] = [
      {
        metric_key: "quality",
        name: "Quality",
        type: "rating",
        mean: 4.256,
        min: 3,
        max: 5,
        count: 7,
        scale_min: 1,
        scale_max: 5,
      },
    ];
    render(<TestRunSummary passed={1} total={1} evaluatorSummary={evaluatorSummary} />);
    expect(screen.getByText("Quality (1–5)")).toBeInTheDocument();
    expect(screen.getByText("4.26/5")).toBeInTheDocument();
    expect(screen.getByText("mean of 7")).toBeInTheDocument();
  });

  it("renders rating evaluator without scale suffix when scale_max is non-finite", () => {
    const evaluatorSummary: BenchmarkEvaluatorSummaryEntry[] = [
      {
        metric_key: "quality",
        name: "Quality",
        type: "rating",
        mean: 4.2,
        min: 3,
        max: 5,
        count: 7,
        scale_min: undefined as unknown as number,
        scale_max: undefined as unknown as number,
      },
    ];
    render(<TestRunSummary passed={1} total={1} evaluatorSummary={evaluatorSummary} />);
    expect(screen.getByText("Quality")).toBeInTheDocument();
    expect(screen.getByText("4.2")).toBeInTheDocument();
  });

  it("shows description tooltip icon when evaluator has a description", () => {
    const evaluatorSummary: BenchmarkEvaluatorSummaryEntry[] = [
      {
        metric_key: "quality",
        name: "Quality",
        description: "How good is it",
        type: "rating",
        mean: 4.2,
        min: 3,
        max: 5,
        count: 7,
        scale_min: 1,
        scale_max: 5,
      },
    ];
    const { container } = render(
      <TestRunSummary passed={1} total={1} evaluatorSummary={evaluatorSummary} />,
    );
    expect(container.querySelectorAll("svg").length).toBeGreaterThan(0);
  });

  it("does not render the Evaluators section when evaluatorSummary is empty or omitted", () => {
    render(<TestRunSummary passed={1} total={1} />);
    expect(screen.queryByText("Evaluators")).not.toBeInTheDocument();
  });
});
