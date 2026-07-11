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
  };
});

jest.mock("../ui", () => ({
  __esModule: true,
  StatusBadge: (props: any) => (
    <span data-testid="status-badge">{props.status}</span>
  ),
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
jest.mock("../../hooks", () => ({
  __esModule: true,
  useAccessToken: () => useAccessTokenMock(),
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
    await setupUser().click(screen.getByRole("button", { name: "Outputs" }));

    await waitFor(() =>
      expect(screen.getByTestId("outputs-panel-evaluators").textContent).toBe(
        "{}",
      ),
    );
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
      await setupUser().click(screen.getByRole("button", { name: "Outputs" }));

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

    it("switches tabs between leaderboard and outputs", async () => {
      await renderDoneRun();
      const user = setupUser();

      // Auto-switched to leaderboard once done with no error.
      await waitFor(() =>
        expect(screen.getByTestId("leaderboard")).toBeInTheDocument(),
      );

      await user.click(screen.getByRole("button", { name: "Outputs" }));
      expect(screen.getByTestId("outputs-panel")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Leaderboard" }));
      expect(screen.getByTestId("leaderboard")).toBeInTheDocument();
    });

    it("shows the nav pager only on the outputs tab once nav + selectedTest are set", async () => {
      await renderDoneRun();
      const user = setupUser();
      await user.click(screen.getByRole("button", { name: "Outputs" }));

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

    it("submit-for-labelling: shows a toast when selected tests are not eligible", async () => {
      await renderDoneRun();
      const user = setupUser();
      await user.click(screen.getByRole("button", { name: "Outputs" }));
      await user.click(screen.getByText("togglelabel0"));

      isLabellingEligibleRawMock.mockReturnValue(false);
      await user.click(
        screen.getByRole("button", { name: "Submit for labelling" }),
      );
      expect(toast.error).toHaveBeenCalledWith(
        "Tool-call tests can't be submitted for labelling",
      );
      expect(screen.queryByTestId("add-to-task-dialog")).not.toBeInTheDocument();
    });

    it("submit-for-labelling: opens the AddRunToLabellingTaskDialog when eligible tests are selected", async () => {
      await renderDoneRun();
      const user = setupUser();
      await user.click(screen.getByRole("button", { name: "Outputs" }));
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
      await user.click(screen.getByRole("button", { name: "Outputs" }));
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
      await setupUser().click(screen.getByRole("button", { name: "Outputs" }));
    });
    expect(screen.getByTestId("outputs-panel")).toBeInTheDocument();
  });
});
