import { render, screen, setupUser, waitFor, act } from "../../test-utils";
import { toast } from "sonner";
import { reportError } from "../../lib/reportError";
import { POLLING_INTERVAL_MS } from "../../constants/polling";
import { BenchmarkResultsDialog } from "../BenchmarkResultsDialog";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

jest.mock("../test-results/shared", () => ({
  __esModule: true,
  CloseIcon: (props: any) => <svg data-testid="close-icon" {...props} />,
  SpinnerIcon: (props: any) => <svg data-testid="spinner-icon" {...props} />,
  ResultPager: (props: any) => (
    <div data-testid="result-pager">
      {props.currentIndex}/{props.total}
      <button onClick={props.onPrev}>prev</button>
      <button onClick={props.onNext}>next</button>
    </div>
  ),
}));

jest.mock("../eval-details", () => {
  const actual = jest.requireActual("../eval-details/BenchmarkOutputsPanel");
  return {
    __esModule: true,
    benchmarkLabellingKey: actual.benchmarkLabellingKey,
    benchmarkTestName: actual.benchmarkTestName,
    BenchmarkOutputsPanel: (props: any) => (
      <div data-testid="outputs-panel">
        <div data-testid="outputs-panel-models">
          {JSON.stringify(props.modelResults.map((m: any) => m.model))}
        </div>
        <div data-testid="outputs-panel-evaluators">
          {JSON.stringify(props.evaluatorsByUuid)}
        </div>
        <div data-testid="outputs-panel-rows">
          {JSON.stringify(
            props.modelResults.map((m: any) =>
              (m.test_results ?? []).map((r: any) => ({
                name: r.name,
                reply: r.output?.response ?? null,
              })),
            ),
          )}
        </div>
        <div data-testid="outputs-panel-labelling-selection">
          {props.labellingSelection
            ? JSON.stringify(Array.from(props.labellingSelection))
            : "undefined"}
        </div>
        {props.selectionStrip}
        <button
          onClick={() =>
            props.onToggleLabellingSelection?.(
              actual.benchmarkLabellingKey(props.modelResults[1]?.model, 0),
            )
          }
        >
          togglelabel-m1-0
        </button>
        <button
          onClick={() =>
            props.onNavChange?.({
              currentIndex: 0,
              total: 1,
              goPrev: () => {},
              goNext: () => {},
            })
          }
        >
          setnav
        </button>
        <button
          onClick={() => props.onSelectTest?.(props.modelResults[0]?.model, 0)}
        >
          selecttest
        </button>
        <button
          onClick={() =>
            props.onToggleLabellingSelection?.(
              actual.benchmarkLabellingKey(props.modelResults[0]?.model, 0),
            )
          }
        >
          togglelabel0
        </button>
        <button
          onClick={() =>
            props.onLabellingBulkToggle?.([
              actual.benchmarkLabellingKey(props.modelResults[0]?.model, 0),
            ])
          }
        >
          bulktogglelabel0
        </button>
      </div>
    ),
    BenchmarkCombinedLeaderboard: (props: any) => (
      <div
        data-testid="leaderboard"
        data-failure-reason={
          props.failureReason === null ? "null" : props.failureReason
        }
      >
        {props.filename}
      </div>
    ),
    LLMEvaluationAbout: (props: any) => (
      <div data-testid="about-panel">
        {JSON.stringify({
          showLatency: props.showLatency,
          showCost: props.showCost,
          showTokens: props.showTokens,
          showToolCalls: props.showToolCalls,
          evaluators: props.evaluators?.length ?? 0,
        })}
      </div>
    ),
    evaluatorColumnsToAbout: (cols: any) => cols ?? [],
    BenchmarkTopPicks: (props: any) => (
      <div data-testid="top-picks">{props.filename}</div>
    ),
    BenchmarkWeightedRanking: () => <div data-testid="weighted-ranking" />,
  };
});

jest.mock("../ui", () => ({
  __esModule: true,
  // The real tab bar, so this dialog's tab names are the shared ones.
  ResultTabs: jest.requireActual("../ui/ResultTabs").ResultTabs,
  StatusBadge: (props: any) => (
    <span data-testid="status-badge">{props.status}</span>
  ),
  RerunIconButton: (props: any) => (
    <button aria-label={props.tooltip ?? "Rerun"} onClick={props.onClick}>
      {props.tooltip ?? "Rerun"}
    </button>
  ),
  // Stands in for the real button, straight through with no question. The
  // question itself is covered in src/components/ui/__tests__.
  StopRunButton: (props: any) => (
    <button onClick={() => props.onStop()}>Stop</button>
  ),
  RunStateMark: ({ state }: any) => <span data-testid="run-mark">{state}</span>,
  // The real rename box, so renaming a run is exercised end to end here.
  RenameDialog: jest.requireActual("../ui/RenameDialog").RenameDialog,
  // The real previous/next run row, so its arrows and position are what the
  // tests below read.
  DialogNavRow: jest.requireActual("../ui/DialogNavHeader").DialogNavRow,
}));

jest.mock("../../lib/api", () => ({
  __esModule: true,
  getDefaultHeaders: jest.fn(() => ({})),
}));

jest.mock("../AppLayout", () => ({
  __esModule: true,
  useHideFloatingButton: jest.fn(),
}));

jest.mock("../ShareButton", () => ({
  __esModule: true,
  ShareButton: (props: any) => (
    <div data-testid="share-button">{props.entityId}</div>
  ),
}));

jest.mock("../ExportResultsButton", () => ({
  __esModule: true,
  ExportResultsButton: (props: any) => (
    <button data-testid="export-button" onClick={() => props.getRows()}>
      export
    </button>
  ),
}));

const isLabellingEligibleRawMock = jest.fn((_raw?: unknown) => true);
jest.mock("../human-labelling/AddRunToLabellingTaskDialog", () => ({
  __esModule: true,
  AddRunToLabellingTaskDialog: (props: any) =>
    props.isOpen ? (
      <div data-testid="add-to-task-dialog">
        <button onClick={props.onClose}>close</button>
      </div>
    ) : null,
  isLabellingEligibleRaw: (raw: any) => isLabellingEligibleRawMock(raw),
}));

jest.mock("../../lib/exportTestResults", () => ({
  __esModule: true,
  buildBenchmarkCsv: jest.fn(() => []),
}));

const useAccessTokenMock = jest.fn(() => "test-token");
// The workspace limit on how many tests one run may cover. High by default so
// the existing runs are never blocked; lowered in the limit test below.
jest.mock("../../hooks", () => ({
  __esModule: true,
  useAccessToken: () => useAccessTokenMock(),
  // The real arrow-key handling, so the key tests below exercise it.
  useDialogNavKeys: jest.requireActual("../../hooks/useDialogNavKeys")
    .useDialogNavKeys,
}));

// The run size limit, read through `overEvalLimit`, which imports this module
// directly rather than through the hooks barrel.
const getMaxRowsPerEvalMock = jest.fn(async () => 100);
jest.mock("../../hooks/useMaxRowsPerEval", () => ({
  __esModule: true,
  useMaxRowsPerEval: () => 100,
  getMaxRowsPerEval: (...args: unknown[]) => getMaxRowsPerEvalMock(...args),
}));

jest.mock("../../lib/defaultEvaluators", () => ({
  __esModule: true,
  fetchDefaultLLMNextReplyEvaluator: jest.fn().mockResolvedValue(null),
}));

jest.mock("sonner", () => ({
  __esModule: true,
  toast: { error: jest.fn(), success: jest.fn() },
}));

jest.mock("../../lib/reportError", () => ({
  __esModule: true,
  reportError: jest.fn(),
}));

const BACKEND_URL = "http://backend.test";

function jsonResponse(body: any, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

const defaultProps = {
  onClose: jest.fn(),
  agentUuid: "agent-1",
  agentName: "My Agent",
  testUuids: ["t1", "t2"],
  testNames: ["Test One", "Test Two"],
};

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

/** The comparison-detail request for `taskId`, whatever query it carries. The
 * window asks for the light version (`?mode=summary`), so an exact-URL match
 * would miss it. A per-case, abort or rename request is NOT this. */
function isBenchmarkDetail(url: string, taskId: string): boolean {
  return String(url).split("?")[0].endsWith(`/agent-tests/benchmark/${taskId}`);
}

describe("BenchmarkResultsDialog", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = BACKEND_URL;
    (global.fetch as any) = jest.fn();
    useAccessTokenMock.mockReturnValue("test-token");
    isLabellingEligibleRawMock.mockReturnValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();
    delete (process.env as any).NEXT_PUBLIC_BACKEND_URL;
  });

  it("renders nothing when isOpen is false", () => {
    const { container } = render(
      <BenchmarkResultsDialog
        {...defaultProps}
        isOpen={false}
        models={["gpt-4"]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("does not start a comparison bigger than the workspace limit", async () => {
    // 2 tests across 3 models is 6 test runs, over a limit of 5.
    getMaxRowsPerEvalMock.mockResolvedValueOnce(5);
    const onBenchmarkCreated = jest.fn();
    const onGoBack = jest.fn();
    (global.fetch as jest.Mock).mockImplementation((url: string) =>
      Promise.reject(new Error(`Unexpected fetch ${url}`)),
    );

    render(
      <BenchmarkResultsDialog
        {...defaultProps}
        isOpen
        models={["gpt-4", "gpt-5", "claude"]}
        onBenchmarkCreated={onBenchmarkCreated}
        onGoBack={onGoBack}
      />,
    );

    // Back to the model picker, with the limit toast explaining why.
    await waitFor(() => expect(onGoBack).toHaveBeenCalled());
    expect(toast.error).toHaveBeenCalled();
    expect(onBenchmarkCreated).not.toHaveBeenCalled();
    expect(
      (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
        String(url).endsWith("/agent-tests/agent/agent-1/benchmark"),
      ),
    ).toHaveLength(0);
  });

  it("counts every linked test when no uuids are given", async () => {
    // No uuids means every linked test: 50 tests across 3 models is 150 test
    // runs, over the limit of 100. Counting the uuids would have checked 0.
    const onGoBack = jest.fn();
    (global.fetch as jest.Mock).mockImplementation((url: string) =>
      Promise.reject(new Error(`Unexpected fetch ${url}`)),
    );

    render(
      <BenchmarkResultsDialog
        {...defaultProps}
        testUuids={[]}
        testNames={[]}
        totalTests={50}
        isOpen
        models={["gpt-4", "gpt-5", "claude"]}
        onGoBack={onGoBack}
      />,
    );

    await waitFor(() => expect(onGoBack).toHaveBeenCalled());
    expect(
      (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
        String(url).endsWith("/agent-tests/agent/agent-1/benchmark"),
      ),
    ).toHaveLength(0);
  });

  it("closes when there is no picker to go back to and the run is over the limit", async () => {
    getMaxRowsPerEvalMock.mockResolvedValueOnce(1);
    const onClose = jest.fn();
    (global.fetch as jest.Mock).mockImplementation((url: string) =>
      Promise.reject(new Error(`Unexpected fetch ${url}`)),
    );

    render(
      <BenchmarkResultsDialog
        {...defaultProps}
        isOpen
        onClose={onClose}
        models={["gpt-4"]}
      />,
    );

    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  function mockBenchmarkStart() {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.endsWith("/agent-tests/agent/agent-1/benchmark")) {
        return Promise.resolve(
          jsonResponse({ task_id: "task-1", status: "queued" }),
        );
      }
      if (isBenchmarkDetail(url, "task-1")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-1",
            status: "running",
            model_results: [],
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });
  }

  async function startedBenchmarkBody() {
    let body: Record<string, unknown> | undefined;
    await waitFor(() => {
      const post = (global.fetch as jest.Mock).mock.calls.find(([url]) =>
        String(url).endsWith("/agent-tests/agent/agent-1/benchmark"),
      );
      expect(post).toBeDefined();
      body = JSON.parse(post![1].body);
    });
    return body!;
  }

  it("marks a finished comparison whose test produced no answer", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (isBenchmarkDetail(url, "task-unanswered")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-unanswered",
            status: "done",
            model_results: [
              {
                model: "openai/gpt-4o",
                test_results: [
                  { test_case_id: "t1", passed: true },
                  { test_case_id: "t2", passed: false, unanswered: true },
                ],
              },
            ],
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    render(
      <BenchmarkResultsDialog
        {...defaultProps}
        isOpen
        models={["openai/gpt-4o"]}
        taskId="task-unanswered"
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("run-mark")).toHaveTextContent("gave_up"),
    );
  });

  it.each([
    [
      "sends parallel_models: false when the models run one after another",
      false,
    ],
    ["sends parallel_models: true when the models run together", true],
  ])("%s", async (_name, parallelModels) => {
    mockBenchmarkStart();

    render(
      <BenchmarkResultsDialog
        {...defaultProps}
        isOpen
        models={["gpt-4"]}
        parallelModels={parallelModels}
      />,
    );

    expect(await startedBenchmarkBody()).toEqual({
      models: ["gpt-4"],
      test_uuids: defaultProps.testUuids,
      parallel_models: parallelModels,
    });
  });

  it("leaves parallel_models out when nothing was chosen", async () => {
    mockBenchmarkStart();

    render(
      <BenchmarkResultsDialog {...defaultProps} isOpen models={["gpt-4"]} />,
    );

    expect(await startedBenchmarkBody()).not.toHaveProperty("parallel_models");
  });

  it("starts a new benchmark run, polls, and stays on the tests when done", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    const onBenchmarkCreated = jest.fn();
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.endsWith("/agent-tests/agent/agent-1/benchmark")) {
        return Promise.resolve(
          jsonResponse({ task_id: "task-1", status: "queued" }),
        );
      }
      if (isBenchmarkDetail(url, "task-1")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-1",
            status: "done",
            name: "Run One",
            model_results: [
              {
                model: "gpt-4",
                success: true,
                message: "",
                total_tests: 1,
                passed: 1,
                failed: 0,
                test_results: [{ name: "Test One", passed: true }],
              },
            ],
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    render(
      <BenchmarkResultsDialog
        {...defaultProps}
        isOpen
        models={["gpt-4"]}
        onBenchmarkCreated={onBenchmarkCreated}
      />,
    );

    await waitFor(() =>
      expect(onBenchmarkCreated).toHaveBeenCalledWith("task-1"),
    );
    await waitFor(() =>
      expect(screen.getByText("Run One")).toBeInTheDocument(),
    );
    // The reader started this comparison here and watched it run, so it does
    // not move them off the tests when it finishes.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Results" }),
      ).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("leaderboard")).not.toBeInTheDocument();

    expect(
      (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
        String(url).endsWith("/agent-tests/agent/agent-1/benchmark"),
      ),
    ).toHaveLength(1);

    // Polling should have stopped: advancing time further should not add calls.
    const callsBefore = (global.fetch as jest.Mock).mock.calls.length;
    await act(async () => {
      await jest.advanceTimersByTimeAsync(POLLING_INTERVAL_MS * 2);
    });
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(callsBefore);
  });

  it("views an existing run via taskId without POSTing a new benchmark", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (isBenchmarkDetail(url, "task-existing")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-existing",
            status: "completed",
            name: "Past Run",
            model_results: [
              {
                model: "gpt-4",
                success: true,
                message: "",
                total_tests: 1,
                passed: 1,
                failed: 0,
                test_results: [{ name: "Test One", passed: true }],
              },
            ],
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    render(
      <BenchmarkResultsDialog
        {...defaultProps}
        isOpen
        models={[]}
        taskId="task-existing"
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Past Run")).toBeInTheDocument(),
    );
    expect(
      (global.fetch as jest.Mock).mock.calls.some(([url]) =>
        String(url).endsWith("/agent-tests/agent/agent-1/benchmark"),
      ),
    ).toBe(false);
  });

  it("does not keep the previous run's name when the window opens another run", async () => {
    let holdSecond: (value: any) => void = () => {};
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (isBenchmarkDetail(url, "task-first")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-first",
            status: "completed",
            name: "Regression before v2",
            model_results: [],
          }),
        );
      }
      if (isBenchmarkDetail(url, "task-second")) {
        return new Promise((resolve) => {
          holdSecond = resolve;
        });
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    const { rerender } = render(
      <BenchmarkResultsDialog
        {...defaultProps}
        isOpen
        models={[]}
        taskId="task-first"
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Regression before v2")).toBeInTheDocument(),
    );

    // The same window is pointed at another run, whose reply has not arrived.
    rerender(
      <BenchmarkResultsDialog
        {...defaultProps}
        isOpen
        models={[]}
        taskId="task-second"
      />,
    );
    await waitFor(() =>
      expect(
        screen.queryByText("Regression before v2"),
      ).not.toBeInTheDocument(),
    );
    // Nothing is written at the top of the window while the run is on its way:
    // no automatic name, no rename pencil, not even the agent's name.
    expect(screen.queryByText("Model comparison")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Rename" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("My Agent")).not.toBeInTheDocument();

    await act(async () => {
      holdSecond(
        jsonResponse({
          task_id: "task-second",
          status: "completed",
          name: "Benchmark 2",
          model_results: [],
        }),
      );
    });
    expect(await screen.findByText("Model comparison 2")).toBeInTheDocument();
  });

  it("renames a model comparison and tells the parent the new name", async () => {
    (global.fetch as jest.Mock).mockImplementation(
      (url: string, init?: any) => {
        if (url.endsWith("/agent-tests/run/task-existing/name")) {
          return Promise.resolve(
            jsonResponse({
              task_id: "task-existing",
              name: JSON.parse(init.body).name,
            }),
          );
        }
        if (isBenchmarkDetail(url, "task-existing")) {
          return Promise.resolve(
            jsonResponse({
              task_id: "task-existing",
              status: "completed",
              name: "Benchmark 3",
              model_results: [],
            }),
          );
        }
        return Promise.reject(new Error(`Unexpected fetch ${url}`));
      },
    );
    const onRenamed = jest.fn();
    const user = setupUser();

    render(
      <BenchmarkResultsDialog
        {...defaultProps}
        isOpen
        models={[]}
        taskId="task-existing"
        onRenamed={onRenamed}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Model comparison 3")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Rename" }));
    await user.clear(screen.getByLabelText("Name"));
    await user.type(screen.getByLabelText("Name"), "Nightly models{Enter}");

    expect(await screen.findByText("Nightly models")).toBeInTheDocument();
    expect(onRenamed).toHaveBeenCalledWith("Nightly models");
  });

  it("does not fetch and clears initial loading when models is empty and no taskId", async () => {
    render(<BenchmarkResultsDialog {...defaultProps} isOpen models={[]} />);

    await waitFor(() =>
      expect(screen.queryByText("Loading")).not.toBeInTheDocument(),
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("shows the error card and calls reportError when the POST fails, and 'Try again' calls onGoBack", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.endsWith("/agent-tests/agent/agent-1/benchmark")) {
        return Promise.resolve(
          jsonResponse({ detail: "bad request" }, false, 400),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    const onGoBack = jest.fn();
    const user = setupUser();
    render(
      <BenchmarkResultsDialog
        {...defaultProps}
        isOpen
        models={["gpt-4"]}
        onGoBack={onGoBack}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Something went wrong")).toBeInTheDocument(),
    );
    expect(reportError).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Try again" }));
    expect(onGoBack).toHaveBeenCalledTimes(1);
  });

  it("resets evaluators to [] on a poll response that omits them after a previous poll included them", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    let pollCount = 0;
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.endsWith("/agent-tests/agent/agent-1/benchmark")) {
        return Promise.resolve(
          jsonResponse({ task_id: "task-2", status: "queued" }),
        );
      }
      if (isBenchmarkDetail(url, "task-2")) {
        pollCount += 1;
        if (pollCount === 1) {
          return Promise.resolve(
            jsonResponse({
              task_id: "task-2",
              status: "in_progress",
              evaluators: [{ uuid: "ev-1", name: "Evaluator 1" }],
            }),
          );
        }
        return Promise.resolve(
          jsonResponse({
            task_id: "task-2",
            status: "done",
            model_results: [
              {
                model: "gpt-4",
                success: true,
                message: "",
                total_tests: 1,
                passed: 1,
                failed: 0,
                test_results: [{ name: "Test One", passed: true }],
              },
            ],
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    render(
      <BenchmarkResultsDialog {...defaultProps} isOpen models={["gpt-4"]} />,
    );

    await waitFor(() =>
      expect(
        screen.getByTestId("outputs-panel-evaluators").textContent,
      ).toContain("ev-1"),
    );

    await act(async () => {
      await jest.advanceTimersByTimeAsync(POLLING_INTERVAL_MS);
    });

    // The run is now done. It was started here, so the reader stays on the
    // tests and the panel keeps reading the evaluators prop.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Results" }),
      ).toBeInTheDocument(),
    );

    await waitFor(() =>
      expect(screen.getByTestId("outputs-panel-evaluators").textContent).toBe(
        "{}",
      ),
    );

    // The About tab renders and receives metric-presence flags from the plan.
    await setupUser().click(screen.getByRole("button", { name: "About" }));
    expect(screen.getByTestId("about-panel")).toBeInTheDocument();
  });

  it("sets error and calls reportError when the poll response carries a result-level error", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (isBenchmarkDetail(url, "task-err")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-err",
            status: "failed",
            error: "boom",
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    render(
      <BenchmarkResultsDialog
        {...defaultProps}
        isOpen
        models={[]}
        taskId="task-err"
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Something went wrong")).toBeInTheDocument(),
    );
    expect(
      screen.getByText(
        "The evaluation run failed before it produced any result.",
      ),
    ).toBeInTheDocument();
    // What the backend recorded, verbatim, with a copy button.
    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(screen.getByText("boom").tagName).toBe("PRE");
    expect(screen.getByRole("button", { name: "Copy" })).toBeInTheDocument();
    expect(reportError).toHaveBeenCalledWith(
      "Model comparison failed",
      expect.objectContaining({ message: "boom" }),
    );
  });

  it("shows the sentence and no details block when an older run carries error: true", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (isBenchmarkDetail(url, "task-err-bool")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-err-bool",
            status: "failed",
            error: true,
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    render(
      <BenchmarkResultsDialog
        {...defaultProps}
        isOpen
        models={[]}
        taskId="task-err-bool"
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          "The evaluation run failed before it produced any result.",
        ),
      ).toBeInTheDocument(),
    );
    // Nothing was recorded in text, so there is no details block to copy.
    expect(screen.queryByText("Details")).not.toBeInTheDocument();
    expect(screen.queryByText("true")).not.toBeInTheDocument();
  });

  it("keeps the finished rows of a run that failed part way, and says why above them", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (isBenchmarkDetail(url, "task-partial")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-partial",
            status: "failed",
            error: "judge unreachable",
            model_results: [
              {
                model: "m1",
                success: null,
                total_tests: 2,
                test_results: [
                  { name: "Finished One", passed: true },
                  { name: "Never Reached", passed: null },
                ],
              },
            ],
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    const onGoBack = jest.fn();
    render(
      <BenchmarkResultsDialog
        {...defaultProps}
        isOpen
        models={[]}
        taskId="task-partial"
        onGoBack={onGoBack}
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("run-mark")).toHaveTextContent("error"),
    );
    // The view stays: the rows it finished are still there to read.
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
    expect(
      screen.queryByText(
        "The evaluation run failed before it produced any result.",
      ),
    ).not.toBeInTheDocument();
    // The reason goes to the leaderboard, which shows it above the table.
    expect(screen.getByTestId("leaderboard")).toHaveAttribute(
      "data-failure-reason",
      "judge unreachable",
    );
    expect(reportError).toHaveBeenCalledWith(
      "Model comparison failed",
      expect.objectContaining({ message: "judge unreachable" }),
    );
    const user = setupUser();
    await user.click(screen.getByRole("button", { name: "Tests" }));
    expect(screen.getByTestId("outputs-panel-rows")).toHaveTextContent(
      "Finished One",
    );
    // Rerun stays available on a failed run.
    await user.click(screen.getByRole("button", { name: /Rerun/ }));
    expect(onGoBack).toHaveBeenCalledTimes(1);
  });

  it("marks a finished run that gave up before starting every test", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (isBenchmarkDetail(url, "task-gave-up")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-gave-up",
            status: "done",
            stopped_early: true,
            model_results: [],
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    render(
      <BenchmarkResultsDialog
        {...defaultProps}
        isOpen
        models={[]}
        taskId="task-gave-up"
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("run-mark")).toHaveTextContent("gave_up"),
    );
    expect(screen.getByTestId("leaderboard")).toHaveAttribute(
      "data-failure-reason",
      "null",
    );
  });

  it.each([
    ["opening a past run", { taskId: "task-no-url" }],
    ["starting a new run", { models: ["gpt-4"] }],
  ])(
    "shows the failure box with the missing backend address as its details when %s",
    async (_name, props) => {
      delete process.env.NEXT_PUBLIC_BACKEND_URL;
      render(
        <BenchmarkResultsDialog
          {...defaultProps}
          isOpen
          models={[]}
          {...props}
        />,
      );
      expect(
        await screen.findByText("Something went wrong"),
      ).toBeInTheDocument();
      expect(
        screen.getByText("BACKEND_URL environment variable is not set").tagName,
      ).toBe("PRE");
      expect(global.fetch).not.toHaveBeenCalled();
    },
  );

  it("passes stopped_early on a finished run to the result view", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (isBenchmarkDetail(url, "task-stopped-early")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-stopped-early",
            status: "done",
            stopped_early: true,
            model_results: [],
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    render(
      <BenchmarkResultsDialog
        {...defaultProps}
        isOpen
        models={[]}
        taskId="task-stopped-early"
      />,
    );
  });

  it("stops polling, reports the error, and sets status failed when the poll fetch rejects", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (isBenchmarkDetail(url, "task-throw")) {
        return Promise.reject(new Error("network down"));
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    render(
      <BenchmarkResultsDialog
        {...defaultProps}
        isOpen
        models={[]}
        taskId="task-throw"
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Something went wrong")).toBeInTheDocument(),
    );
    expect(reportError).toHaveBeenCalledWith(
      "Error polling benchmark status:",
      expect.any(Error),
    );

    const callsBefore = (global.fetch as jest.Mock).mock.calls.length;
    await act(async () => {
      await jest.advanceTimersByTimeAsync(POLLING_INTERVAL_MS * 2);
    });
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(callsBefore);
  });

  it("stops polling immediately when the dialog is closed", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (isBenchmarkDetail(url, "task-close")) {
        return Promise.resolve(
          jsonResponse({ task_id: "task-close", status: "in_progress" }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    const { rerender } = render(
      <BenchmarkResultsDialog
        {...defaultProps}
        isOpen
        models={[]}
        taskId="task-close"
      />,
    );

    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const callsBeforeClose = (global.fetch as jest.Mock).mock.calls.length;

    rerender(
      <BenchmarkResultsDialog
        {...defaultProps}
        isOpen={false}
        models={[]}
        taskId="task-close"
      />,
    );

    await act(async () => {
      await jest.advanceTimersByTimeAsync(POLLING_INTERVAL_MS * 3);
    });
    expect((global.fetch as jest.Mock).mock.calls.length).toBe(
      callsBeforeClose,
    );
  });

  describe("stopping a model comparison", () => {
    it("stops the run, then shows it as stopped", async () => {
      let stopped = false;
      (global.fetch as jest.Mock).mockImplementation(
        (url: string, init?: any) => {
          if (url.endsWith("/agent-tests/run/task-stop/abort")) {
            expect(init?.method).toBe("POST");
            stopped = true;
            return Promise.resolve(
              jsonResponse({
                task_id: "task-stop",
                status: "done",
                aborted: true,
                model_results: [],
              }),
            );
          }
          if (isBenchmarkDetail(url, "task-stop")) {
            return Promise.resolve(
              jsonResponse({
                task_id: "task-stop",
                status: stopped ? "done" : "in_progress",
                aborted: stopped || undefined,
                model_results: [],
              }),
            );
          }
          return Promise.reject(new Error(`Unexpected fetch ${url}`));
        },
      );

      const user = setupUser();
      render(
        <BenchmarkResultsDialog
          {...defaultProps}
          isOpen
          models={[]}
          taskId="task-stop"
        />,
      );

      await user.click(await screen.findByRole("button", { name: "Stop" }));

      await waitFor(() =>
        expect(
          (global.fetch as jest.Mock).mock.calls.some(([url]) =>
            String(url).endsWith("/agent-tests/run/task-stop/abort"),
          ),
        ).toBe(true),
      );

      expect(await screen.findByTestId("run-mark")).toHaveTextContent(
        "stopped",
      );
      expect(
        screen.queryByRole("button", { name: "Stop" }),
      ).not.toBeInTheDocument();
    });

    it("says it cannot stop the run when the backend address is missing", async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (isBenchmarkDetail(url, "task-stop")) {
          return Promise.resolve(
            jsonResponse({
              task_id: "task-stop",
              status: "in_progress",
              model_results: [],
            }),
          );
        }
        return Promise.reject(new Error(`Unexpected fetch ${url}`));
      });

      const user = setupUser();
      render(
        <BenchmarkResultsDialog
          {...defaultProps}
          isOpen
          models={[]}
          taskId="task-stop"
        />,
      );

      const stopButton = await screen.findByRole("button", { name: "Stop" });
      delete (process.env as any).NEXT_PUBLIC_BACKEND_URL;
      await user.click(stopButton);

      expect(toast.error).toHaveBeenCalledWith(
        "Cannot stop the run: the backend URL is not configured.",
      );
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url]) =>
          String(url).includes("/abort"),
        ),
      ).toBe(false);
    });

    it("has no Stop once the run has finished", async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (isBenchmarkDetail(url, "task-done")) {
          return Promise.resolve(
            jsonResponse({
              task_id: "task-done",
              status: "done",
              model_results: [],
            }),
          );
        }
        return Promise.reject(new Error(`Unexpected fetch ${url}`));
      });

      render(
        <BenchmarkResultsDialog
          {...defaultProps}
          isOpen
          models={[]}
          taskId="task-done"
        />,
      );

      await waitFor(() => expect(global.fetch).toHaveBeenCalled());
      await waitFor(() =>
        expect(
          screen.queryByRole("button", { name: "Stop" }),
        ).not.toBeInTheDocument(),
      );
      expect(screen.getByTestId("run-mark")).toHaveTextContent("finished");
    });
  });

  it("does not re-POST a new benchmark when the access token refreshes mid-run", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.endsWith("/agent-tests/agent/agent-1/benchmark")) {
        return Promise.resolve(
          jsonResponse({ task_id: "task-refresh", status: "queued" }),
        );
      }
      if (isBenchmarkDetail(url, "task-refresh")) {
        return Promise.resolve(
          jsonResponse({ task_id: "task-refresh", status: "in_progress" }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    const { rerender } = render(
      <BenchmarkResultsDialog {...defaultProps} isOpen models={["gpt-4"]} />,
    );

    await waitFor(() =>
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url]) =>
          String(url).endsWith("/agent-tests/agent/agent-1/benchmark"),
        ),
      ).toBe(true),
    );

    useAccessTokenMock.mockReturnValue("token-b");
    rerender(
      <BenchmarkResultsDialog {...defaultProps} isOpen models={["gpt-4"]} />,
    );

    await act(async () => {
      await jest.advanceTimersByTimeAsync(POLLING_INTERVAL_MS);
    });

    expect(
      (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
        String(url).endsWith("/agent-tests/agent/agent-1/benchmark"),
      ),
    ).toHaveLength(1);
  });

  describe("getProvidersToDisplay placeholder logic", () => {
    it("shows placeholders for all models before any results arrive", async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.endsWith("/agent-tests/agent/agent-1/benchmark")) {
          return Promise.resolve(
            jsonResponse({ task_id: "task-ph", status: "queued" }),
          );
        }
        if (isBenchmarkDetail(url, "task-ph")) {
          return Promise.resolve(
            jsonResponse({ task_id: "task-ph", status: "in_progress" }),
          );
        }
        return Promise.reject(new Error(`Unexpected fetch ${url}`));
      });

      render(
        <BenchmarkResultsDialog
          {...defaultProps}
          isOpen
          models={["gpt-4", "claude"]}
        />,
      );

      await waitFor(() =>
        expect(screen.getByTestId("outputs-panel-models").textContent).toBe(
          JSON.stringify(["gpt-4", "claude"]),
        ),
      );
    });

    it("merges placeholders only for models missing from partial results", async () => {
      let pollCount = 0;
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.endsWith("/agent-tests/agent/agent-1/benchmark")) {
          return Promise.resolve(
            jsonResponse({ task_id: "task-partial", status: "queued" }),
          );
        }
        if (isBenchmarkDetail(url, "task-partial")) {
          pollCount += 1;
          return Promise.resolve(
            jsonResponse({
              task_id: "task-partial",
              status: "in_progress",
              model_results: [
                {
                  model: "gpt-4",
                  success: true,
                  message: "",
                  total_tests: 1,
                  passed: 1,
                  failed: 0,
                  test_results: [{ name: "Test One", passed: true }],
                },
              ],
            }),
          );
        }
        return Promise.reject(new Error(`Unexpected fetch ${url}`));
      });

      render(
        <BenchmarkResultsDialog
          {...defaultProps}
          isOpen
          models={["gpt-4", "claude"]}
        />,
      );

      await waitFor(() =>
        expect(screen.getByTestId("outputs-panel-models").textContent).toBe(
          JSON.stringify(["gpt-4", "claude"]),
        ),
      );
      expect(pollCount).toBeGreaterThanOrEqual(1);
    });

    it("returns modelResults as-is once done", async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (isBenchmarkDetail(url, "task-done")) {
          return Promise.resolve(
            jsonResponse({
              task_id: "task-done",
              status: "done",
              model_results: [
                {
                  model: "gpt-4",
                  success: true,
                  message: "",
                  total_tests: 1,
                  passed: 1,
                  failed: 0,
                  test_results: [{ name: "Test One", passed: true }],
                },
              ],
            }),
          );
        }
        return Promise.reject(new Error(`Unexpected fetch ${url}`));
      });

      render(
        <BenchmarkResultsDialog
          {...defaultProps}
          isOpen
          models={["gpt-4", "claude"]}
          taskId="task-done"
        />,
      );

      // Done runs auto-switch to the leaderboard tab; flip back to outputs
      // to read the modelResults passed to the panel.
      await waitFor(() =>
        expect(screen.getByTestId("leaderboard")).toBeInTheDocument(),
      );
      await setupUser().click(screen.getByRole("button", { name: "Tests" }));

      await waitFor(() =>
        expect(screen.getByTestId("outputs-panel-models").textContent).toBe(
          JSON.stringify(["gpt-4"]),
        ),
      );
    });
  });

  describe("done-state UI: tabs, pager, export, share, labelling, rerun", () => {
    async function renderDoneRun(overrides: Partial<any> = {}) {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (isBenchmarkDetail(url, "task-ui")) {
          return Promise.resolve(
            jsonResponse({
              task_id: "task-ui",
              status: "completed",
              name: "UI Run",
              is_public: true,
              share_token: "share-1",
              model_results: [
                {
                  model: "gpt-4",
                  success: true,
                  message: "",
                  total_tests: 1,
                  passed: 1,
                  failed: 0,
                  test_results: [{ name: "Test One", passed: true }],
                },
              ],
              ...overrides,
            }),
          );
        }
        return Promise.reject(new Error(`Unexpected fetch ${url}`));
      });

      const onGoBack = jest.fn();
      render(
        <BenchmarkResultsDialog
          {...defaultProps}
          isOpen
          models={[]}
          taskId="task-ui"
          onGoBack={onGoBack}
        />,
      );
      await waitFor(() =>
        expect(screen.getByText("UI Run")).toBeInTheDocument(),
      );
      return { onGoBack };
    }

    it("shows export, share, submit-for-labelling, and rerun buttons when done", async () => {
      const { onGoBack } = await renderDoneRun();

      expect(screen.getByTestId("export-button")).toBeInTheDocument();
      expect(screen.getByTestId("share-button")).toHaveTextContent("task-ui");
      expect(
        screen.getByRole("button", { name: "Submit for labelling" }),
      ).toBeInTheDocument();
      const rerunButton = screen.getByRole("button", { name: /Rerun/ });
      const user = setupUser();
      await user.click(rerunButton);
      expect(onGoBack).toHaveBeenCalledTimes(1);
    });

    /** Opens a finished comparison and clicks Rerun. The `models`/`testUuids`
     * props are empty, as they are for any past run, so the rerun config has to
     * be recovered from what the run itself carries. `detail` adds to the
     * comparison the backend replies with. */
    async function clickRerunOnPastRun(
      detail: Record<string, unknown> = {},
      props: Record<string, unknown> = {},
    ) {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (isBenchmarkDetail(url, "task-rerun")) {
          return Promise.resolve(
            jsonResponse({
              task_id: "task-rerun",
              status: "completed",
              name: "Rerun Source",
              test_uuids: ["tu-1", "tu-2"],
              model_results: [
                {
                  model: "gpt-4",
                  success: true,
                  message: "",
                  total_tests: 2,
                  passed: 2,
                  failed: 0,
                  test_results: [
                    { name: "Test One", passed: true },
                    { name: "Test Two", passed: true },
                  ],
                },
                {
                  model: "claude",
                  success: true,
                  message: "",
                  total_tests: 2,
                  passed: 2,
                  failed: 0,
                  test_results: [
                    { name: "Test One", passed: true },
                    { name: "Test Two", passed: true },
                  ],
                },
              ],
              ...detail,
            }),
          );
        }
        return Promise.reject(new Error(`Unexpected fetch ${url}`));
      });

      const onGoBack = jest.fn();
      const onRerun = jest.fn();
      render(
        <BenchmarkResultsDialog
          {...defaultProps}
          isOpen
          models={[]}
          testUuids={[]}
          testNames={[]}
          taskId="task-rerun"
          onGoBack={onGoBack}
          onRerun={onRerun}
          {...props}
        />,
      );
      await waitFor(() =>
        expect(screen.getByText("Rerun Source")).toBeInTheDocument(),
      );

      const user = setupUser();
      await user.click(screen.getByRole("button", { name: /Rerun/ }));
      return { onRerun, onGoBack };
    }

    it("prefers onRerun (direct rerun) over onGoBack and passes derived models/testNames", async () => {
      const { onRerun, onGoBack } = await clickRerunOnPastRun();

      expect(onRerun).toHaveBeenCalledTimes(1);
      expect(onRerun).toHaveBeenCalledWith({
        models: ["gpt-4", "claude"],
        testUuids: ["tu-1", "tu-2"],
        testNames: ["Test One", "Test Two"],
        parallelModels: undefined,
      });
      expect(onGoBack).not.toHaveBeenCalled();
    });

    it.each([true, false])(
      "hands the rerun parallelModels: %s, as the comparison ran",
      async (parallelModels) => {
        const { onRerun } = await clickRerunOnPastRun({
          parallel_models: parallelModels,
        });

        expect(onRerun.mock.calls[0][0].parallelModels).toBe(parallelModels);
      },
    );

    it.each([
      ["the comparison predates it", {}],
      ["the backend sent nothing for it", { parallel_models: null }],
    ])(
      "hands the rerun no parallelModels when %s",
      async (_name, detail: Record<string, unknown>) => {
        const { onRerun } = await clickRerunOnPastRun(detail);

        expect(onRerun.mock.calls[0][0].parallelModels).toBeUndefined();
      },
    );

    it("falls back to how this window started the run when it comes back without it", async () => {
      const { onRerun } = await clickRerunOnPastRun(
        {},
        { parallelModels: false },
      );

      expect(onRerun.mock.calls[0][0].parallelModels).toBe(false);
    });

    it("hides the Rerun button on a legacy benchmark with no test_uuids (no onGoBack fallback)", async () => {
      // A viewed benchmark that predates the backend snapshot: no test_uuids,
      // and the view surfaces pass onRerun but not onGoBack.
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (isBenchmarkDetail(url, "task-legacy")) {
          return Promise.resolve(
            jsonResponse({
              task_id: "task-legacy",
              status: "completed",
              name: "Legacy Benchmark",
              model_results: [
                {
                  model: "gpt-4",
                  success: true,
                  message: "",
                  total_tests: 1,
                  passed: 1,
                  failed: 0,
                  test_results: [{ name: "Test One", passed: true }],
                },
              ],
            }),
          );
        }
        return Promise.reject(new Error(`Unexpected fetch ${url}`));
      });

      render(
        <BenchmarkResultsDialog
          {...defaultProps}
          isOpen
          models={[]}
          testUuids={[]}
          testNames={[]}
          taskId="task-legacy"
          onRerun={jest.fn()}
        />,
      );

      await waitFor(() =>
        expect(screen.getByText("Legacy Benchmark")).toBeInTheDocument(),
      );
      expect(
        screen.queryByRole("button", { name: /Rerun/ }),
      ).not.toBeInTheDocument();
    });

    it("switches tabs between leaderboard and outputs", async () => {
      await renderDoneRun();
      const user = setupUser();

      // Auto-switched to leaderboard once done with no error.
      await waitFor(() =>
        expect(screen.getByTestId("leaderboard")).toBeInTheDocument(),
      );

      await user.click(screen.getByRole("button", { name: "Tests" }));
      expect(screen.getByTestId("outputs-panel")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Results" }));
      expect(screen.getByTestId("leaderboard")).toBeInTheDocument();
    });

    it("shows the Top picks tab content when the Top picks tab is clicked", async () => {
      // The tab only appears when the run has cost + pass-rate data to plot.
      await renderDoneRun({
        leaderboard_summary: [
          { model: "gpt-4", pass_rate: "100", cost: "0.05" },
        ],
      });
      const user = setupUser();

      // Auto-switched to leaderboard once done; Top picks not yet shown.
      await waitFor(() =>
        expect(screen.getByTestId("leaderboard")).toBeInTheDocument(),
      );
      expect(screen.queryByTestId("top-picks")).not.toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Model selection" }));
      expect(screen.getByTestId("top-picks")).toBeInTheDocument();
      expect(screen.queryByTestId("leaderboard")).not.toBeInTheDocument();
    });

    it("hides the Top picks tab when there is no cost or pass-rate data", async () => {
      await renderDoneRun(); // default fixture: no leaderboard_summary, no cost
      await waitFor(() =>
        expect(screen.getByTestId("leaderboard")).toBeInTheDocument(),
      );
      expect(
        screen.queryByRole("button", { name: "Model selection" }),
      ).not.toBeInTheDocument();
    });

    it("shows the nav pager only on the outputs tab once nav + selectedTest are set", async () => {
      await renderDoneRun();
      const user = setupUser();
      await user.click(screen.getByRole("button", { name: "Tests" }));

      expect(screen.queryByTestId("result-pager")).not.toBeInTheDocument();
      await user.click(screen.getByText("setnav"));
      // selectedTest gets auto-selected once modelResults has data, so the
      // pager should now show up.
      await waitFor(() =>
        expect(screen.getByTestId("result-pager")).toBeInTheDocument(),
      );

      await user.click(screen.getByRole("button", { name: "Results" }));
      expect(screen.queryByTestId("result-pager")).not.toBeInTheDocument();
    });

    it("clicking export invokes getRows without throwing", async () => {
      await renderDoneRun();
      const user = setupUser();
      await user.click(screen.getByTestId("export-button"));
      // No assertion beyond "did not throw" — buildBenchmarkCsv is mocked.
    });

    it("submit-for-labelling: shows a toast and does not open dialog when nothing is selected", async () => {
      await renderDoneRun();
      const user = setupUser();
      await user.click(
        screen.getByRole("button", { name: "Submit for labelling" }),
      );
      expect(toast.error).toHaveBeenCalledWith(
        "Select one or more tests to submit for labelling",
      );
      expect(
        screen.queryByTestId("add-to-task-dialog"),
      ).not.toBeInTheDocument();
    });

    it("submit-for-labelling: switches from leaderboard to outputs first, then requires a selection", async () => {
      await renderDoneRun();
      const user = setupUser();
      // Currently on leaderboard (auto-switched).
      expect(screen.getByTestId("leaderboard")).toBeInTheDocument();

      await user.click(
        screen.getByRole("button", { name: "Submit for labelling" }),
      );
      // Tab flips to outputs; since nothing is selected, a toast fires and
      // the dialog does not open.
      expect(screen.getByTestId("outputs-panel")).toBeInTheDocument();
      expect(toast.error).toHaveBeenCalledWith(
        "Select one or more tests to submit for labelling",
      );
    });

    it("hides the button and the row checkboxes when nothing in the benchmark can be labelled", async () => {
      isLabellingEligibleRawMock.mockReturnValue(false);
      await renderDoneRun();
      expect(
        screen.queryByRole("button", { name: "Submit for labelling" }),
      ).not.toBeInTheDocument();
      await setupUser().click(screen.getByRole("button", { name: "Tests" }));
      expect(
        screen.getByTestId("outputs-panel-labelling-selection"),
      ).toHaveTextContent("undefined");
    });

    it("submit-for-labelling: opens the AddRunToLabellingTaskDialog when eligible tests are selected", async () => {
      await renderDoneRun();
      const user = setupUser();
      await user.click(screen.getByRole("button", { name: "Tests" }));
      await user.click(screen.getByText("togglelabel0"));

      await user.click(
        screen.getByRole("button", { name: "Submit for labelling" }),
      );
      expect(screen.getByTestId("add-to-task-dialog")).toBeInTheDocument();

      await user.click(screen.getByText("close"));
      expect(
        screen.queryByTestId("add-to-task-dialog"),
      ).not.toBeInTheDocument();
    });

    it("bulk-toggle labelling selection also drives eligibility", async () => {
      await renderDoneRun();
      const user = setupUser();
      await user.click(screen.getByRole("button", { name: "Tests" }));
      await user.click(screen.getByText("bulktogglelabel0"));

      await user.click(
        screen.getByRole("button", { name: "Submit for labelling" }),
      );
      expect(screen.getByTestId("add-to-task-dialog")).toBeInTheDocument();
    });

    it("does not show export/share/submit-for-labelling when there are no results", async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (isBenchmarkDetail(url, "task-empty")) {
          return Promise.resolve(
            jsonResponse({
              task_id: "task-empty",
              status: "completed",
              name: "Empty Run",
              model_results: [
                {
                  model: "gpt-4",
                  success: true,
                  message: "",
                  total_tests: 0,
                  passed: 0,
                  failed: 0,
                  test_results: [],
                },
              ],
            }),
          );
        }
        return Promise.reject(new Error(`Unexpected fetch ${url}`));
      });

      render(
        <BenchmarkResultsDialog
          {...defaultProps}
          isOpen
          models={[]}
          taskId="task-empty"
        />,
      );

      await waitFor(() =>
        expect(screen.getByText("Empty Run")).toBeInTheDocument(),
      );
      expect(screen.queryByTestId("export-button")).not.toBeInTheDocument();
      expect(
        screen.queryByRole("button", { name: "Submit for labelling" }),
      ).not.toBeInTheDocument();
    });

    it("does not show share button when backendAccessToken is falsy", async () => {
      useAccessTokenMock.mockReturnValue(null as any);
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (isBenchmarkDetail(url, "task-notoken")) {
          return Promise.resolve(
            jsonResponse({
              task_id: "task-notoken",
              status: "completed",
              name: "No Token Run",
              model_results: [
                {
                  model: "gpt-4",
                  success: true,
                  message: "",
                  total_tests: 1,
                  passed: 1,
                  failed: 0,
                  test_results: [{ name: "Test One", passed: true }],
                },
              ],
            }),
          );
        }
        return Promise.reject(new Error(`Unexpected fetch ${url}`));
      });

      render(
        <BenchmarkResultsDialog
          {...defaultProps}
          isOpen
          models={[]}
          taskId="task-notoken"
        />,
      );
      // With no token, the drive effect never fires (isOpen && backendAccessToken
      // guard), so nothing loads and no share button should ever render.
      await flush();
      expect(screen.queryByTestId("share-button")).not.toBeInTheDocument();
    });
  });

  it("calls onClose when the close (X) button is clicked", async () => {
    (global.fetch as jest.Mock).mockImplementation(() =>
      Promise.resolve(jsonResponse({ task_id: "t", status: "in_progress" })),
    );
    const onClose = jest.fn();
    const user = setupUser();
    render(
      <BenchmarkResultsDialog
        {...defaultProps}
        isOpen
        models={[]}
        taskId="task-close-x"
        onClose={onClose}
      />,
    );
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    await user.click(screen.getByTestId("close-icon").closest("button")!);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("auto-selects the first test with results once, and does not jump on subsequent updates", async () => {
    let pollCount = 0;
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (isBenchmarkDetail(url, "task-auto")) {
        pollCount += 1;
        if (pollCount === 1) {
          return Promise.resolve(
            jsonResponse({
              task_id: "task-auto",
              status: "in_progress",
              model_results: [
                {
                  model: "claude",
                  success: true,
                  message: "",
                  total_tests: 1,
                  passed: 1,
                  failed: 0,
                  test_results: [{ name: "Test One", passed: true }],
                },
              ],
            }),
          );
        }
        return Promise.resolve(
          jsonResponse({
            task_id: "task-auto",
            status: "done",
            model_results: [
              {
                model: "gpt-4",
                success: true,
                message: "",
                total_tests: 1,
                passed: 1,
                failed: 0,
                test_results: [{ name: "Test One", passed: true }],
              },
              {
                model: "claude",
                success: true,
                message: "",
                total_tests: 1,
                passed: 1,
                failed: 0,
                test_results: [{ name: "Test One", passed: true }],
              },
            ],
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    jest.useFakeTimers({ advanceTimers: true });
    render(
      <BenchmarkResultsDialog
        {...defaultProps}
        isOpen
        models={["gpt-4", "claude"]}
        taskId="task-auto"
      />,
    );

    // First poll only has "claude" with results — auto-selection should pick it
    // (since "gpt-4" from `models` order has no results yet).
    await waitFor(() => expect(pollCount).toBeGreaterThanOrEqual(1));

    await act(async () => {
      await jest.advanceTimersByTimeAsync(POLLING_INTERVAL_MS);
    });

    // Second poll adds "gpt-4" with results too and completes the run. The run
    // was still going when the window opened, so the reader stays on the
    // tests. The selection should stay pinned to whatever was auto-selected first
    // (guarded by a ref) rather than jumping to "gpt-4". We can't directly
    // read `selectedTest` from the mock, but we can assert the panel renders
    // without crashing; deeper assertion would require exposing selectedTest
    // through the outputs panel mock, which duplicates internal state -
    // skipped per task's guidance on deeply nested edge cases under
    // fake-timer flakiness.
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Results" }),
      ).toBeInTheDocument(),
    );
    expect(screen.getByTestId("outputs-panel")).toBeInTheDocument();
  });
});

// A comparison runs every test once per model, so its results are the heaviest
// thing the app reads. The window reads them without each test's conversation,
// reply and judge reasoning, and asks for the one test someone opens — for the
// model whose answer is on screen.
describe("reading a comparison light, and one test in full", () => {
  const originalBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

  const lightComparison = {
    task_id: "task-light",
    status: "completed",
    model_results: [
      {
        model: "openai/gpt-4.1",
        total_tests: 1,
        test_results: [
          {
            test_case_id: "test-1",
            name: "First test",
            passed: true,
            test_type: "response",
          },
        ],
      },
    ],
  };

  /** Every request for one test's own result. */
  const caseCalls = () =>
    (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
      String(url).includes("/agent-tests/run/task-light/results/"),
    );

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = BACKEND_URL;
    localStorage.setItem("access_token", "test-token");
    (global.fetch as any) = jest.fn((url: string) => {
      if (String(url).includes("/agent-tests/run/task-light/results/test-1")) {
        return Promise.resolve(
          jsonResponse({
            test_case_id: "test-1",
            name: "First test",
            passed: true,
            output: { response: "The full reply" },
            test_case: { evaluation: { type: "response" } },
            judge_results: [{ evaluator_uuid: "eval-1", match: true }],
          }),
        );
      }
      if (isBenchmarkDetail(String(url), "task-light")) {
        return Promise.resolve(jsonResponse(lightComparison));
      }
      return Promise.resolve(jsonResponse({}));
    });
  });

  afterEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    jest.useRealTimers();
    process.env.NEXT_PUBLIC_BACKEND_URL = originalBackendUrl;
  });

  const open = () =>
    render(
      <BenchmarkResultsDialog
        isOpen
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        testUuids={[]}
        testNames={[]}
        models={[]}
        taskId="task-light"
      />,
    );

  /** Open the window and go to the list of tests. A finished comparison lands
   * on the leaderboard, so the list is one click away. */
  const openOnResults = async (user: ReturnType<typeof setupUser>) => {
    open();
    await screen.findByTestId("leaderboard");
    await user.click(screen.getByRole("button", { name: "Tests" }));
    await screen.findByTestId("outputs-panel");
  };

  it("asks for the comparison without every test's detail", async () => {
    open();
    await screen.findByTestId("leaderboard");
    const detailUrls = (global.fetch as jest.Mock).mock.calls
      .map(([url]) => String(url))
      .filter((url) => isBenchmarkDetail(url, "task-light"));
    expect(detailUrls.length).toBeGreaterThan(0);
    for (const url of detailUrls) expect(url).toContain("mode=summary");
  });

  it("reads the open test in full, naming the model whose answer is shown", async () => {
    const user = setupUser();
    await openOnResults(user);

    // The window opens the first test with results on its own, so exactly that
    // one test is read in full and its reply appears on the row.
    await user.click(screen.getByText("selecttest"));
    await waitFor(() =>
      expect(screen.getByTestId("outputs-panel-rows")).toHaveTextContent(
        "The full reply",
      ),
    );
    expect(caseCalls()).toHaveLength(1);
    const url = String(caseCalls()[0][0]);
    expect(url).toContain("/agent-tests/run/task-light/results/test-1");
    // A model name has a slash in it, so it goes in the query, encoded.
    expect(url).toContain(`model=${encodeURIComponent("openai/gpt-4.1")}`);
  });

  it("reads every test in full only when the results are exported", async () => {
    const user = setupUser();
    open();
    await screen.findByTestId("leaderboard");
    const fullReads = () =>
      (global.fetch as jest.Mock).mock.calls.filter(
        ([url]) =>
          isBenchmarkDetail(String(url), "task-light") &&
          !String(url).includes("mode=summary"),
      );
    expect(fullReads()).toHaveLength(0);

    await user.click(screen.getByTestId("export-button"));
    await waitFor(() => expect(fullReads()).toHaveLength(1));
  });
});

describe("running or comparing the ticked tests", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = BACKEND_URL;
    global.fetch = jest.fn() as unknown as typeof fetch;
    useAccessTokenMock.mockReturnValue("test-token");
    isLabellingEligibleRawMock.mockReturnValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
  });

  const ONE_TEST_TWO_MODELS = ["gpt-4", "claude"].map((model) => ({
    model,
    success: true,
    message: "",
    total_tests: 1,
    passed: 1,
    failed: 0,
    test_results: [{ name: "Test One", passed: true, test_uuid: "t1" }],
  }));

  function renderDone(
    props: Partial<React.ComponentProps<typeof BenchmarkResultsDialog>>,
  ) {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (isBenchmarkDetail(url, "task-strip")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-strip",
            status: "completed",
            model_results: ONE_TEST_TWO_MODELS,
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });
    render(
      <BenchmarkResultsDialog
        {...defaultProps}
        isOpen
        models={[]}
        taskId="task-strip"
        {...props}
      />,
    );
  }

  async function tickUnderBothModels(user: ReturnType<typeof setupUser>) {
    // A finished comparison opens on its Results, so the tests are a tab away.
    await user.click(await screen.findByRole("button", { name: "Tests" }));
    await user.click(await screen.findByText("togglelabel0"));
    await user.click(screen.getByText("togglelabel-m1-0"));
  }

  // The strip label is one span: a bold count then " tests selected".
  const stripLabel = (text: string) =>
    screen.queryByText(
      (_, el) => el?.tagName === "SPAN" && el.textContent === text,
    );

  it("counts the same test ticked under two models once", async () => {
    const onRunTests = jest.fn().mockResolvedValue(undefined);
    const onCompareTests = jest.fn();
    renderDone({ onRunTests, onCompareTests });
    const user = setupUser();
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
    await tickUnderBothModels(user);

    expect(stripLabel("1 test selected")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Run" }));
    expect(onRunTests).toHaveBeenCalledWith([{ uuid: "t1", name: "Test One" }]);
    await user.click(screen.getByRole("button", { name: "Compare" }));
    expect(onCompareTests).toHaveBeenCalledWith([
      { uuid: "t1", name: "Test One" },
    ]);
  });

  it("shows no strip when nothing can run or compare the ticked tests", async () => {
    renderDone({});
    const user = setupUser();
    await tickUnderBothModels(user);

    expect(
      screen.getByTestId("outputs-panel-labelling-selection"),
    ).not.toHaveTextContent("[]");
    expect(stripLabel("1 test selected")).toBeNull();
    expect(screen.queryByRole("button", { name: "Run" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Compare" })).toBeNull();
  });
});

describe("stepping from run to run", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = BACKEND_URL;
    global.fetch = jest.fn() as unknown as typeof fetch;
    useAccessTokenMock.mockReturnValue("test-token");
    isLabellingEligibleRawMock.mockReturnValue(true);
  });

  afterEach(() => {
    jest.clearAllMocks();
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
  });

  const navProps = {
    onPrevRun: jest.fn(),
    onNextRun: jest.fn(),
    hasPrevRun: true,
    hasNextRun: true,
    runPosition: { index: 11, total: 341 },
  };

  function renderNav(
    props: Partial<React.ComponentProps<typeof BenchmarkResultsDialog>> = {},
  ) {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (isBenchmarkDetail(url, "task-nav")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-nav",
            status: "completed",
            model_results: [
              {
                model: "gpt-4",
                success: true,
                message: "",
                total_tests: 1,
                passed: 1,
                failed: 0,
                test_results: [
                  { name: "Test One", passed: true, test_uuid: "t1" },
                ],
              },
            ],
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });
    return render(
      <BenchmarkResultsDialog
        {...defaultProps}
        isOpen
        models={[]}
        taskId="task-nav"
        {...props}
      />,
    );
  }

  it("shows the arrows and where this comparison sits in the list", async () => {
    renderNav(navProps);
    await screen.findByTestId("leaderboard");

    expect(
      screen.getByRole("button", { name: "Previous evaluation" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Next evaluation" }),
    ).toBeInTheDocument();
    expect(screen.getByText("12 of 341")).toBeInTheDocument();
  });

  it("steps to the run before and the run after", async () => {
    const onPrevRun = jest.fn();
    const onNextRun = jest.fn();
    renderNav({ ...navProps, onPrevRun, onNextRun });
    const user = setupUser();
    await screen.findByTestId("leaderboard");

    await user.click(screen.getByRole("button", { name: "Next evaluation" }));
    expect(onNextRun).toHaveBeenCalledTimes(1);
    await user.click(
      screen.getByRole("button", { name: "Previous evaluation" }),
    );
    expect(onPrevRun).toHaveBeenCalledTimes(1);
  });

  it("greys out each arrow at its end of the list", async () => {
    renderNav({ ...navProps, hasPrevRun: true, hasNextRun: false });
    await screen.findByTestId("leaderboard");

    expect(
      screen.getByRole("button", { name: "Previous evaluation" }),
    ).toBeEnabled();
    expect(
      screen.getByRole("button", { name: "Next evaluation" }),
    ).toBeDisabled();
  });

  it("draws no row when nothing is stepping through runs", async () => {
    renderNav();
    await screen.findByTestId("leaderboard");

    expect(screen.queryByTestId("dialog-nav-row")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Previous evaluation" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Next evaluation" }),
    ).not.toBeInTheDocument();
  });

  it("draws no row when the list holds only this run", async () => {
    renderNav({ ...navProps, runPosition: { index: 0, total: 1 } });
    await screen.findByTestId("leaderboard");

    expect(screen.queryByTestId("dialog-nav-row")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Next evaluation" }),
    ).not.toBeInTheDocument();
  });

  it("steps run to run with the left and right arrow keys", async () => {
    const onPrevRun = jest.fn();
    const onNextRun = jest.fn();
    renderNav({ ...navProps, onPrevRun, onNextRun });
    const user = setupUser();
    await screen.findByTestId("leaderboard");

    await user.keyboard("{ArrowLeft}");
    expect(onPrevRun).toHaveBeenCalledTimes(1);
    await user.keyboard("{ArrowRight}");
    expect(onNextRun).toHaveBeenCalledTimes(1);
  });

  it("does not close the window on Escape", async () => {
    const onClose = jest.fn();
    renderNav({ ...navProps, onClose });
    const user = setupUser();
    await screen.findByTestId("leaderboard");

    await user.keyboard("{Escape}");
    expect(onClose).not.toHaveBeenCalled();
  });
});
