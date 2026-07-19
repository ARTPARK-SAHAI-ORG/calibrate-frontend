import { render, screen, setupUser, waitFor, act } from "@/test-utils";
import { toast } from "sonner";
import { TestRunnerDialog } from "../TestRunnerDialog";

// Mock heavy child components so this file tests TestRunnerDialog's own
// state machine (fetch/poll lifecycle, row derivation, labelling gating), not
// their internals (covered by their own test files).
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
const POLL_MS = 3000;

function jsonResponse(body: any, ok = true, status = ok ? 200 : 500) {
  return {
    ok,
    status,
    json: async () => body,
  };
}

/** How many times the run endpoint for `taskId` has been fetched. */
function runFetchCount(taskId: string) {
  return (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
    String(url).endsWith(`/agent-tests/run/${taskId}`),
  ).length;
}

/** Flush pending promises (and optionally timers) inside act(). */
async function flush(ms = 0) {
  await act(async () => {
    if (ms > 0) jest.advanceTimersByTime(ms);
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
  });
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
        taskId="task-1"
      />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("shows a spinner before the first response, then renders the run's rows", async () => {
    let resolveRun: (value: any) => void = () => {};
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/run/task-slow")) {
        return new Promise((resolve) => {
          resolveRun = resolve;
        });
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    const { container } = render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        taskId="task-slow"
      />,
    );

    // Loading: spinner shown, no outputs panel yet.
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByTestId("outputs-panel")).not.toBeInTheDocument();

    await act(async () => {
      resolveRun(
        jsonResponse({
          task_id: "task-slow",
          status: "completed",
          name: "Slow Run",
          results: [
            {
              test_uuid: "test-1",
              name: "Test One",
              status: "passed",
              passed: true,
            },
          ],
        }),
      );
    });

    await waitFor(() =>
      expect(screen.getByText("Slow Run")).toBeInTheDocument(),
    );
    expect(container.querySelector(".animate-spin")).not.toBeInTheDocument();
    await setupUser().click(screen.getByRole("button", { name: "Outputs" }));
    expect(screen.getByText(/Test One:passed/)).toBeInTheDocument();
  });

  it("renders server values: name fallbacks and pass/fail/running from `passed`", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/run/task-rows")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-rows",
            status: "in_progress",
            name: "Rows Run",
            results: [
              // `name` wins.
              {
                test_uuid: "t-1",
                name: "From name",
                test_name: "ignored",
                passed: true,
              },
              // Falls back to test_case.name.
              {
                test_uuid: "t-2",
                test_case: { name: "From test_case" },
                passed: false,
              },
              // Falls back to test_name.
              { test_uuid: "t-3", test_name: "From test_name", passed: false },
              // passed: null → still running, NOT failed.
              { test_uuid: "t-4", name: "Still Running", passed: null },
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
        taskId="task-rows"
      />,
    );

    await waitFor(() =>
      expect(screen.getByText(/From name:passed/)).toBeInTheDocument(),
    );
    expect(screen.getByText(/From test_case:failed/)).toBeInTheDocument();
    expect(screen.getByText(/From test_name:failed/)).toBeInTheDocument();
    expect(screen.getByText(/Still Running:running/)).toBeInTheDocument();
    expect(screen.queryByText(/Still Running:failed/)).not.toBeInTheDocument();
  });

  it("renders and selects legacy rows with no test_uuid, without fabricating a test", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/run/task-legacy-rows")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-legacy-rows",
            status: "completed",
            name: "Legacy Rows",
            results: [
              { name: "Legacy One", status: "passed", passed: true },
              { name: "Legacy Two", status: "failed", passed: false },
            ],
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    const user = setupUser();
    const { container } = render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        taskId="task-legacy-rows"
      />,
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Outputs" })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Outputs" }));

    expect(screen.getByTestId("results-count")).toHaveTextContent("2");
    // Selectable despite having no test_uuid (stable index id is used).
    await user.click(screen.getByText(/Legacy Two:failed/));
    expect(screen.getByTestId("selected-id")).toHaveTextContent("idx-1");
    // No fabricated test object leaks into the UI.
    expect(container.textContent).not.toMatch(/generated-\d/);
  });

  it("re-polls while in_progress, picks up new results, and stops once terminal", async () => {
    jest.useFakeTimers();
    let pollCount = 0;
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/run/task-tick")) {
        pollCount += 1;
        if (pollCount === 1) {
          return Promise.resolve(
            jsonResponse({
              task_id: "task-tick",
              status: "in_progress",
              results: [{ test_uuid: "t-1", name: "Test One", passed: null }],
            }),
          );
        }
        if (pollCount === 2) {
          return Promise.resolve(
            jsonResponse({
              task_id: "task-tick",
              status: "in_progress",
              results: [
                { test_uuid: "t-1", name: "Test One", passed: true },
                { test_uuid: "t-2", name: "Test Two", passed: null },
              ],
            }),
          );
        }
        return Promise.resolve(
          jsonResponse({
            task_id: "task-tick",
            status: "done",
            results: [
              { test_uuid: "t-1", name: "Test One", passed: true },
              { test_uuid: "t-2", name: "Test Two", passed: false },
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
        taskId="task-tick"
      />,
    );

    await flush();
    expect(runFetchCount("task-tick")).toBe(1);
    expect(screen.getByText(/Test One:running/)).toBeInTheDocument();

    // Second poll brings a completed row and a newly-arrived one.
    await flush(POLL_MS);
    expect(runFetchCount("task-tick")).toBe(2);
    expect(screen.getByText(/Test One:passed/)).toBeInTheDocument();
    expect(screen.getByText(/Test Two:running/)).toBeInTheDocument();

    // Third poll is terminal → polling stops.
    await flush(POLL_MS);
    expect(runFetchCount("task-tick")).toBe(3);

    await flush(POLL_MS * 5);
    expect(runFetchCount("task-tick")).toBe(3);
  });

  it("stops polling when the dialog is closed or unmounted", async () => {
    jest.useFakeTimers();
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/run/task-open")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-open",
            status: "in_progress",
            results: [],
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    const props = {
      onClose: jest.fn(),
      agentUuid: "agent-1",
      agentName: "My Agent",
      taskId: "task-open",
    };
    const { rerender, unmount } = render(
      <TestRunnerDialog isOpen {...props} />,
    );

    await flush();
    await flush(POLL_MS);
    const countWhileOpen = runFetchCount("task-open");
    expect(countWhileOpen).toBeGreaterThanOrEqual(2);

    // Closing the dialog tears the interval down.
    rerender(<TestRunnerDialog isOpen={false} {...props} />);
    await flush(POLL_MS * 5);
    expect(runFetchCount("task-open")).toBe(countWhileOpen);

    // Re-open, then unmount: still no further fetches after teardown.
    rerender(<TestRunnerDialog isOpen {...props} />);
    await flush();
    const countAfterReopen = runFetchCount("task-open");
    unmount();
    await flush(POLL_MS * 5);
    expect(runFetchCount("task-open")).toBe(countAfterReopen);
  });

  it("reruns the exact tests the run executed, from test_uuids", async () => {
    const onNewRun = jest.fn();
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
            test_uuids: ["real-test-1", "real-test-2"],
            results: [
              { name: "Real Test 1", status: "passed", passed: true },
              { name: "Real Test 2", status: "passed", passed: true },
            ],
          }),
        );
      }
      if (url.endsWith("/agent-tests/agent/agent-1/run")) {
        return Promise.resolve(jsonResponse({ task_id: "task-new" }));
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        taskId="task-rerun"
        onNewRun={onNewRun}
      />,
    );

    const rerunButton = await screen.findByRole("button", { name: /Rerun/ });
    await setupUser().click(rerunButton);

    await waitFor(() =>
      expect(onNewRun).toHaveBeenCalledWith("task-new", [
        "real-test-1",
        "real-test-2",
      ]),
    );
    const postCall = (global.fetch as jest.Mock).mock.calls.find(([url]) =>
      String(url).endsWith("/agent-tests/agent/agent-1/run"),
    );
    expect(postCall).toBeDefined();
    expect(postCall![1].method).toBe("POST");
    expect(JSON.parse(postCall![1].body)).toEqual({
      test_uuids: ["real-test-1", "real-test-2"],
    });
  });

  // Regression guard for the runaway-run bug from #266: the dialog used to
  // start runs from an effect that watched a `tests` array prop. `/tests`
  // rebuilt that array inline on every render, so each parent re-render looked
  // like new input and fired another run, and each run re-rendered the parent.
  // One click could put ~115 POSTs on the wire in three seconds. The dialog now
  // only ever POSTs from a click handler, so re-rendering it must stay silent.
  it("never starts a run on its own, no matter how often the parent re-renders", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/run/task-idle")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-idle",
            status: "completed",
            name: "Idle Run",
            test_uuids: ["real-test-1"],
            results: [{ name: "Real Test 1", status: "passed", passed: true }],
          }),
        );
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    const props = {
      isOpen: true as const,
      onClose: jest.fn(),
      agentUuid: "agent-1",
      agentName: "My Agent",
      taskId: "task-idle",
      onNewRun: jest.fn(),
    };
    const { rerender } = render(<TestRunnerDialog {...props} />);
    await screen.findByText("Idle Run");

    // Re-render repeatedly with fresh inline callback identities, which is what
    // a parent doing setState on every optimistic row update looks like.
    for (let i = 0; i < 20; i++) {
      rerender(
        <TestRunnerDialog
          {...props}
          onClose={() => {}}
          onNewRun={() => {}}
        />,
      );
    }
    await flush(30_000);

    const runPosts = (global.fetch as jest.Mock).mock.calls.filter(
      ([url, init]) =>
        String(url).endsWith("/agent-tests/agent/agent-1/run") &&
        init?.method === "POST",
    );
    expect(runPosts).toHaveLength(0);
    expect(props.onNewRun).not.toHaveBeenCalled();
  });

  // The rerun POST is the one place the dialog still writes to the backend, so
  // its two failure paths need to leave the user on the run they were viewing
  // rather than on a blank or half-switched dialog.
  const renderCompletedRunForRerun = (
    onNewRun: jest.Mock,
    startRunResponse: () => Promise<any>,
  ) => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/run/task-rerun-fail")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-rerun-fail",
            status: "completed",
            name: "Past Run",
            test_uuids: ["real-test-1"],
            results: [{ name: "Real Test 1", status: "passed", passed: true }],
          }),
        );
      }
      if (url.endsWith("/agent-tests/agent/agent-1/run")) {
        return startRunResponse();
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    return render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        taskId="task-rerun-fail"
        onNewRun={onNewRun}
      />,
    );
  };

  it("shows an error and stays on the current run when the rerun fails", async () => {
    const onNewRun = jest.fn();
    renderCompletedRunForRerun(onNewRun, () =>
      Promise.resolve({ ok: false, status: 500, json: async () => ({}) }),
    );

    await setupUser().click(
      await screen.findByRole("button", { name: /Rerun/ }),
    );

    await waitFor(() => expect(toast.error).toHaveBeenCalled());
    expect(onNewRun).not.toHaveBeenCalled();
    // The run being viewed is still on screen, not cleared.
    expect(screen.getByText("Past Run")).toBeInTheDocument();
  });

  it("starts only one run when Rerun is clicked twice quickly", async () => {
    let startRunCalls = 0;
    renderCompletedRunForRerun(jest.fn(), () => {
      startRunCalls += 1;
      // Never settles, so the second click lands while the first is in flight.
      return new Promise(() => {});
    });

    const user = setupUser();
    const rerunButton = await screen.findByRole("button", { name: /Rerun/ });
    await user.click(rerunButton);
    await waitFor(() => expect(rerunButton).toBeDisabled());
    await user.click(rerunButton);

    expect(startRunCalls).toBe(1);
  });

  it("signs out when the rerun is rejected as unauthorized", async () => {
    const { signOut } = require("next-auth/react");
    const onNewRun = jest.fn();
    renderCompletedRunForRerun(onNewRun, () =>
      Promise.resolve({ ok: false, status: 401, json: async () => ({}) }),
    );

    await setupUser().click(
      await screen.findByRole("button", { name: /Rerun/ }),
    );

    await waitFor(() =>
      expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }),
    );
    expect(onNewRun).not.toHaveBeenCalled();
  });

  it("hides the Rerun button when the run reports no test_uuids (legacy run)", async () => {
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
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        taskId="task-legacy"
        onNewRun={jest.fn()}
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Legacy Run")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: /Rerun/ }),
    ).not.toBeInTheDocument();
  });

  it("does not show a Rerun button when onNewRun is not provided", async () => {
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
            test_uuids: ["real-test-1"],
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
        taskId="task-norerun"
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("No Rerun Run")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: /Rerun/ }),
    ).not.toBeInTheDocument();
  });

  it("selects the Summary tab automatically when the run completes cleanly", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/run/task-summary")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-summary",
            status: "done",
            name: "Run One",
            results: [
              {
                test_uuid: "test-1",
                name: "Test One",
                status: "passed",
                passed: true,
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
        taskId="task-summary"
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("summary-panel")).toBeInTheDocument(),
    );
    expect(screen.getByText(/summary 1\/1/)).toBeInTheDocument();

    // Tab nav is visible once done; switching back to outputs works.
    await setupUser().click(screen.getByRole("button", { name: "Outputs" }));
    expect(screen.getByTestId("outputs-panel")).toBeInTheDocument();
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
              {
                test_uuid: "test-1",
                status: "failed",
                passed: false,
                error: "boom",
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
        taskId="task-err"
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Something went wrong")).toBeInTheDocument(),
    );
    // A failed run must not jump to the summary tab.
    expect(screen.queryByTestId("summary-panel")).not.toBeInTheDocument();
  });

  it("shows the overall error state when the run fails before any case ran", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/run/task-err-empty")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-err-empty",
            status: "failed",
            error: "boom",
            results: [],
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
        taskId="task-err-empty"
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("Something went wrong")).toBeInTheDocument(),
    );
  });

  it("keeps partial results visible when a run fails after some cases passed", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (url.endsWith("/agent-tests/run/task-partial")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-partial",
            status: "failed",
            error: "boom",
            results: [
              {
                test_uuid: "test-1",
                name: "Passed One",
                status: "passed",
                passed: true,
              },
              {
                test_uuid: "test-2",
                name: "Errored One",
                status: "failed",
                passed: false,
                error: "boom",
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
        taskId="task-partial"
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("outputs-panel")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
    expect(screen.getByText(/Passed One:passed/)).toBeInTheDocument();
    expect(screen.getByText(/Errored One:failed/)).toBeInTheDocument();
  });

  it("signs out on a 401 from the run fetch", async () => {
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
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        taskId="task-401"
      />,
    );

    await waitFor(() =>
      expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }),
    );
  });

  it("keeps rendering the shell when a poll fails with a non-ok response", async () => {
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
        taskId="task-bad"
      />,
    );

    await waitFor(() =>
      expect(screen.getByText("My Agent")).toBeInTheDocument(),
    );
  });

  it("handles a missing NEXT_PUBLIC_BACKEND_URL gracefully", async () => {
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
    render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        taskId="task-noenv"
      />,
    );
    expect(await screen.findByText("Test run")).toBeInTheDocument();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("survives the default-evaluator lookup failing", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.reject(new Error("network down"));
      }
      return Promise.resolve(
        jsonResponse({ task_id: "t", status: "in_progress", results: [] }),
      );
    });

    render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        taskId="t"
      />,
    );

    expect(await screen.findByText("My Agent")).toBeInTheDocument();
  });

  it("calls onClose when the close button is clicked", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      return Promise.resolve(
        jsonResponse({ task_id: "t", status: "in_progress", results: [] }),
      );
    });
    const onClose = jest.fn();
    const user = setupUser();
    render(
      <TestRunnerDialog
        isOpen
        onClose={onClose}
        agentUuid="agent-1"
        agentName="My Agent"
        taskId="t"
      />,
    );
    await user.click(await screen.findByRole("button", { name: "" }));
    expect(onClose).toHaveBeenCalledTimes(1);
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

    render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        taskId="task-select"
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("outputs-panel")).toBeInTheDocument(),
    );
    await setupUser().click(screen.getByText(/Test One:running/));
    expect(screen.getByTestId("selected-id")).toHaveTextContent("test-1");
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
          taskId="task-label"
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
});
