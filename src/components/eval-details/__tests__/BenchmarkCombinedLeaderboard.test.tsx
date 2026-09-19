import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import { BenchmarkCombinedLeaderboard } from "../BenchmarkCombinedLeaderboard";
import type {
  BenchmarkLeaderboardSummaryRow,
  BenchmarkModelLike,
} from "@/lib/benchmarkEvaluatorSummary";

describe("BenchmarkCombinedLeaderboard", () => {
  it("shows the empty state when there is no leaderboard data", () => {
    render(<BenchmarkCombinedLeaderboard modelResults={[]} filename="bench" />);
    expect(
      screen.getByText("No leaderboard data available"),
    ).toBeInTheDocument();
  });

  // A model is named the way a person says it, so the company that makes it is
  // left off both the table and the charts below it.
  it("names each model without the company that makes it", () => {
    render(
      <BenchmarkCombinedLeaderboard
        leaderboardSummary={[
          {
            model: "anthropic/claude-sonnet-4.6",
            passed: "9",
            total: "10",
            pass_rate: "90",
          },
          {
            model: "openai__gpt-4.1",
            passed: "8",
            total: "10",
            pass_rate: "80",
          },
        ]}
        modelResults={[
          {
            model: "anthropic/claude-sonnet-4.6",
            evaluator_summary: [],
            test_results: [],
          },
          { model: "openai__gpt-4.1", evaluator_summary: [], test_results: [] },
        ]}
        filename="bench"
      />,
    );
    expect(screen.getAllByText("claude-sonnet-4.6").length).toBeGreaterThan(0);
    expect(screen.getAllByText("gpt-4.1").length).toBeGreaterThan(0);
    expect(
      screen.queryByText("anthropic/claude-sonnet-4.6"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("openai__gpt-4.1")).not.toBeInTheDocument();
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
    expect(
      screen.getAllByText("Tool-call pass rate (%)").length,
    ).toBeGreaterThan(0);
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
    render(
      <BenchmarkCombinedLeaderboard
        modelResults={modelResults}
        filename="bench"
      />,
    );
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

describe("tests that could not be run", () => {
  it("links to the tests that could not be run, and opens that tab", async () => {
    const onReviewUnanswered = jest.fn();
    const user = setupUser();
    render(
      <BenchmarkCombinedLeaderboard
        leaderboardSummary={[{ model: "a", pass_rate: "50" }]}
        modelResults={[
          {
            model: "a",
            total_tests: 2,
            test_results: [
              { passed: true },
              { passed: false, unanswered: true },
            ],
          },
        ]}
        filename="x"
        onReviewUnanswered={onReviewUnanswered}
      />,
    );

    await user.click(screen.getByRole("button", { name: "Tests tab" }));
    expect(onReviewUnanswered).toHaveBeenCalled();
  });
});

describe("a comparison where no model answered anything", () => {
  const nothingRan = (
    <BenchmarkCombinedLeaderboard
      leaderboardSummary={[
        { model: "a", passed: "0", total: "0", pass_rate: "0" },
        { model: "b", passed: "0", total: "0", pass_rate: "0" },
      ]}
      modelResults={[
        {
          model: "a",
          total_tests: 2,
          test_results: [
            { passed: false, unanswered: true },
            { passed: false, unanswered: true },
          ],
        },
        {
          model: "b",
          total_tests: 2,
          test_results: [
            { passed: false, unanswered: true },
            { passed: false, unanswered: true },
          ],
        },
      ]}
      filename="x"
    />
  );

  it("shows the note on its own, with no table of zeroes and no empty chart", () => {
    render(nothingRan);
    expect(
      screen.getByText(/None of the tests could be run\./),
    ).toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /Download CSV/ }),
    ).not.toBeInTheDocument();
  });

  // Nothing says why the rows carry no verdict: the run was not stopped, it
  // did not break, and no test is marked as one that could not be run. Hiding
  // the table would leave the tab blank with nothing to read.
  it("keeps the table when no note says why there is nothing to show", () => {
    render(
      <BenchmarkCombinedLeaderboard
        leaderboardSummary={[{ model: "a", passed: "0", total: "2", pass_rate: "0" }]}
        modelResults={[
          {
            model: "a",
            total_tests: 2,
            test_results: [{ passed: null }, { passed: null }],
          },
        ]}
        filename="x"
      />,
    );
    expect(screen.getByRole("table")).toBeInTheDocument();
    expect(
      screen.queryByText("No leaderboard data available"),
    ).not.toBeInTheDocument();
  });
});

describe("a comparison where every model could not be run", () => {
  it("says so and points at the tests, instead of a bare no-data line", () => {
    render(
      <BenchmarkCombinedLeaderboard
        leaderboardSummary={[]}
        modelResults={[
          { model: "a", success: false, total_tests: 2, test_results: [] },
          { model: "b", success: false, total_tests: 2, test_results: [] },
        ]}
        filename="x"
      />,
    );
    expect(
      screen.getByText(/None of the models could be run\./),
    ).toBeInTheDocument();
    expect(screen.getByText("Tests tab")).toBeInTheDocument();
    expect(
      screen.queryByText("No leaderboard data available"),
    ).not.toBeInTheDocument();
  });

  it("counts the models that could not be run when only some could not", () => {
    render(
      <BenchmarkCombinedLeaderboard
        leaderboardSummary={[]}
        modelResults={[
          { model: "a", success: false, total_tests: 2, test_results: [] },
          {
            model: "b",
            success: true,
            total_tests: 2,
            test_results: [{ passed: true }, { passed: true }],
          },
        ]}
        filename="x"
      />,
    );
    expect(
      screen.getByText(/1 of 2 models could not be run\./),
    ).toBeInTheDocument();
    expect(
      screen.queryByText("No leaderboard data available"),
    ).not.toBeInTheDocument();
  });
});

describe("a run that gave up before it started every test", () => {
  const unansweredRun = (props: {
    stoppedEarly?: boolean;
    runStopped?: boolean;
  }) => (
    <BenchmarkCombinedLeaderboard
      leaderboardSummary={[{ model: "a", pass_rate: "50" }]}
      modelResults={[
        {
          model: "a",
          total_tests: 2,
          test_results: [{ passed: true }, { passed: false, unanswered: true }],
        },
      ]}
      filename="x"
      {...props}
    />
  );
  const sentence = /The evaluation stopped before it started every test\./;

  it("says so in the note about the tests that could not be run", () => {
    render(unansweredRun({ stoppedEarly: true }));
    expect(screen.getByText(sentence)).toBeInTheDocument();
  });

  it("says nothing when the run started every test", () => {
    render(unansweredRun({ stoppedEarly: false }));
    expect(screen.queryByText(sentence)).not.toBeInTheDocument();
  });

  it("says nothing when someone stopped the run, since that note covers it", () => {
    render(unansweredRun({ stoppedEarly: true, runStopped: true }));
    expect(screen.queryByText(sentence)).not.toBeInTheDocument();
  });
});

describe("a run someone stopped", () => {
  it("says the run was stopped, and points at the tests that did run", () => {
    render(
      <BenchmarkCombinedLeaderboard
        modelResults={[
          {
            model: "a",
            total_tests: 6,
            test_results: [
              { passed: true },
              { passed: false },
              { passed: null },
            ],
          },
        ]}
        filename="x"
        runStopped
      />,
    );
    expect(
      screen.getByText(/This run was stopped before it finished\./),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/The tests that did run are in the/),
    ).toBeInTheDocument();
  });

  // Every test is run once per model, so adding the models up would say 30
  // tests for a comparison of 10 tests across three models, while the run's
  // own Tests column says 10.
  it("counts no tests, so it cannot count one test once per model", () => {
    render(
      <BenchmarkCombinedLeaderboard
        modelResults={[
          {
            model: "a",
            total_tests: 10,
            test_results: [{ passed: true }, { passed: false }],
          },
          {
            model: "b",
            total_tests: 10,
            test_results: [{ passed: true }, { passed: true }],
          },
          {
            model: "c",
            total_tests: 10,
            test_results: [{ passed: true }],
          },
        ]}
        filename="x"
        runStopped
      />,
    );
    expect(screen.queryByText(/of 30/)).not.toBeInTheDocument();
    expect(screen.queryByText(/5 of/)).not.toBeInTheDocument();
    expect(
      screen.getByText(/This run was stopped before it finished\./),
    ).toBeInTheDocument();
  });

  it("links to the tests that did run, and opens that tab", async () => {
    const onReviewUnanswered = jest.fn();
    const user = setupUser();
    render(
      <BenchmarkCombinedLeaderboard
        modelResults={[
          { model: "a", total_tests: 4, test_results: [{ passed: true }] },
        ]}
        filename="x"
        runStopped
        onReviewUnanswered={onReviewUnanswered}
      />,
    );
    await user.click(screen.getByRole("button", { name: /tab/ }));
    expect(onReviewUnanswered).toHaveBeenCalled();
  });

  it("says why there is nothing to compare", () => {
    render(
      <BenchmarkCombinedLeaderboard
        modelResults={[]}
        filename="x"
        runStopped
      />,
    );
    expect(
      screen.getByText("This run was stopped before any test ran."),
    ).toBeInTheDocument();
  });

  it("shows why the run broke as well as the fact it was stopped", () => {
    render(
      <BenchmarkCombinedLeaderboard
        leaderboardSummary={[]}
        modelResults={[
          { model: "a", total_tests: 2, test_results: [{ passed: null }] },
        ]}
        filename="x"
        runStopped
        failureReason="calibrate-agent process killed by signal 15"
      />,
    );
    expect(
      screen.getByText(/This run was stopped before any test ran\./),
    ).toBeInTheDocument();
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByText("calibrate-agent process killed by signal 15"),
    ).toBeInTheDocument();
  });
});

describe("a comparison where nothing could be run", () => {
  it("says so even though the run itself did not break", () => {
    render(
      <BenchmarkCombinedLeaderboard
        leaderboardSummary={[]}
        modelResults={[
          {
            model: "a",
            total_tests: 2,
            test_results: [
              { passed: false, unanswered: true },
              { passed: false, unanswered: true },
            ],
          },
        ]}
        filename="x"
      />,
    );
    expect(
      screen.getByText(/None of the tests could be run\./),
    ).toBeInTheDocument();
    // The note already says why there is nothing to show, so the bare line
    // would only repeat it back with less to go on.
    expect(
      screen.queryByText("No leaderboard data available"),
    ).not.toBeInTheDocument();
  });
});

describe("a run that failed after finishing some tests", () => {
  const failedRun = (failureReason: string | null) => (
    <BenchmarkCombinedLeaderboard
      leaderboardSummary={[{ model: "a", pass_rate: "100" }]}
      modelResults={[
        {
          model: "a",
          total_tests: 4,
          test_results: [
            { passed: true },
            { passed: true },
            { passed: true },
            { passed: null },
          ],
        },
      ]}
      filename="x"
      failureReason={failureReason}
    />
  );

  it("says how far it got and shows the recorded details, even with no unanswered rows", () => {
    render(failedRun("Traceback: judge unreachable"));
    expect(screen.getByText("Something went wrong")).toBeInTheDocument();
    expect(
      screen.getByText(
        /The evaluation failed after 3 of 4 tests\. Review the tests that were run in the/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(screen.getByText("Traceback: judge unreachable").tagName).toBe(
      "PRE",
    );
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
  });

  it("shows the sentence with no details block when the backend recorded nothing in text", () => {
    render(failedRun(""));
    expect(
      screen.getByText(/The evaluation failed after 3 of 4 tests/),
    ).toBeInTheDocument();
    expect(screen.queryByText("Details")).not.toBeInTheDocument();
  });

  it("opens the Tests tab from the sentence", async () => {
    const onReviewUnanswered = jest.fn();
    render(
      <BenchmarkCombinedLeaderboard
        leaderboardSummary={[{ model: "a", pass_rate: "100" }]}
        modelResults={[
          {
            model: "a",
            total_tests: 2,
            test_results: [{ passed: true }, { passed: null }],
          },
        ]}
        filename="x"
        failureReason="boom"
        onReviewUnanswered={onReviewUnanswered}
      />,
    );
    await setupUser().click(screen.getByRole("button", { name: "Tests tab" }));
    expect(onReviewUnanswered).toHaveBeenCalled();
  });

  it("shows the failure box above the empty message when there are no leaderboard rows", () => {
    render(
      <BenchmarkCombinedLeaderboard
        leaderboardSummary={[]}
        modelResults={[
          {
            model: "a",
            total_tests: 2,
            test_results: [{ passed: null }, { passed: null }],
          },
        ]}
        filename="x"
        failureReason="boom"
      />,
    );
    expect(
      screen.getByText(
        "The evaluation run failed before it produced any result.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("boom")).toBeInTheDocument();
    expect(
      screen.queryByText("No leaderboard data available"),
    ).not.toBeInTheDocument();
  });

  it("gives no count when the models got different distances", () => {
    render(
      <BenchmarkCombinedLeaderboard
        leaderboardSummary={[{ model: "a", pass_rate: "100" }]}
        modelResults={[
          {
            model: "a",
            total_tests: 4,
            test_results: [{ passed: true }, { passed: true }],
          },
          {
            model: "b",
            total_tests: 4,
            test_results: [{ passed: true }],
          },
        ]}
        filename="x"
        failureReason="boom"
      />,
    );
    expect(
      screen.getByText(/The evaluation failed before it ran every test\./),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/The evaluation failed after/),
    ).not.toBeInTheDocument();
  });

  it("shows no failure box without a reason", () => {
    render(failedRun(null));
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
    expect(
      screen.queryByText(/The evaluation failed after/),
    ).not.toBeInTheDocument();
  });
});

describe("a run that failed before any model produced a row", () => {
  it("still shows the failure box", () => {
    render(
      <BenchmarkCombinedLeaderboard
        leaderboardSummary={[]}
        modelResults={[{ model: "a", total_tests: 4, test_results: [] }]}
        filename="x"
        failureReason="ValueError: boom"
      />,
    );
    expect(
      screen.getByText(
        "The evaluation run failed before it produced any result.",
      ),
    ).toBeInTheDocument();
    // Nothing ran, so there is no Tests tab worth pointing at.
    expect(screen.queryByText(/Review the tests/)).not.toBeInTheDocument();
    expect(screen.getByText("ValueError: boom")).toBeInTheDocument();
  });
});

describe("a finished comparison that left a test with no verdict", () => {
  it("says so above the table, the same way the mark by the name does", () => {
    render(
      <BenchmarkCombinedLeaderboard
        leaderboardSummary={[{ model: "a", pass_rate: "50" }]}
        modelResults={[
          {
            model: "a",
            total_tests: 2,
            test_results: [{ passed: true }, { passed: null }],
          },
        ]}
        filename="x"
        runOver
      />,
    );
    expect(
      screen.getByText(/tests could not be run and were ignored/),
    ).toBeInTheDocument();
  });

  it("says nothing while the run is still going", () => {
    render(
      <BenchmarkCombinedLeaderboard
        leaderboardSummary={[{ model: "a", pass_rate: "50" }]}
        modelResults={[
          {
            model: "a",
            total_tests: 2,
            test_results: [{ passed: true }, { passed: null }],
          },
        ]}
        filename="x"
      />,
    );
    expect(
      screen.queryByText(/tests could not be run and were ignored/),
    ).not.toBeInTheDocument();
  });
});

describe("a comparison someone stopped before any test ran", () => {
  it("says it once, not in two boxes", () => {
    render(
      <BenchmarkCombinedLeaderboard
        modelResults={[
          {
            model: "a",
            total_tests: 2,
            test_results: [{ passed: null }, { passed: null }],
          },
        ]}
        filename="x"
        runStopped
        runOver
      />,
    );
    expect(
      screen.getByText(/This run was stopped before any test ran\./),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(/None of the tests could be run\./),
    ).not.toBeInTheDocument();
  });

  it("still says how many could not be run when some did run", () => {
    render(
      <BenchmarkCombinedLeaderboard
        leaderboardSummary={[{ model: "a", pass_rate: "50" }]}
        modelResults={[
          {
            model: "a",
            total_tests: 2,
            test_results: [{ passed: true }, { passed: null }],
          },
        ]}
        filename="x"
        runStopped
        runOver
      />,
    );
    expect(
      screen.getByText(/tests could not be run and were ignored/),
    ).toBeInTheDocument();
  });
});
