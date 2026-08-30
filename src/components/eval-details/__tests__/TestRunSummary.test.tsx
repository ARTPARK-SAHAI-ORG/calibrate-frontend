import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import { TestRunSummary } from "../TestRunSummary";
import type { BenchmarkEvaluatorSummaryEntry } from "@/lib/benchmarkEvaluatorSummary";
import { fetchEvaluatorDetail } from "@/lib/evaluatorApi";

jest.mock("../../../hooks", () => ({
  ...jest.requireActual("../../../hooks"),
  useAccessToken: () => "tok",
}));

jest.mock("../../../lib/evaluatorApi", () => ({
  ...jest.requireActual("../../../lib/evaluatorApi"),
  fetchEvaluatorDetail: jest.fn(),
}));

jest.mock("../../../lib/reportError", () => ({ reportError: jest.fn() }));

// jsdom has no ResizeObserver; the evaluator preview's prompt card measures
// its own overflow.
class MockResizeObserver {
  observe() {}
  disconnect() {}
}

beforeAll(() => {
  (
    global as unknown as { ResizeObserver: typeof MockResizeObserver }
  ).ResizeObserver = MockResizeObserver;
});

const mockFetchEvaluatorDetail = fetchEvaluatorDetail as jest.Mock;

beforeEach(() => {
  mockFetchEvaluatorDetail.mockReset();
  mockFetchEvaluatorDetail.mockResolvedValue({
    uuid: "uuid-123",
    name: "Semantic Match",
    output_type: "binary",
    evaluator_type: "llm",
    live_version_index: 0,
    versions: [
      {
        uuid: "v1",
        version_number: 1,
        judge_model: "google/gemini-2.5-flash",
        system_prompt: "Judge whether the meaning matches.",
        output_config: null,
        variables: null,
      },
    ],
  });
});

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

  it("drops the Tool calls card when the run's own evaluator already reports it", () => {
    const summary: BenchmarkEvaluatorSummaryEntry[] = [
      {
        metric_key: "tool-call-correctness",
        name: "Tool call correctness",
        evaluator_uuid: "ev-tool",
        type: "binary",
        passed: 1,
        total: 2,
        pass_rate: 50,
      },
    ];
    render(
      <TestRunSummary
        passed={3}
        total={4}
        toolCall={{ passed: 1, total: 2 }}
        toolCallEvaluatorUuid="ev-tool"
        evaluatorSummary={summary}
      />,
    );
    expect(screen.getByText("Tool call correctness")).toBeInTheDocument();
    // The same number would otherwise appear twice under Evaluators.
    expect(screen.queryByText("Tool calls")).not.toBeInTheDocument();
  });

  it("keeps the Tool calls card when the run carries no such evaluator", () => {
    render(
      <TestRunSummary
        passed={3}
        total={4}
        toolCall={{ passed: 1, total: 2 }}
        toolCallEvaluatorUuid={null}
      />,
    );
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
  });

  it("shows the tool-call card under Evaluators only when toolCall.total > 0", () => {
    const { rerender } = render(
      <TestRunSummary
        passed={3}
        total={4}
        toolCall={{ passed: 1, total: 2 }}
      />,
    );
    const toolCalls = screen.getByText("Tool calls");
    expect(toolCalls).toBeInTheDocument();
    expect(screen.getByText("Evaluators")).toBeInTheDocument();
    // The card sits in the Evaluators section, not in the top summary row.
    const section = screen.getByText("Evaluators").closest("div");
    expect(section).not.toBeNull();
    expect(section!.contains(toolCalls)).toBe(true);
    expect(section!.contains(screen.getByText("Pass rate"))).toBe(false);
    expect(screen.getByText("75%")).toBeInTheDocument();
    expect(screen.getByText("50%")).toBeInTheDocument();
    expect(screen.getByText("1/2")).toBeInTheDocument();

    rerender(
      <TestRunSummary
        passed={2}
        total={4}
        toolCall={{ passed: 0, total: 0 }}
      />,
    );
    expect(screen.queryByText("Tool calls")).not.toBeInTheDocument();
    expect(screen.queryByText("Evaluators")).not.toBeInTheDocument();
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

  it("renders binary evaluator card with pass-rate progress and, when clicked, opens how the evaluator judges", async () => {
    const user = setupUser();
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
    render(
      <TestRunSummary
        passed={1}
        total={1}
        evaluatorSummary={evaluatorSummary}
      />,
    );
    expect(screen.getByText("Evaluators")).toBeInTheDocument();
    expect(screen.getByText("80%")).toBeInTheDocument();
    expect(screen.getByText("8/10")).toBeInTheDocument();
    // No plain link out of the run window any more — a button that opens
    // the preview in a modal on top of it instead.
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    const card = screen.getByRole("button", { name: /Semantic Match/ });

    await user.click(card);

    expect(mockFetchEvaluatorDetail).toHaveBeenCalledWith("uuid-123", "tok");
    // Modal heading uses the evaluator's name; its own body text confirms
    // it's showing the evaluator's prompt, not just an empty shell.
    expect(
      await screen.findByRole("heading", { name: "Semantic Match" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Judge whether the meaning matches."),
    ).toBeInTheDocument();
  });

  it("renders binary evaluator as a plain div (no link, no button) when enableEvaluatorLinks=false", () => {
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
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
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
    render(
      <TestRunSummary
        passed={1}
        total={1}
        evaluatorSummary={evaluatorSummary}
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
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
    render(
      <TestRunSummary
        passed={1}
        total={1}
        evaluatorSummary={evaluatorSummary}
      />,
    );
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
    render(
      <TestRunSummary
        passed={1}
        total={1}
        evaluatorSummary={evaluatorSummary}
      />,
    );
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
      <TestRunSummary
        passed={1}
        total={1}
        evaluatorSummary={evaluatorSummary}
      />,
    );
    expect(container.querySelectorAll("svg").length).toBeGreaterThan(0);
  });

  it("does not render the Evaluators section when evaluatorSummary is empty or omitted", () => {
    render(<TestRunSummary passed={1} total={1} />);
    expect(screen.queryByText("Evaluators")).not.toBeInTheDocument();
  });
});

describe("tests that could not be run", () => {
  it("says nothing when every test was scored", () => {
    render(<TestRunSummary passed={9} total={10} />);
    expect(screen.queryByText(/could not be run/)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/stopped before it started every test/),
    ).not.toBeInTheDocument();
  });

  it("says how many were left out of the metrics, and names the tab to read them in", () => {
    render(<TestRunSummary passed={9} total={10} unanswered={3} />);
    expect(
      screen.getByText(
        /3 of 13 tests could not be run and were ignored for calculating the metrics/,
      ),
    ).toBeInTheDocument();
    // No handler given, so the tab is named but not clickable.
    expect(
      screen.queryByRole("button", { name: "Results tab" }),
    ).not.toBeInTheDocument();
  });

  it("opens the tab listing the tests when the note's link is clicked", async () => {
    const onReviewUnanswered = jest.fn();
    render(
      <TestRunSummary
        passed={9}
        total={10}
        unanswered={3}
        onReviewUnanswered={onReviewUnanswered}
      />,
    );
    await setupUser().click(
      screen.getByRole("button", { name: "Results tab" }),
    );
    expect(onReviewUnanswered).toHaveBeenCalled();
  });

  it("names the tab the same on every surface", () => {
    render(<TestRunSummary passed={9} total={10} unanswered={3} />);
    // The shared name, so the note cannot point at a tab called something
    // else on the public page.
    expect(screen.getByText("Results tab")).toBeInTheDocument();
  });

  it("says when the run gave up before starting every test", () => {
    render(<TestRunSummary passed={9} total={10} stoppedEarly />);
    expect(
      screen.getByText(/The run stopped before it started every test\./),
    ).toBeInTheDocument();
  });

  it("says when someone stopped the run", () => {
    render(<TestRunSummary passed={4} total={5} stopped />);
    expect(
      screen.getByText(/This run was stopped before it finished\./),
    ).toBeInTheDocument();
  });

  it("says a stopped run was stopped, not that it gave up on its own", () => {
    // A stopped run also reports that it never started every test. Saying
    // both reads as two separate things having gone wrong.
    render(<TestRunSummary passed={4} total={5} stopped stoppedEarly />);
    expect(
      screen.getByText(/This run was stopped before it finished\./),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/The run stopped before it started every test\./),
    ).not.toBeInTheDocument();
  });

  it("says none could be run rather than counting them all", () => {
    // 14 of 14 read as a sum the reader has to do; say it plainly instead,
    // and keep the stopped-early clause in the same sentence.
    render(<TestRunSummary passed={0} total={0} unanswered={14} stoppedEarly />);
    const note = screen.getByText(/None of the tests could be run\./);
    expect(note).toHaveTextContent(
      "None of the tests could be run. The run stopped before it started every test.",
    );
    expect(screen.queryByText(/14 of 14/)).not.toBeInTheDocument();
  });
});
