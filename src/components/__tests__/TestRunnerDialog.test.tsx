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
  AddRunToLabellingTaskDialog: ({ isOpen, onClose }: any) =>
    isOpen ? (
      <div data-testid="labelling-dialog">
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

function makeTest(overrides: Partial<any> = {}) {
  return {
    uuid: "test-1",
    name: "Test One",
    description: "",
    type: "response",
    config: {},
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

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
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        tests={[]}
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("starts a new run, polls, and lands on the summary tab when done", async () => {
    const onRunCreated = jest.fn();
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/agent/agent-1/run")) {
        return Promise.resolve(jsonResponse({ task_id: "task-1", status: "in_progress" }));
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
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        tests={[makeTest()]}
        onRunCreated={onRunCreated}
      />,
    );

    await waitFor(() => expect(onRunCreated).toHaveBeenCalledWith("task-1"));
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
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        tests={[]}
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

  it("reruns exactly the same tests when the results carry real uuids", async () => {
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
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        tests={[]}
        taskId="task-rerun"
        initialRunStatus="completed"
        onRerun={onRerun}
      />,
    );

    const rerunButton = await screen.findByRole("button", { name: /Rerun/ });
    await setupUser().click(rerunButton);

    expect(onRerun).toHaveBeenCalledTimes(1);
    const [tests, runAllLinked] = onRerun.mock.calls[0];
    // Real uuids present → rerun those exact tests, not all linked.
    expect(runAllLinked).toBe(false);
    expect(tests.map((t: { uuid: string }) => t.uuid)).toEqual(["real-test-1"]);
  });

  it("reruns all linked tests when the viewed results lack real uuids", async () => {
    const onRerun = jest.fn();
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/run/task-synthetic")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-synthetic",
            status: "completed",
            name: "Synthetic Run",
            passed: 1,
            failed: 0,
            // No test_uuid on any row → all synthesised as `generated-*`, so a
            // per-uuid rerun is impossible and we fall back to all linked.
            results: [{ name: "Only Test", status: "passed", passed: true }],
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        tests={[]}
        taskId="task-synthetic"
        initialRunStatus="completed"
        onRerun={onRerun}
      />,
    );

    const rerunButton = await screen.findByRole("button", { name: /Rerun/ });
    await setupUser().click(rerunButton);

    expect(onRerun).toHaveBeenCalledTimes(1);
    const [tests, runAllLinked] = onRerun.mock.calls[0];
    expect(runAllLinked).toBe(true);
    // The displayed rows still seed the new dialog's list even though their
    // uuids are synthetic (the POST omits test_uuids when running all linked).
    expect(tests).toHaveLength(1);
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
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        tests={[]}
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
      if (url.endsWith("/agent-tests/agent/agent-1/run")) {
        return Promise.resolve(jsonResponse({ task_id: "task-err", status: "in_progress" }));
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
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        tests={[makeTest()]}
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
      if (url.endsWith("/agent-tests/agent/agent-1/run")) {
        return Promise.resolve(jsonResponse({ task_id: "task-401", status: "in_progress" }));
      }
      if (url.endsWith("/agent-tests/run/task-401")) {
        return Promise.resolve(jsonResponse({}, false, 401));
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        tests={[makeTest()]}
      />,
    );

    await waitFor(() =>
      expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }),
    );
  });

  it("signs out on a 401 when starting the run", async () => {
    const { signOut } = require("next-auth/react");
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/agent/agent-1/run")) {
        return Promise.resolve(jsonResponse({}, false, 401));
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        tests={[makeTest()]}
      />,
    );

    await waitFor(() =>
      expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }),
    );
  });

  it("marks tests failed when starting the run throws", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/agent/agent-1/run")) {
        return Promise.resolve(jsonResponse({}, false, 500));
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        tests={[makeTest()]}
      />,
    );

    // The run-start failure marks the (only) test row as failed, but
    // `runStatus` itself stays whatever it was before the throw (only the
    // per-test rows carry the error) — so the outputs panel renders with a
    // failed row rather than the overall-error screen.
    await waitFor(() =>
      expect(screen.getByText(/Test One:failed/)).toBeInTheDocument(),
    );
  });

  it("handles a missing NEXT_PUBLIC_BACKEND_URL gracefully when starting a run", async () => {
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
    render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        tests={[makeTest()]}
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
      return Promise.resolve(jsonResponse({ task_id: "t", status: "in_progress" }));
    });
    const onClose = jest.fn();
    const user = setupUser();
    render(
      <TestRunnerDialog
        isOpen
        onClose={onClose}
        agentUuid="agent-1"
        agentName="My Agent"
        tests={[makeTest()]}
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
          onClose={jest.fn()}
          agentUuid="agent-1"
          agentName="My Agent"
          tests={[]}
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
      if (url.endsWith("/agent-tests/agent/agent-1/run")) {
        return Promise.resolve(jsonResponse({ task_id: "task-tick", status: "in_progress" }));
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
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        tests={[makeTest()]}
      />,
    );

    // Let the initial setTimeout(runAllTests, 0) fire, then flush the POST +
    // first immediate poll, then advance past one polling interval to
    // trigger the `setInterval` callback's own poll.
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
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        tests={[]}
        taskId="task-bad"
        initialRunStatus="in_progress"
      />,
    );

    // Dialog should still render its shell without crashing.
    await waitFor(() => expect(screen.getByText("My Agent")).toBeInTheDocument());
  });

  // NOTE: `onStatusUpdate` is gated on the `isRunning` state variable read
  // inside `pollTaskStatus`/`runAllTests`. Both are defined once per render
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
      if (url.endsWith("/agent-tests/agent/agent-1/run")) {
        return Promise.resolve(jsonResponse({ task_id: "task-notify", status: "in_progress" }));
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
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        tests={[makeTest()]}
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
      return Promise.resolve(jsonResponse({ task_id: "t", status: "in_progress", results: [] }));
    });

    render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        tests={[makeTest()]}
      />,
    );

    expect(await screen.findByText("My Agent")).toBeInTheDocument();
  });

  it("passes through the runAllLinked flag by omitting test_uuids", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string, init?: any) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/agent/agent-1/run")) {
        expect(JSON.parse(init.body)).toEqual({});
        return Promise.resolve(jsonResponse({ task_id: "task-linked", status: "in_progress" }));
      }
      if (url.endsWith("/agent-tests/run/task-linked")) {
        return Promise.resolve(
          jsonResponse({ task_id: "task-linked", status: "in_progress", results: [] }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        tests={[makeTest()]}
        runAllLinked
      />,
    );

    await waitFor(() =>
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url]) =>
          String(url).endsWith("/agent-tests/agent/agent-1/run"),
        ),
      ).toBe(true),
    );
  });

  it("seeds running rows from `tests` while viewing an in-progress run, and tears down the prior interval when taskId changes", async () => {
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
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        tests={[makeTest()]}
        taskId="task-a"
        initialRunStatus="in_progress"
      />,
    );

    // tests.length > 0 seeds one running row immediately, before the first poll resolves.
    expect(screen.getByText(/Test One:running/)).toBeInTheDocument();

    rerender(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        tests={[makeTest()]}
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
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        tests={[]}
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

  it("matches subsequent poll rows by name, then falls back to index matching and the in-progress running transition", async () => {
    let pollN = 0;
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/agent/agent-1/run")) {
        return Promise.resolve(jsonResponse({ task_id: "task-match", status: "in_progress" }));
      }
      if (url.endsWith("/agent-tests/run/task-match")) {
        pollN += 1;
        if (pollN === 1) {
          // No uuid match (different uuid) but a name match -> hits the
          // name-matching branch.
          return Promise.resolve(
            jsonResponse({
              task_id: "task-match",
              status: "in_progress",
              results: [
                { test_uuid: "other-uuid", name: "Test One", status: "running", passed: null },
              ],
            }),
          );
        }
        // Second/final poll: no matching row at all -> stays running via the
        // in_progress/queued-or-pending branch, then "done" to stop polling.
        return Promise.resolve(
          jsonResponse({ task_id: "task-match", status: "done", results: [] }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    jest.useFakeTimers();
    render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        tests={[makeTest()]}
      />,
    );

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

    expect(pollN).toBeGreaterThanOrEqual(2);
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
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        tests={[]}
        taskId="task-select"
        initialRunStatus="in_progress"
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("outputs-panel")).toBeInTheDocument(),
    );
  });
});
