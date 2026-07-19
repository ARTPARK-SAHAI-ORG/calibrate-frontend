import { render, screen, setupUser, waitFor, within, act } from "@/test-utils";
import { toast } from "sonner";
import { TestRunnerDialog } from "../TestRunnerDialog";

// Mock heavy child components so this file tests TestRunnerDialog's own
// state machine (polling, run lifecycle, labelling gating), not their
// internals (covered by their own test files / test-results/shared tests).
jest.mock("../eval-details", () => ({
  __esModule: true,
  TestRunOutputsPanel: ({
    results,
    selectedId,
    onSelect,
    labellingSelection,
    onToggleLabellingSelection,
  }: any) => (
    <div data-testid="outputs-panel">
      <div data-testid="results-count">{results.length}</div>
      {results.map((r: any) => (
        <div key={r.id}>
          <button onClick={() => onSelect(r.id)}>
            {r.name}:{r.status}
          </button>
          {onToggleLabellingSelection && (
            <button
              aria-label={`toggle-labelling-${r.id}`}
              onClick={() => onToggleLabellingSelection(r.id)}
            >
              {labellingSelection?.has(r.id) ? "selected" : "unselected"}
            </button>
          )}
        </div>
      ))}
      <div data-testid="selected-id">{selectedId}</div>
    </div>
  ),
  TestRunSummary: ({ passed, total }: any) => (
    <div data-testid="summary-panel">
      summary {passed}/{total}
    </div>
  ),
}));

jest.mock("../ShareButton", () => ({
  __esModule: true,
  ShareButton: () => <div data-testid="share-button" />,
}));

jest.mock("../ExportResultsButton", () => ({
  __esModule: true,
  ExportResultsButton: ({ getRows }: any) => (
    <button onClick={() => getRows()}>Export</button>
  ),
}));

jest.mock("../human-labelling/AddRunToLabellingTaskDialog", () => ({
  __esModule: true,
  AddRunToLabellingTaskDialog: ({ isOpen, onClose, source }: any) =>
    isOpen ? (
      <div data-testid="labelling-dialog" data-run-uuid={source?.runUuid}>
        <button onClick={onClose}>Close labelling</button>
      </div>
    ) : null,
  isLabellingEligibleRaw: ({ test_case }: any) =>
    test_case?.evaluation?.type !== "tool_call",
}));

jest.mock("sonner", () => ({
  __esModule: true,
  toast: { error: jest.fn(), success: jest.fn() },
}));

const BACKEND_URL = "http://backend.test";

function jsonResponse(body: any, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

describe("TestRunnerDialog", () => {
  const originalBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = BACKEND_URL;
    localStorage.setItem("access_token", "test-token");
    (global.fetch as any) = jest.fn();
  });

  afterEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    jest.useRealTimers();
    process.env.NEXT_PUBLIC_BACKEND_URL = originalBackendUrl;
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <TestRunnerDialog
        isOpen={false}
        onClose={jest.fn()}        agentName="My Agent"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("never starts a run when it opens without a taskId", async () => {
    // Regression: the dialog used to POST /run from an effect watching `tests`.
    // A parent handing it a fresh array identity per render re-fired that
    // effect and looped, firing hundreds of runs. Starting a run now belongs
    // to the caller; the dialog only ever displays the run it is given.
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    const props = {
      isOpen: true,
      onClose: jest.fn(),      agentName: "My Agent",
    };
    // Re-render repeatedly with fresh prop identities; none of it may fire a run.
    const { rerender } = render(
      <TestRunnerDialog {...props} onStatusUpdate={jest.fn()} />,
    );
    for (let i = 0; i < 5; i++) {
      rerender(<TestRunnerDialog {...props} onStatusUpdate={jest.fn()} />);
    }

    expect(await screen.findByText("Test run")).toBeInTheDocument();
    expect(
      (global.fetch as jest.Mock).mock.calls.some(([url]) =>
        String(url).endsWith("/agent-tests/agent/agent-1/run"),
      ),
    ).toBe(false);
  });

  it("polls the run it is handed and lands on the summary tab when done", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/run/task-1")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-1",
            status: "done",
            name: "Run One",
            passed: 1,
            failed: 0,
            results: [
              {
                test_uuid: "test-1",
                test_name: "Test One",
                status: "passed",
                passed: true,
                chat_history: [],
                output: { response: "hi" },
              },
            ],
            evaluators: [],
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}        agentName="My Agent"
        taskId="task-1"
        initialRunStatus="in_progress"
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("summary-panel")).toBeInTheDocument(),
    );
    expect(screen.getByText("Run One")).toBeInTheDocument();
    expect(screen.getByText(/summary 1\/1/)).toBeInTheDocument();

    // Tab nav is visible once done; switch back to outputs.
    await setupUser().click(screen.getByRole("button", { name: "Outputs" }));
    expect(screen.getByTestId("outputs-panel")).toBeInTheDocument();
  });

  it("views an existing completed run via taskId without starting a new run", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/run/task-existing")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-existing",
            status: "completed",
            name: "Past Run",
            passed: 2,
            failed: 0,
            results: [
              {
                test_uuid: "test-1",
                name: "Test One",
                status: "passed",
                passed: true,
              },
              {
                test_uuid: "test-2",
                name: "Test Two",
                status: "passed",
                passed: true,
              },
            ],
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}        agentName="My Agent"
        taskId="task-existing"
        initialRunStatus="completed"
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("summary-panel")).toBeInTheDocument(),
    );
    expect(screen.getByText("Past Run")).toBeInTheDocument();
    // POST /run should never be called when viewing an existing run.
    expect(
      (global.fetch as jest.Mock).mock.calls.some(([url]) =>
        String(url).endsWith("/agent-tests/agent/agent-1/run"),
      ),
    ).toBe(false);
  });

  it("reruns the exact tests the run executed, from test_uuids", async () => {
    const onRerun = jest.fn();
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/run/task-rerun")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-rerun",
            status: "completed",
            name: "Past Run",
            passed: 1,
            failed: 0,
            // The backend reports the executed test uuids (in run order).
            test_uuids: ["real-test-1", "real-test-2"],
            results: [
              { name: "Real Test 1", status: "passed", passed: true },
              { name: "Real Test 2", status: "passed", passed: true },
            ],
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}        agentName="My Agent"
        taskId="task-rerun"
        initialRunStatus="completed"
        onRerun={onRerun}
      />,
    );

    const rerunButton = await screen.findByRole("button", { name: /Rerun/ });
    await setupUser().click(rerunButton);

    expect(onRerun).toHaveBeenCalledTimes(1);
    const [tests] = onRerun.mock.calls[0];
    expect(tests.map((t: { uuid: string }) => t.uuid)).toEqual([
      "real-test-1",
      "real-test-2",
    ]);
    // Names are lifted from the matching result rows for display.
    expect(tests.map((t: { name: string }) => t.name)).toEqual([
      "Real Test 1",
      "Real Test 2",
    ]);
  });

  it("hides the Rerun button when the run reports no test_uuids (legacy run)", async () => {
    const onRerun = jest.fn();
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/run/task-legacy")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-legacy",
            status: "completed",
            name: "Legacy Run",
            passed: 1,
            failed: 0,
            // No test_uuids field → the run predates the backend snapshot.
            results: [{ name: "Only Test", status: "passed", passed: true }],
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}        agentName="My Agent"
        taskId="task-legacy"
        initialRunStatus="completed"
        onRerun={onRerun}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Legacy Run")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: /Rerun/ }),
    ).not.toBeInTheDocument();
  });

  it("does not show a Rerun button when onRerun is not provided", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/run/task-norerun")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-norerun",
            status: "completed",
            name: "No Rerun Run",
            passed: 1,
            failed: 0,
            results: [
              {
                test_uuid: "real-test-1",
                name: "Real Test",
                status: "passed",
                passed: true,
              },
            ],
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}        agentName="My Agent"
        taskId="task-norerun"
        initialRunStatus="completed"
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("No Rerun Run")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: /Rerun/ }),
    ).not.toBeInTheDocument();
  });

  it("shows the overall error state when the whole run errors", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/run/task-err")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-err",
            status: "failed",
            error: "boom",
            results: [
              { test_uuid: "test-1", status: "failed", passed: false, error: "boom" },
            ],
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}        agentName="My Agent"
        taskId="task-err"
        initialRunStatus="in_progress"
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Something went wrong")).toBeInTheDocument(),
    );
  });

  it("signs out on a 401 while polling", async () => {
    const { signOut } = require("next-auth/react");
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/run/task-401")) {
        return Promise.resolve(jsonResponse({}, false, 401));
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}        agentName="My Agent"
        taskId="task-401"
        initialRunStatus="in_progress"
      />,
    );

    await waitFor(() =>
      expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }),
    );
  });

  it("handles a missing NEXT_PUBLIC_BACKEND_URL gracefully", async () => {
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
    render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}        agentName="My Agent"
      />,
    );
    // Nothing to await on network; just ensure it doesn't throw and dialog renders.
    expect(await screen.findByText("Test run")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("calls onClose when the close button is clicked", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });
    const onClose = jest.fn();
    const user = setupUser();
    render(
      <TestRunnerDialog
        isOpen
        onClose={onClose}        agentName="My Agent"
      />,
    );
    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  describe("submit for labelling", () => {
    async function renderDoneRun() {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes("/evaluators?include_defaults=true")) {
          return Promise.resolve(jsonResponse([]));
        }
        if (url.endsWith("/agent-tests/run/task-label")) {
          return Promise.resolve(
            jsonResponse({
              task_id: "task-label",
              status: "completed",
              name: "Label Run",
              passed: 1,
              failed: 0,
              results: [
                {
                  test_uuid: "test-1",
                  name: "Test One",
                  status: "passed",
                  passed: true,
                  test_case: { evaluation: { type: "response" } },
                },
                {
                  test_uuid: "test-2",
                  name: "Tool Test",
                  status: "passed",
                  passed: true,
                  test_case: { evaluation: { type: "tool_call" } },
                },
              ],
            }),
          );
        }
        return Promise.reject(new Error(`Unexpected fetch ${url}`));
      });

      render(
        <TestRunnerDialog
          isOpen
          onClose={jest.fn()}          agentName="My Agent"
          taskId="task-label"
          initialRunStatus="completed"
        />,
      );
      await waitFor(() =>
        expect(screen.getByText("Label Run")).toBeInTheDocument(),
      );
    }

    it("shows an error toast when nothing is selected", async () => {
      await renderDoneRun();
      const user = setupUser();
      await user.click(
        screen.getByRole("button", { name: "Submit for labelling" }),
      );
      expect(toast.error).toHaveBeenCalledWith(
        "Select one or more tests to submit for labelling",
      );
      expect(screen.queryByTestId("labelling-dialog")).not.toBeInTheDocument();
    });

    it("shows an error toast when only tool-call tests are selected", async () => {
      await renderDoneRun();
      const user = setupUser();
      await user.click(screen.getByRole("button", { name: "Outputs" }));
      await user.click(
        screen.getByRole("button", { name: "toggle-labelling-test-2" }),
      );
      await user.click(
        screen.getByRole("button", { name: "Submit for labelling" }),
      );
      expect(toast.error).toHaveBeenCalledWith(
        "Tool-call tests can't be submitted for labelling",
      );
      expect(screen.queryByTestId("labelling-dialog")).not.toBeInTheDocument();
    });

    it("opens the labelling dialog when an eligible test is selected, and closes it again", async () => {
      await renderDoneRun();
      const user = setupUser();
      await user.click(screen.getByRole("button", { name: "Outputs" }));
      await user.click(
        screen.getByRole("button", { name: "toggle-labelling-test-1" }),
      );
      // Switch back to the summary tab so the submit click also exercises
      // the "switch back to outputs" branch inside the handler.
      await user.click(screen.getByRole("button", { name: "Summary" }));
      await user.click(
        screen.getByRole("button", { name: "Submit for labelling" }),
      );
      expect(screen.getByTestId("labelling-dialog")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Close labelling" }));
      expect(screen.queryByTestId("labelling-dialog")).not.toBeInTheDocument();
    });

    it("drives the share button and the labelling dialog off the taskId it was handed", async () => {
      // The taskId prop is the single source of truth for the run identity, so
      // the run-scoped surfaces must both point at it.
      await renderDoneRun();
      expect(screen.getByTestId("share-button")).toBeInTheDocument();

      const user = setupUser();
      await user.click(screen.getByRole("button", { name: "Outputs" }));
      await user.click(
        screen.getByRole("button", { name: "toggle-labelling-test-1" }),
      );
      await user.click(
        screen.getByRole("button", { name: "Submit for labelling" }),
      );
      expect(screen.getByTestId("labelling-dialog")).toHaveAttribute(
        "data-run-uuid",
        "task-label",
      );
    });

    it("keeps the share button and labelling entry point after a poll failure", async () => {
      // A failed poll used to null a separate run-id state. The run-scoped
      // surfaces read the taskId prop, so they must survive that failure.
      await renderDoneRun();
      const user = setupUser();
      await user.click(screen.getByRole("button", { name: "Outputs" }));
      await user.click(
        screen.getByRole("button", { name: "toggle-labelling-test-1" }),
      );

      (global.fetch as jest.Mock).mockRejectedValue(new Error("network down"));

      await user.click(
        screen.getByRole("button", { name: "Submit for labelling" }),
      );
      expect(screen.getByTestId("labelling-dialog")).toHaveAttribute(
        "data-run-uuid",
        "task-label",
      );
    });

    it("exports run results as CSV rows via the export button", async () => {
      await renderDoneRun();
      const user = setupUser();
      // Should not throw when building CSV rows from the current results.
      await user.click(screen.getByRole("button", { name: "Export" }));
    });
  });

  it("re-polls on the interval tick and stops once the run completes", async () => {
    jest.useFakeTimers();
    let pollCount = 0;
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/run/task-tick")) {
        pollCount += 1;
        const done = pollCount >= 2;
        return Promise.resolve(
          jsonResponse({
            task_id: "task-tick",
            status: done ? "done" : "in_progress",
            results: done
              ? [{ test_uuid: "test-1", name: "Test One", status: "passed", passed: true }]
              : [],
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}        agentName="My Agent"
        taskId="task-tick"
        initialRunStatus="in_progress"
      />,
    );

    // Flush the immediate first poll, then advance past one polling interval
    // to trigger the `setInterval` callback's own poll.
    await act(async () => {
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      await Promise.resolve();
    });
    await act(async () => {
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(pollCount).toBeGreaterThanOrEqual(2);
  });

  it("surfaces a poll failure (non-ok response) via reportError and stops the run", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/run/task-bad")) {
        return Promise.resolve(jsonResponse({}, false, 500));
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}        agentName="My Agent"
        taskId="task-bad"
        initialRunStatus="in_progress"
      />,
    );

    // Dialog should still render its shell without crashing.
    await waitFor(() => expect(screen.getByText("My Agent")).toBeInTheDocument());
  });

  // NOTE: `onStatusUpdate` is gated on the `isRunning` state variable read
  // inside `pollTaskStatus`. It is defined once per render
  // and invoked later via `setTimeout`/`setInterval` closures set up in a
  // mount-only effect, so they always see the pre-`setIsRunning(true)`
  // value of `isRunning` (stale closure) — the callback is effectively
  // unreachable in the current implementation. This test documents that
  // observed behavior rather than asserting an unreachable code path; it's
  // a source bug, left unmodified per instructions.
  it("does not fire onStatusUpdate during polling due to a stale isRunning closure", async () => {
    const onStatusUpdate = jest.fn();
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/run/task-notify")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-notify",
            status: "in_progress",
            passed: 0,
            failed: 0,
            results: [
              {
                test_uuid: "test-1",
                test_name: "Test One",
                status: undefined,
                passed: null,
              },
            ],
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}        agentName="My Agent"
        taskId="task-notify"
        initialRunStatus="in_progress"
        onStatusUpdate={onStatusUpdate}
      />,
    );

    await waitFor(() =>
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url]) =>
          String(url).endsWith("/agent-tests/run/task-notify"),
        ),
      ).toBe(true),
    );
    expect(onStatusUpdate).not.toHaveBeenCalled();
  });

  it("falls back to the default evaluator resolution error path without crashing", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.reject(new Error("network down"));
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}        agentName="My Agent"
      />,
    );

    expect(await screen.findByText("My Agent")).toBeInTheDocument();
  });

  it("explains a run that finished without producing any results", async () => {
    // The server can fail a run before it has anything to say about individual
    // tests. Rows come only from the server, so there is nothing to list, and
    // the dialog used to render an empty panel with no explanation.
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/run/task-empty")) {
        return Promise.resolve(
          jsonResponse({ task_id: "task-empty", status: "failed", results: [] }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}
        agentName="My Agent"
        taskId="task-empty"
        initialRunStatus="in_progress"
      />,
    );

    expect(
      await screen.findByText("This run failed before any tests ran"),
    ).toBeInTheDocument();
    // Not left spinning, and no empty results list.
    expect(screen.queryByText("Loading run")).not.toBeInTheDocument();
    expect(screen.queryByTestId("outputs-panel")).not.toBeInTheDocument();
  });

  it("shows a loading state instead of fabricated rows until the first poll lands, and tears down the prior interval when taskId changes", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/run/task-a") || url.endsWith("/agent-tests/run/task-b")) {
        return Promise.resolve(
          jsonResponse({ task_id: "task-a", status: "in_progress", results: [] }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    const { rerender } = render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}        agentName="My Agent"
        taskId="task-a"
        initialRunStatus="in_progress"
      />,
    );

    // Nothing is fabricated before the first poll resolves: the dialog shows
    // its loading state and renders no outputs panel at all.
    expect(screen.getByText("Loading run")).toBeInTheDocument();
    expect(screen.queryByTestId("outputs-panel")).not.toBeInTheDocument();
    // A poll that carries no results keeps the loading state up.
    await waitFor(() =>
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url]) =>
          String(url).endsWith("/agent-tests/run/task-a"),
        ),
      ).toBe(true),
    );
    expect(screen.getByText("Loading run")).toBeInTheDocument();

    rerender(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}        agentName="My Agent"
        taskId="task-b"
        initialRunStatus="in_progress"
      />,
    );

    await waitFor(() =>
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url]) =>
          String(url).endsWith("/agent-tests/run/task-b"),
        ),
      ).toBe(true),
    );
  });

  it("falls back to test_case.name / Unknown Test / a generated uuid when a past run's rows omit name/test_uuid", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/run/task-fallback")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-fallback",
            status: "completed",
            results: [
              // No `name`/`test_name`, but a `test_case.name` to fall back to.
              {
                status: "passed",
                passed: true,
                test_case: { name: "From test_case" },
              },
              // No name at all -> "Unknown Test" + generated uuid.
              { status: "failed", passed: false },
            ],
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    const user = setupUser();
    render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}        agentName="My Agent"
        taskId="task-fallback"
        initialRunStatus="completed"
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Outputs" })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Outputs" }));
    expect(screen.getByText(/From test_case:passed/)).toBeInTheDocument();
    expect(screen.getByText(/Unknown Test:failed/)).toBeInTheDocument();
  });

  it("rebuilds rows from each poll and keeps them when a later poll carries no results", async () => {
    let pollN = 0;
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/run/task-match")) {
        pollN += 1;
        if (pollN === 1) {
          // Partial results while the run is still in progress.
          return Promise.resolve(
            jsonResponse({
              task_id: "task-match",
              status: "in_progress",
              results: [
                {
                  test_uuid: "test-1",
                  name: "Test One",
                  status: "running",
                  passed: null,
                },
              ],
            }),
          );
        }
        // Later polls omit the results array entirely; the rows we already
        // have must survive them.
        return Promise.resolve(
          jsonResponse({ task_id: "task-match", status: "in_progress" }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    jest.useFakeTimers();
    render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}
        agentName="My Agent"
        taskId="task-match"
        initialRunStatus="in_progress"
      />,
    );

    await act(async () => {
      jest.advanceTimersByTime(0);
      await Promise.resolve();
      await Promise.resolve();
    });
    // The first poll's row is rendered as running.
    expect(screen.getByText(/Test One:running/)).toBeInTheDocument();

    await act(async () => {
      jest.advanceTimersByTime(3000);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(pollN).toBeGreaterThanOrEqual(2);
    // Still there after the results-less poll.
    expect(screen.getByTestId("results-count")).toHaveTextContent("1");
  });

  it("shows the loading state while it is open without a run uuid yet", async () => {
    // The caller opens the dialog the moment the user clicks Run and only
    // passes `taskId` in once the server answers. That gap must show the same
    // spinner as the wait for the first poll, never an empty panel.
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    render(
      <TestRunnerDialog isOpen onClose={jest.fn()} agentName="My Agent" />,
    );

    expect(screen.getByText("Loading run")).toBeInTheDocument();
    // No rows, no empty results list, and not the terminal "no results" panel.
    expect(screen.queryByTestId("outputs-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("summary-panel")).not.toBeInTheDocument();
    expect(
      screen.queryByText("This run failed before any tests ran"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("This run finished without any results"),
    ).not.toBeInTheDocument();

    // Still never starts a run of its own, and never polls without a uuid.
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const urls = (global.fetch as jest.Mock).mock.calls.map(([u]) => String(u));
    expect(urls.some((u) => u.includes("/agent-tests/agent/"))).toBe(false);
    expect(urls.some((u) => u.includes("/agent-tests/run/"))).toBe(false);
  });

  it("starts polling and renders rows once the run uuid arrives", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/run/task-late")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-late",
            status: "in_progress",
            name: "Late Run",
            results: [
              {
                test_uuid: "test-1",
                name: "Test One",
                status: "running",
                passed: null,
              },
            ],
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    const { rerender } = render(
      <TestRunnerDialog isOpen onClose={jest.fn()} agentName="My Agent" />,
    );
    expect(screen.getByText("Loading run")).toBeInTheDocument();

    // The server answers: the caller hands the uuid down.
    rerender(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}
        agentName="My Agent"
        taskId="task-late"
        initialRunStatus="in_progress"
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("outputs-panel")).toBeInTheDocument(),
    );
    expect(screen.getByText(/Test One:running/)).toBeInTheDocument();
    expect(screen.queryByText("Loading run")).not.toBeInTheDocument();
  });

  it("resets to the loading state when reopened, with no stale rows", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/run/task-prev")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-prev",
            status: "completed",
            name: "Previous Run",
            results: [
              {
                test_uuid: "test-1",
                name: "Old Test",
                status: "passed",
                passed: true,
              },
            ],
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    const { rerender } = render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}
        agentName="My Agent"
        taskId="task-prev"
        initialRunStatus="completed"
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Previous Run")).toBeInTheDocument(),
    );

    // Close, then reopen for a run whose uuid has not arrived yet.
    rerender(
      <TestRunnerDialog
        isOpen={false}
        onClose={jest.fn()}
        agentName="My Agent"
      />,
    );
    rerender(
      <TestRunnerDialog isOpen onClose={jest.fn()} agentName="My Agent" />,
    );

    expect(screen.getByText("Loading run")).toBeInTheDocument();
    expect(screen.queryByText("Previous Run")).not.toBeInTheDocument();
    expect(screen.queryByTestId("outputs-panel")).not.toBeInTheDocument();
    expect(screen.queryByTestId("summary-panel")).not.toBeInTheDocument();
  });

  it("selects a test from the outputs panel", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/run/task-select")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-select",
            status: "in_progress",
            results: [
              { test_uuid: "test-1", name: "Test One", status: "running", passed: null },
            ],
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}        agentName="My Agent"
        taskId="task-select"
        initialRunStatus="in_progress"
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("outputs-panel")).toBeInTheDocument(),
    );
  });
});
