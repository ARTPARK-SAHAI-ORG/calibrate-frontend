import React from "react";
import { render, screen, setupUser, waitFor } from "../../../test-utils";
import {
  BenchmarkResultView,
  benchmarkCsvRows,
  evaluatorsByUuid,
  formatBenchmarkModelName,
  withTestType,
  type BenchmarkModelRows,
  type BenchmarkTabId,
} from "../BenchmarkResultView";

// The list of tests is covered by its own tests. Here it only has to report
// what the shared view handed it.
jest.mock("../../eval-details", () => {
  const actual = jest.requireActual("../../eval-details");
  return {
    ...actual,
    __esModule: true,
    BenchmarkOutputsPanel: (props: any) => (
      <div data-testid="outputs-panel">
        <div data-testid="panel-models">
          {JSON.stringify(
            props.modelResults.map((m: any) => props.formatModelName(m.model)),
          )}
        </div>
        <div data-testid="panel-rows">
          {JSON.stringify(
            props.modelResults.flatMap((m: any) =>
              (m.test_results ?? []).map((r: any) => ({
                name: r.name,
                reply: r.output?.response ?? null,
                type: r.test_case?.evaluation?.type ?? null,
                loading: !!r.loading,
              })),
            ),
          )}
        </div>
        <div data-testid="panel-flags">
          {JSON.stringify({
            showControls: !!props.showControls,
            evaluatorLinks: !!props.enableEvaluatorLinks,
            spinner: !!props.showRunningSpinner,
            labelling: props.labellingSelection
              ? Array.from(props.labellingSelection)
              : null,
          })}
        </div>
        <button
          onClick={() => props.onSelectTest(props.modelResults[0]?.model, 0)}
        >
          open first test
        </button>
        <button
          onClick={() =>
            props.onSelectTest(props.modelResults[0]?.model, 1)
          }
        >
          open second test
        </button>
        <div data-testid="panel-expanded">
          {JSON.stringify(Array.from(props.expandedModels))}
        </div>
        <button onClick={() => props.onToggleModel(props.modelResults[1]?.model)}>
          toggle second model
        </button>
        <button
          onClick={() =>
            props.onNavChange?.({
              currentIndex: 0,
              total: 2,
              goPrev: () => {},
              goNext: () => {},
            })
          }
        >
          report nav
        </button>
      </div>
    ),
  };
});

const MODELS: BenchmarkModelRows[] = [
  {
    model: "google__gemini-2.5-flash",
    success: true,
    message: "",
    total_tests: 2,
    passed: 2,
    failed: 0,
    test_results: [
      { name: "First test", passed: true, test_uuid: "t1", test_type: "response" },
      { name: "Second test", passed: false, test_uuid: "t2", test_type: "tool_call" },
    ],
  },
  {
    model: "openai__gpt-4.1",
    success: true,
    message: "",
    total_tests: 2,
    passed: 1,
    failed: 1,
    test_results: [
      { name: "First test", passed: true, test_uuid: "t1", test_type: "response" },
    ],
  },
];

/** A run with cost and speed for every model, so the Model selection tab has
 * something to rank. */
const LEADERBOARD = [
  { model: "google__gemini-2.5-flash", pass_rate: "100", cost: "0.10", latency_p50: "1000" },
  { model: "openai__gpt-4.1", pass_rate: "50", cost: "0.02", latency_p50: "500" },
];

function Harness({
  surface,
  initialTab = "summary",
  ...rest
}: {
  surface: "window" | "public";
  initialTab?: BenchmarkTabId;
  [key: string]: unknown;
}) {
  const [tab, setTab] = React.useState<BenchmarkTabId>(initialTab);
  return (
    <BenchmarkResultView
      surface={surface}
      isDone
      modelResults={MODELS}
      leaderboardSummary={LEADERBOARD}
      activeTab={tab}
      onTabChange={setTab}
      // Never settles, so a test that does not care about the answer cannot
      // have it land after the test has finished.
      fetchCase={() => new Promise(() => {})}
      filenameKey="my agent"
      {...rest}
    />
  );
}

describe("BenchmarkResultView", () => {
  // The bug this component exists to stop: the sliders were added to the run
  // window and never to the shared link.
  it.each(["window", "public"] as const)(
    "puts the priority sliders on the Model selection tab of the %s",
    async (surface) => {
      const user = setupUser();
      render(<Harness surface={surface} />);

      await user.click(screen.getByRole("button", { name: "Model selection" }));

      expect(screen.getByText("Rank by your priorities")).toBeInTheDocument();
      expect(screen.getByLabelText("Quality weight")).toBeInTheDocument();
      expect(screen.getByLabelText("Cost weight")).toBeInTheDocument();
      expect(screen.getByLabelText("Latency weight")).toBeInTheDocument();
    },
  );

  it.each(["window", "public"] as const)(
    "writes a model name with a slash on the %s",
    (surface) => {
      render(<Harness surface={surface} initialTab="tests" />);
      expect(screen.getByTestId("panel-models")).toHaveTextContent(
        "google/gemini-2.5-flash",
      );
      expect(screen.getByTestId("panel-models")).toHaveTextContent(
        "openai/gpt-4.1",
      );
    },
  );

  it.each(["window", "public"] as const)(
    "says what kind of test each row ran on the %s",
    (surface) => {
      render(<Harness surface={surface} initialTab="tests" />);
      const rows = JSON.parse(
        screen.getByTestId("panel-rows").textContent as string,
      );
      expect(rows.map((r: any) => r.type)).toEqual([
        "response",
        "tool_call",
        "response",
      ]);
    },
  );

  it.each(["window", "public"] as const)(
    "says what each number means on the About tab of the %s",
    async (surface) => {
      const user = setupUser();
      render(<Harness surface={surface} />);

      await user.click(screen.getByRole("button", { name: "About" }));

      expect(screen.getAllByText("Test pass rate").length).toBeGreaterThan(0);
      expect(
        screen.getAllByText(
          "Average cost per test in USD (input + output) across all tests.",
        ).length,
      ).toBeGreaterThan(0);
    },
  );

  it("draws a run that has no models at all", () => {
    render(
      <BenchmarkResultView
        surface="public"
        isDone
        modelResults={[]}
        activeTab="tests"
        onTabChange={jest.fn()}
        fetchCase={() => new Promise(() => {})}
        filenameKey="k"
      />,
    );
    expect(screen.queryByTestId("outputs-panel")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Tests" })).toBeInTheDocument();
  });

  it("hides the Model selection tab when there is nothing to rank", () => {
    render(
      <BenchmarkResultView
        surface="public"
        isDone
        modelResults={MODELS}
        activeTab="summary"
        onTabChange={jest.fn()}
        fetchCase={() => new Promise(() => {})}
        filenameKey="k"
      />,
    );
    expect(
      screen.queryByRole("button", { name: "Model selection" }),
    ).not.toBeInTheDocument();
  });

  it("reads the open test in full and shows its reply", async () => {
    const fetchCase = jest.fn().mockResolvedValue({
      output: { response: "The full reply" },
      test_case: { evaluation: { type: "response" } },
    });
    render(
      <BenchmarkResultView
        surface="public"
        isDone
        modelResults={MODELS}
        activeTab="tests"
        onTabChange={jest.fn()}
        fetchCase={fetchCase}
        filenameKey="k"
      />,
    );

    // The first test with an answer opens on its own.
    await waitFor(() =>
      expect(screen.getByTestId("panel-rows")).toHaveTextContent(
        "The full reply",
      ),
    );
    expect(fetchCase).toHaveBeenCalledTimes(1);
    expect(fetchCase).toHaveBeenCalledWith("t1", "google__gemini-2.5-flash");
  });

  it("does not read the same test twice", async () => {
    const fetchCase = jest.fn().mockResolvedValue({
      output: { response: "The full reply" },
    });
    const user = setupUser();
    render(
      <BenchmarkResultView
        surface="public"
        isDone
        modelResults={MODELS}
        activeTab="tests"
        onTabChange={jest.fn()}
        fetchCase={fetchCase}
        filenameKey="k"
      />,
    );
    await waitFor(() => expect(fetchCase).toHaveBeenCalledTimes(1));

    await user.click(screen.getByText("open second test"));
    await waitFor(() => expect(fetchCase).toHaveBeenCalledTimes(2));

    await user.click(screen.getByText("open first test"));
    await waitFor(() =>
      expect(screen.getByTestId("panel-rows")).not.toHaveTextContent(
        '"loading":true',
      ),
    );
    expect(fetchCase).toHaveBeenCalledTimes(2);
  });

  it("keeps what it already had when a test cannot be read, and does not ask again", async () => {
    const fetchCase = jest.fn().mockRejectedValue(new Error("nope"));
    const user = setupUser();
    render(
      <BenchmarkResultView
        surface="public"
        isDone
        modelResults={MODELS}
        activeTab="tests"
        onTabChange={jest.fn()}
        fetchCase={fetchCase}
        filenameKey="k"
      />,
    );
    await waitFor(() => expect(fetchCase).toHaveBeenCalledTimes(1));

    await user.click(screen.getByText("open second test"));
    await waitFor(() => expect(fetchCase).toHaveBeenCalledTimes(2));
    await user.click(screen.getByText("open first test"));

    await waitFor(() =>
      expect(screen.getByTestId("panel-rows")).toHaveTextContent("First test"),
    );
    expect(fetchCase).toHaveBeenCalledTimes(2);
  });

  it("draws the Previous and Next pager in the tab row of the shared link", async () => {
    const user = setupUser();
    render(<Harness surface="public" initialTab="tests" />);

    expect(screen.queryByLabelText(/previous/i)).not.toBeInTheDocument();
    await user.click(screen.getByText("report nav"));
    expect(await screen.findByText("1 of 2")).toBeInTheDocument();
  });

  it("leaves the pager to the run window, which draws it in its own header", async () => {
    const onNavChange = jest.fn();
    const user = setupUser();
    render(
      <Harness surface="window" initialTab="tests" onNavChange={onNavChange} />,
    );

    await user.click(screen.getByText("report nav"));
    expect(onNavChange).toHaveBeenCalledWith(
      expect.objectContaining({ currentIndex: 0, total: 2 }),
    );
    expect(screen.queryByText("1 of 2")).not.toBeInTheDocument();
  });

  it("shows the tests with no tabs above them while the run is still going", () => {
    render(
      <BenchmarkResultView
        surface="window"
        isDone={false}
        modelResults={MODELS}
        activeTab="summary"
        onTabChange={jest.fn()}
        fetchCase={() => new Promise(() => {})}
        filenameKey="k"
      />,
    );
    expect(screen.getByTestId("outputs-panel")).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Results" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("panel-flags")).toHaveTextContent(
      '"showControls":false',
    );
  });

  it("lets a signed-out reader open no evaluator pages and label nothing", () => {
    render(<Harness surface="public" initialTab="tests" />);
    expect(screen.getByTestId("panel-flags")).toHaveTextContent(
      '"evaluatorLinks":false',
    );
    expect(screen.getByTestId("panel-flags")).toHaveTextContent(
      '"labelling":null',
    );
  });

  it("passes the tests picked for labelling through from the run window", () => {
    render(
      <Harness
        surface="window"
        initialTab="tests"
        labellingSelection={new Set(["google__gemini-2.5-flash:0"])}
      />,
    );
    expect(screen.getByTestId("panel-flags")).toHaveTextContent(
      "google__gemini-2.5-flash:0",
    );
    expect(screen.getByTestId("panel-flags")).toHaveTextContent(
      '"evaluatorLinks":true',
    );
  });

  it("opens the first model that has answers, and opens or closes any other", async () => {
    const user = setupUser();
    render(<Harness surface="public" initialTab="tests" />);

    await waitFor(() =>
      expect(screen.getByTestId("panel-expanded")).toHaveTextContent(
        "google__gemini-2.5-flash",
      ),
    );
    expect(screen.getByTestId("panel-expanded")).not.toHaveTextContent(
      "openai__gpt-4.1",
    );

    await user.click(screen.getByText("toggle second model"));
    expect(screen.getByTestId("panel-expanded")).toHaveTextContent(
      "openai__gpt-4.1",
    );

    await user.click(screen.getByText("toggle second model"));
    expect(screen.getByTestId("panel-expanded")).not.toHaveTextContent(
      "openai__gpt-4.1",
    );
  });

  it("puts the download button the shared link gives it in the tab row", () => {
    render(
      <Harness
        surface="public"
        tabsRight={<button>Download the results</button>}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Download the results" }),
    ).toBeInTheDocument();
  });

  it("moves the reader to the tests when the results ask it to", async () => {
    const user = setupUser();
    render(<Harness surface="public" />);
    // The leaderboard offers this when a run has tests that produced no answer.
    expect(screen.getByRole("button", { name: "Results" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Tests" }));
    expect(screen.getByTestId("outputs-panel")).toBeInTheDocument();
  });
});

describe("the pieces both surfaces share", () => {
  it("writes a model name with a slash where a folder name put two underscores", () => {
    expect(formatBenchmarkModelName("google__gemini-2.5-flash")).toBe(
      "google/gemini-2.5-flash",
    );
    expect(formatBenchmarkModelName("gpt-4.1")).toBe("gpt-4.1");
  });

  it("puts the kind of test back on rows the light reply left it off", () => {
    const [first] = withTestType([
      {
        ...MODELS[0],
        test_results: [
          { name: "a", passed: true, test_type: "tool_call" },
          {
            name: "b",
            passed: true,
            test_type: "response",
            test_case: { evaluation: { type: "general" } },
          },
          { name: "c", passed: true },
        ],
      },
    ]);
    expect(first.test_results?.map((r) => r.test_case?.evaluation?.type)).toEqual(
      ["tool_call", "general", undefined],
    );
  });

  it("flattens every model's tests into the rows the results file is built from", () => {
    expect(benchmarkCsvRows(MODELS)).toEqual([
      expect.objectContaining({ model: "google__gemini-2.5-flash", name: "First test", passed: true }),
      expect.objectContaining({ model: "google__gemini-2.5-flash", name: "Second test", passed: false }),
      expect.objectContaining({ model: "openai__gpt-4.1", name: "First test", passed: true }),
    ]);
  });

  it("keys a run's evaluators by their uuid, and copes with a run that has none", () => {
    const one = { uuid: "e1", name: "Correctness" } as never;
    expect(evaluatorsByUuid([one])).toEqual({ e1: one });
    expect(evaluatorsByUuid(undefined)).toEqual({});
  });
});
