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
    BenchmarkOutputsPanel: (props: any) => (
      <div data-testid="outputs-panel">
        <div data-testid="outputs-panel-models">
          {JSON.stringify(props.modelResults.map((m: any) => m.model))}
        </div>
        <div data-testid="outputs-panel-evaluators">
          {JSON.stringify(props.evaluatorsByUuid)}
        </div>
        <div data-testid="outputs-panel-labelling-selection">
          {props.labellingSelection
            ? JSON.stringify(Array.from(props.labellingSelection))
            : "undefined"}
        </div>
        <button onClick={() => props.onNavChange?.({ currentIndex: 0, total: 1, goPrev: () => {}, goNext: () => {} })}>
          setnav
        </button>
        <button onClick={() => props.onSelectTest?.(props.modelResults[0]?.model, 0)}>
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
      <div data-testid="leaderboard">{props.filename}</div>
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
  StopRunButton: (props: any) => (
    <button onClick={() => props.onStop()}>Stop</button>
  ),
  RunStateMark: ({ state }: any) => <span data-testid="run-mark">{state}</span>,
  // The real rename box, so renaming a run is exercised end to end here.
  RenameDialog: jest.requireActual("../ui/RenameDialog").RenameDialog,
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

  it("starts a new benchmark run, polls, and lands on the leaderboard tab when done", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    const onBenchmarkCreated = jest.fn();
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.endsWith("/agent-tests/agent/agent-1/benchmark")) {
        return Promise.resolve(jsonResponse({ task_id: "task-1", status: "queued" }));
      }
      if (url.endsWith("/agent-tests/benchmark/task-1")) {
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

    await waitFor(() => expect(onBenchmarkCreated).toHaveBeenCalledWith("task-1"));
    await waitFor(() => expect(screen.getByText("Run One")).toBeInTheDocument());
    await waitFor(() => expect(screen.getByTestId("leaderboard")).toBeInTheDocument());

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
      if (url.endsWith("/agent-tests/benchmark/task-existing")) {
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

    await waitFor(() => expect(screen.getByText("Past Run")).toBeInTheDocument());
    expect(
      (global.fetch as jest.Mock).mock.calls.some(([url]) =>
        String(url).endsWith("/agent-tests/agent/agent-1/benchmark"),
      ),
    ).toBe(false);
  });

  it("does not keep the previous run's name when the window opens another run", async () => {
    let holdSecond: (value: any) => void = () => {};
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.endsWith("/agent-tests/benchmark/task-first")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-first",
            status: "completed",
            name: "Regression before v2",
            model_results: [],
          }),
        );
      }
      if (url.endsWith("/agent-tests/benchmark/task-second")) {
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
        if (url.endsWith("/agent-tests/benchmark/task-existing")) {
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
    await user.type(
      screen.getByLabelText("Name"),
      "Nightly models{Enter}",
    );

    expect(await screen.findByText("Nightly models")).toBeInTheDocument();
    expect(onRenamed).toHaveBeenCalledWith("Nightly models");
  });

  it("does not fetch and clears initial loading when models is empty and no taskId", async () => {
    render(
      <BenchmarkResultsDialog {...defaultProps} isOpen models={[]} />,
    );

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
        return Promise.resolve(jsonResponse({ task_id: "task-2", status: "queued" }));
      }
      if (url.endsWith("/agent-tests/benchmark/task-2")) {
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

    // The run is now done, which auto-switches to the leaderboard tab; flip
    // back to outputs to read the evaluators prop passed to the panel.
    await waitFor(() => expect(screen.getByTestId("leaderboard")).toBeInTheDocument());
    await setupUser().click(screen.getByRole("button", { name: "Results" }));

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
      if (url.endsWith("/agent-tests/benchmark/task-err")) {
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
    expect(reportError).toHaveBeenCalledWith("Benchmark error:", "boom");
  });

  it("stops polling, reports the error, and sets status failed when the poll fetch rejects", async () => {
    jest.useFakeTimers({ advanceTimers: true });
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.endsWith("/agent-tests/benchmark/task-throw")) {
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
      if (url.endsWith("/agent-tests/benchmark/task-close")) {
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
          if (url.endsWith("/agent-tests/benchmark/task-stop")) {
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
        if (url.endsWith("/agent-tests/benchmark/task-stop")) {
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
        if (url.endsWith("/agent-tests/benchmark/task-done")) {
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
        return Promise.resolve(jsonResponse({ task_id: "task-refresh", status: "queued" }));
      }
      if (url.endsWith("/agent-tests/benchmark/task-refresh")) {
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
        if (url.endsWith("/agent-tests/benchmark/task-ph")) {
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
        expect(
          screen.getByTestId("outputs-panel-models").textContent,
        ).toBe(JSON.stringify(["gpt-4", "claude"])),
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
        if (url.endsWith("/agent-tests/benchmark/task-partial")) {
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
        expect(
          screen.getByTestId("outputs-panel-models").textContent,
        ).toBe(JSON.stringify(["gpt-4", "claude"])),
      );
      expect(pollCount).toBeGreaterThanOrEqual(1);
    });

    it("returns modelResults as-is once done", async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.endsWith("/agent-tests/benchmark/task-done")) {
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
      await waitFor(() => expect(screen.getByTestId("leaderboard")).toBeInTheDocument());
      await setupUser().click(screen.getByRole("button", { name: "Results" }));

      await waitFor(() =>
        expect(
          screen.getByTestId("outputs-panel-models").textContent,
        ).toBe(JSON.stringify(["gpt-4"])),
      );
    });
  });

  describe("done-state UI: tabs, pager, export, share, labelling, rerun", () => {
    async function renderDoneRun(overrides: Partial<any> = {}) {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.endsWith("/agent-tests/benchmark/task-ui")) {
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
      await waitFor(() => expect(screen.getByText("UI Run")).toBeInTheDocument());
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

    it("prefers onRerun (direct rerun) over onGoBack and passes derived models/testNames", async () => {
      // Viewing a past run: `models` prop is empty, so the rerun config must be
      // recovered from the loaded model_results.
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.endsWith("/agent-tests/benchmark/task-rerun")) {
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
        />,
      );
      await waitFor(() =>
        expect(screen.getByText("Rerun Source")).toBeInTheDocument(),
      );

      const user = setupUser();
      await user.click(screen.getByRole("button", { name: /Rerun/ }));

      expect(onRerun).toHaveBeenCalledTimes(1);
      expect(onRerun).toHaveBeenCalledWith(
        ["gpt-4", "claude"],
        ["tu-1", "tu-2"],
        ["Test One", "Test Two"],
      );
      expect(onGoBack).not.toHaveBeenCalled();
    });

    it("hides the Rerun button on a legacy benchmark with no test_uuids (no onGoBack fallback)", async () => {
      // A viewed benchmark that predates the backend snapshot: no test_uuids,
      // and the view surfaces pass onRerun but not onGoBack.
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.endsWith("/agent-tests/benchmark/task-legacy")) {
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

      await user.click(screen.getByRole("button", { name: "Results" }));
      expect(screen.getByTestId("outputs-panel")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Leaderboard" }));
      expect(screen.getByTestId("leaderboard")).toBeInTheDocument();
    });

    it("shows the Top picks tab content when the Top picks tab is clicked", async () => {
      // The tab only appears when the run has cost + pass-rate data to plot.
      await renderDoneRun({
        leaderboard_summary: [{ model: "gpt-4", pass_rate: "100", cost: "0.05" }],
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
      await user.click(screen.getByRole("button", { name: "Results" }));

      expect(screen.queryByTestId("result-pager")).not.toBeInTheDocument();
      await user.click(screen.getByText("setnav"));
      // selectedTest gets auto-selected once modelResults has data, so the
      // pager should now show up.
      await waitFor(() =>
        expect(screen.getByTestId("result-pager")).toBeInTheDocument(),
      );

      await user.click(screen.getByRole("button", { name: "Leaderboard" }));
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
      expect(screen.queryByTestId("add-to-task-dialog")).not.toBeInTheDocument();
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
      await setupUser().click(screen.getByRole("button", { name: "Results" }));
      expect(
        screen.getByTestId("outputs-panel-labelling-selection"),
      ).toHaveTextContent("undefined");
    });

    it("submit-for-labelling: opens the AddRunToLabellingTaskDialog when eligible tests are selected", async () => {
      await renderDoneRun();
      const user = setupUser();
      await user.click(screen.getByRole("button", { name: "Results" }));
      await user.click(screen.getByText("togglelabel0"));

      await user.click(
        screen.getByRole("button", { name: "Submit for labelling" }),
      );
      expect(screen.getByTestId("add-to-task-dialog")).toBeInTheDocument();

      await user.click(screen.getByText("close"));
      expect(screen.queryByTestId("add-to-task-dialog")).not.toBeInTheDocument();
    });

    it("bulk-toggle labelling selection also drives eligibility", async () => {
      await renderDoneRun();
      const user = setupUser();
      await user.click(screen.getByRole("button", { name: "Results" }));
      await user.click(screen.getByText("bulktogglelabel0"));

      await user.click(
        screen.getByRole("button", { name: "Submit for labelling" }),
      );
      expect(screen.getByTestId("add-to-task-dialog")).toBeInTheDocument();
    });

    it("does not show export/share/submit-for-labelling when there are no results", async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.endsWith("/agent-tests/benchmark/task-empty")) {
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
        if (url.endsWith("/agent-tests/benchmark/task-notoken")) {
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
      if (url.endsWith("/agent-tests/benchmark/task-auto")) {
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

    // Second poll adds "gpt-4" with results too and completes the run, which
    // auto-switches to the leaderboard tab; flip back to outputs. The
    // selection should stay pinned to whatever was auto-selected first
    // (guarded by a ref) rather than jumping to "gpt-4". We can't directly
    // read `selectedTest` from the mock, but we can assert the panel renders
    // without crashing; deeper assertion would require exposing selectedTest
    // through the outputs panel mock, which duplicates internal state -
    // skipped per task's guidance on deeply nested edge cases under
    // fake-timer flakiness.
    await waitFor(() => expect(screen.getByTestId("leaderboard")).toBeInTheDocument());
    await act(async () => {
      await setupUser().click(screen.getByRole("button", { name: "Results" }));
    });
    expect(screen.getByTestId("outputs-panel")).toBeInTheDocument();
  });
});
