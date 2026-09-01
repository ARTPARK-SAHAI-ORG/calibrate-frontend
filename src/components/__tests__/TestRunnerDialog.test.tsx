import { render, screen, setupUser, waitFor, act } from "@/test-utils";
import { toast } from "sonner";
import { TestRunnerDialog } from "../TestRunnerDialog";
import { clearTestRunCache } from "@/lib/testRunApi";

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
          <span data-testid={`inputs-${r.id}`}>
            {r.inputs ? JSON.stringify(r.inputs) : ""}
          </span>
          <span data-testid={`unanswered-${r.id}`}>{String(r.unanswered)}</span>
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
  TestRunSummary: ({
    passed,
    total,
    unanswered,
    stoppedEarly,
    stopped,
    onReviewUnanswered,
    ...props
  }: any) => (
    <div data-testid="summary-panel">
      summary {passed}/{total}
      <span data-testid="summary-gaps">
        {JSON.stringify({ unanswered, stoppedEarly })}
      </span>
      <span data-testid="summary-stopped">{String(stopped === true)}</span>
      <span data-testid="summary-evaluators">
        {JSON.stringify(props.evaluatorSummary ?? [])}
      </span>
      <button onClick={onReviewUnanswered}>review-unanswered</button>
    </div>
  ),
  LLMEvaluationAbout: (props: any) => (
    <div data-testid="about-panel">
      Test pass rate
      {JSON.stringify({
        showLatency: props.showLatency,
        showCost: props.showCost,
        showTokens: props.showTokens,
        showToolCalls: props.showToolCalls,
        evaluators: props.evaluators?.length ?? 0,
      })}
    </div>
  ),
  evaluatorSummaryToAbout: (entries: any) => entries ?? [],
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
  // Matches the real rule in that module: a next-reply test, a single agent
  // response test and a tool-call test can all be labelled; a whole
  // conversation cannot. The stub used to say the opposite for a tool call.
  isLabellingEligibleRaw: ({ test_case }: any) =>
    ["response", "general", "tool_call"].includes(
      test_case?.evaluation?.type,
    ),
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
    isRunDetail(String(url), taskId),
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

/** Click Stop and answer the question it asks. The second "Stop" is the one
 *  in the question. */
async function stopAndConfirm(user: ReturnType<typeof setupUser>) {
  await user.click(await screen.findByRole("button", { name: "Stop" }));
  await user.click(screen.getAllByRole("button", { name: "Stop" })[1]);
}

/** The run-detail request for `taskId`, whatever query it carries. The window
 * asks for the light version (`?mode=summary`), so an exact-URL match would
 * miss it. A per-case or rename/abort request under the same run is NOT this. */
function isRunDetail(url: string, taskId: string): boolean {
  return String(url).split("?")[0].endsWith(`/agent-tests/run/${taskId}`);
}

describe("TestRunnerDialog", () => {
  const originalBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = BACKEND_URL;
    localStorage.setItem("access_token", "test-token");
    (global.fetch as any) = jest.fn();
    // Several tests here reuse one task id with different runs behind it. The
    // window remembers finished runs, so without this a run from an earlier
    // test would be shown by a later one.
    clearTestRunCache();
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
      if (isRunDetail(url, "task-slow")) {
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

    // Loading: spinner shown, no outputs panel yet. Nothing is written at the
    // top of the window until the run itself has arrived: no run name, no
    // rename pencil, not even the agent's name.
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByTestId("outputs-panel")).not.toBeInTheDocument();
    expect(screen.queryByText("Evaluation run")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Rename" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("My Agent")).not.toBeInTheDocument();
    expect(container.querySelector(".animate-ping")).not.toBeInTheDocument();

    await act(async () => {
      resolveRun(
        jsonResponse({
          task_id: "task-slow",
          status: "completed",
          results: [
            {
              test_case_id: "test-1",
              name: "Test One",
              passed: true,
            },
          ],
        }),
      );
    });

    await waitFor(() =>
      expect(screen.getByText("Evaluation run")).toBeInTheDocument(),
    );
    expect(screen.getByRole("button", { name: "Rename" })).toBeInTheDocument();
    expect(screen.getByText("My Agent")).toBeInTheDocument();
    expect(container.querySelector(".animate-spin")).not.toBeInTheDocument();
    await setupUser().click(screen.getByRole("button", { name: "Results" }));
    expect(screen.getByText(/Test One:passed/)).toBeInTheDocument();
  });

  it("passes each result's effective inputs through to the outputs panel", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (isRunDetail(url, "task-inputs")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-inputs",
            status: "in_progress",
            results: [
              {
                test_case_id: "t-1",
                name: "basic",
                passed: true,
                inputs: { condition_area: "anc", trimester: 1 },
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
        taskId="task-inputs"
      />,
    );

    await waitFor(() =>
      expect(screen.getByTestId("inputs-t-1")).toHaveTextContent(
        '{"condition_area":"anc","trimester":1}',
      ),
    );
  });

  it("renders server values: name fallbacks and pass/fail/running from `passed`", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (isRunDetail(url, "task-rows")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-rows",
            status: "in_progress",
            results: [
              // `name` wins.
              {
                test_case_id: "t-1",
                name: "From name",
                test_name: "ignored",
                passed: true,
              },
              // Falls back to test_case.name.
              {
                test_case_id: "t-2",
                test_case: { name: "From test_case" },
                passed: false,
              },
              // Falls back to test_name.
              { test_case_id: "t-3", test_name: "From test_name", passed: false },
              // passed: null → still running, NOT failed.
              { test_case_id: "t-4", name: "Still Running", passed: null },
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
      if (isRunDetail(url, "task-legacy-rows")) {
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
      expect(screen.getByRole("button", { name: "Results" })).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: "Results" }));

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
      if (isRunDetail(url, "task-tick")) {
        pollCount += 1;
        if (pollCount === 1) {
          return Promise.resolve(
            jsonResponse({
              task_id: "task-tick",
              status: "in_progress",
              results: [{ test_case_id: "t-1", name: "Test One", passed: null }],
            }),
          );
        }
        if (pollCount === 2) {
          return Promise.resolve(
            jsonResponse({
              task_id: "task-tick",
              status: "in_progress",
              results: [
                { test_case_id: "t-1", name: "Test One", passed: true },
                { test_case_id: "t-2", name: "Test Two", passed: null },
              ],
            }),
          );
        }
        return Promise.resolve(
          jsonResponse({
            task_id: "task-tick",
            status: "done",
            results: [
              { test_case_id: "t-1", name: "Test One", passed: true },
              { test_case_id: "t-2", name: "Test Two", passed: false },
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
      if (isRunDetail(url, "task-open")) {
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
      if (isRunDetail(url, "task-rerun")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-rerun",
            status: "completed",
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
  it("never starts a run on its own, from a re-render or from a poll tick", async () => {
    // Fake timers so advancing time actually fires the poll interval, which is
    // the second way a run could be started without a click.
    jest.useFakeTimers();
    // The run never reaches a terminal status, so the poll interval keeps
    // firing for as long as the dialog is open.
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (isRunDetail(url, "task-idle")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-idle",
            status: "in_progress",
            test_uuids: ["real-test-1"],
            results: [{ name: "Real Test 1", passed: null }],
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
    await flush();
    expect(screen.getByText("Evaluation run")).toBeInTheDocument();

    // Re-render repeatedly with fresh inline callback identities, which is what
    // a parent doing setState on every optimistic row update looks like.
    for (let i = 0; i < 20; i++) {
      rerender(
        <TestRunnerDialog {...props} onClose={() => {}} onNewRun={() => {}} />,
      );
    }
    // Then let the poll interval fire several times.
    await flush(POLL_MS * 5);

    // The timer kept polling (reads), proving the interval was live and this
    // test actually exercised the poll path.
    expect(runFetchCount("task-idle")).toBeGreaterThan(1);
    // But nothing ever started a run: no POST, no onNewRun.
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
      if (isRunDetail(url, "task-rerun-fail")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-rerun-fail",
            status: "completed",
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
    expect(screen.getByText("Evaluation run")).toBeInTheDocument();
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
      if (isRunDetail(url, "task-legacy")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-legacy",
            status: "completed",
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
      expect(screen.getByText("Evaluation run")).toBeInTheDocument(),
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
      if (isRunDetail(url, "task-norerun")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-norerun",
            status: "completed",
            test_uuids: ["real-test-1"],
            results: [
              {
                test_case_id: "real-test-1",
                name: "Real Test",
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
      expect(screen.getByText("Evaluation run")).toBeInTheDocument(),
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
      if (isRunDetail(url, "task-summary")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-summary",
            status: "done",
            results: [
              {
                test_case_id: "test-1",
                name: "Test One",
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

    // Tab nav is visible once done; switch back to outputs.
    const user = setupUser();
    await user.click(screen.getByRole("button", { name: "Results" }));
    expect(screen.getByTestId("outputs-panel")).toBeInTheDocument();

    // The About tab explains the metrics (always documents pass rate).
    await user.click(screen.getByRole("button", { name: "About" }));
    expect(screen.getByTestId("about-panel")).toHaveTextContent(
      "Test pass rate",
    );
  });

  it("shows a failed run's rows and tabs rather than a bare error card", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (isRunDetail(url, "task-err")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-err",
            status: "failed",
            error: true,
            unanswered_tests: 1,
            stopped_early: true,
            results: [
              {
                test_case_id: "test-1",
                name: "Broken test",
                passed: false,
                unanswered: true,
                reasoning: "Agent returned HTTP 500",
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

    // Every row carries its own reason, so hiding them behind one error card
    // told the reader nothing. The summary is also the only place that says
    // the run stopped before it started every test.
    await waitFor(() =>
      expect(screen.getByTestId("outputs-panel")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
    // A failed run still must not jump to the summary tab on its own.
    expect(screen.queryByTestId("summary-panel")).not.toBeInTheDocument();
    await setupUser().click(screen.getByRole("button", { name: "Summary" }));
    expect(screen.getByTestId("summary-gaps")).toHaveTextContent(
      JSON.stringify({ unanswered: 1, stoppedEarly: true }),
    );
  });

  it("shows the overall error state when the run fails before any case ran", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (isRunDetail(url, "task-err-empty")) {
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
      if (isRunDetail(url, "task-partial")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-partial",
            status: "failed",
            error: "boom",
            results: [
              {
                test_case_id: "test-1",
                name: "Passed One",
                passed: true,
              },
              {
                test_case_id: "test-2",
                name: "Errored One",
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
      if (isRunDetail(url, "task-401")) {
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

  it("says something went wrong when the run cannot be read at all", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (isRunDetail(url, "task-bad")) {
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
      expect(screen.getByText("Something went wrong")).toBeInTheDocument(),
    );
    // Nothing pretends the run arrived: no name, no pencil, no agent name.
    expect(screen.queryByText("Evaluation run")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Rename" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("My Agent")).not.toBeInTheDocument();
  });

  it("goes back to loading when the window is pointed at another run after a failure", async () => {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (isRunDetail(url, "task-broken")) {
        return Promise.resolve(jsonResponse({}, false, 500));
      }
      if (isRunDetail(url, "task-next")) {
        return new Promise(() => {});
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });

    const { container, rerender } = render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        taskId="task-broken"
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("Something went wrong")).toBeInTheDocument(),
    );

    rerender(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        taskId="task-next"
      />,
    );
    // The previous run's failure does not carry over onto the new one.
    await waitFor(() =>
      expect(container.querySelector(".animate-spin")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });

  it("keeps the run on screen when a later poll fails", async () => {
    let calls = 0;
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (isRunDetail(url, "task-flaky")) {
        calls += 1;
        if (calls === 1) {
          return Promise.resolve(
            jsonResponse({
              task_id: "task-flaky",
              status: "in_progress",
              name: "Run 4",
              results: [
                { test_case_id: "t-1", name: "Test One", passed: true },
              ],
            }),
          );
        }
        return Promise.resolve(jsonResponse({}, false, 500));
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
        taskId="task-flaky"
      />,
    );
    await flush();
    expect(screen.getByText("Evaluation run 4")).toBeInTheDocument();

    // The next read fails. The run already on screen stays put.
    await flush(POLL_MS);
    expect(screen.getByText("Evaluation run 4")).toBeInTheDocument();
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument();
  });

  it("handles a missing NEXT_PUBLIC_BACKEND_URL gracefully", async () => {
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
    const { container } = render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        taskId="task-noenv"
      />,
    );
    // Nothing is fetched, so the run never arrives and the window stays on its
    // loading state, with nothing written at the top of it.
    await waitFor(() =>
      expect(container.querySelector(".animate-spin")).toBeInTheDocument(),
    );
    expect(screen.queryByText("Evaluation run")).not.toBeInTheDocument();
    expect(screen.queryByText("My Agent")).not.toBeInTheDocument();
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
      if (isRunDetail(url, "task-select")) {
        return Promise.resolve(
          jsonResponse({
            task_id: "task-select",
            status: "in_progress",
            results: [
              {
                test_case_id: "test-1",
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
        if (isRunDetail(url, "task-label")) {
          return Promise.resolve(
            jsonResponse({
              task_id: "task-label",
              status: "completed",
              results: [
                {
                  test_case_id: "test-1",
                  name: "Test One",
                  passed: true,
                  test_case: { evaluation: { type: "response" } },
                },
                {
                  test_case_id: "test-2",
                  name: "Tool Test",
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
      // Wait for the finished run's tabs, not the heading: the heading is the
      // same words for every run, so it is on screen before the results land.
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Results" })).toBeInTheDocument(),
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

    it("hides the button and the row checkboxes when nothing in the run can be labelled", async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes("/evaluators?include_defaults=true")) {
          return Promise.resolve(jsonResponse([]));
        }
        if (isRunDetail(url, "task-toolonly")) {
          return Promise.resolve(
            jsonResponse({
              task_id: "task-toolonly",
              status: "completed",
              results: [
                {
                  test_case_id: "test-2",
                  name: "Conversation Test",
                  passed: true,
                  test_type: "conversation",
                  test_case: { evaluation: { type: "conversation" } },
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
          taskId="task-toolonly"
        />,
      );
      await waitFor(() =>
        expect(screen.getByRole("button", { name: "Results" })).toBeInTheDocument(),
      );
      expect(
        screen.queryByRole("button", { name: "Submit for labelling" }),
      ).not.toBeInTheDocument();
      await setupUser().click(screen.getByRole("button", { name: "Results" }));
      expect(
        screen.queryByRole("button", { name: "toggle-labelling-test-2" }),
      ).not.toBeInTheDocument();
    });

    it("opens the labelling dialog when an eligible test is selected, and closes it again", async () => {
      await renderDoneRun();
      const user = setupUser();
      await user.click(screen.getByRole("button", { name: "Results" }));
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

describe("tests that produced no answer", () => {
  const originalBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = BACKEND_URL;
    localStorage.setItem("access_token", "test-token");
    (global.fetch as any) = jest.fn();
    // Several tests here reuse one task id with different runs behind it. The
    // window remembers finished runs, so without this a run from an earlier
    // test would be shown by a later one.
    clearTestRunCache();
  });

  afterEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    process.env.NEXT_PUBLIC_BACKEND_URL = originalBackendUrl;
  });

  function mockRun(payload: Record<string, unknown>) {
    (global.fetch as jest.Mock).mockImplementation((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (isRunDetail(url, "task-gaps")) {
        return Promise.resolve(
          jsonResponse({ task_id: "task-gaps", status: "done", ...payload }),
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
        taskId="task-gaps"
      />,
    );
  }

  it("passes the run's own gap counts to the summary", async () => {
    mockRun({
      unanswered_tests: 2,
      stopped_early: true,
      results: [{ test_case_id: "t-1", name: "Test One", passed: true }],
    });
    expect(await screen.findByTestId("summary-gaps")).toHaveTextContent(
      JSON.stringify({ unanswered: 2, stoppedEarly: true }),
    );
  });

  it("keeps a test that produced no answer out of the failed count", async () => {
    // Both rows come back as `passed: false`; only the flag separates them, so
    // the pass rate is 1 of 2, not 1 of 3.
    mockRun({
      results: [
        { test_case_id: "t-1", name: "Passed", passed: true },
        { test_case_id: "t-2", name: "Wrong", passed: false },
        {
          test_case_id: "t-3",
          name: "Never answered",
          passed: false,
          unanswered: true,
          reasoning: "Agent returned HTTP 500",
        },
      ],
    });
    expect(await screen.findByTestId("summary-panel")).toHaveTextContent(
      "summary 1/2",
    );
  });

  it("opens the results tab from the summary's link", async () => {
    mockRun({
      unanswered_tests: 1,
      results: [
        {
          test_case_id: "t-3",
          name: "Never answered",
          passed: false,
          unanswered: true,
          reasoning: "Agent returned HTTP 500",
        },
      ],
    });
    // The run lands on Summary when it finishes; the link is what takes the
    // reader to the tests themselves.
    await screen.findByTestId("summary-panel");
    await setupUser().click(screen.getByText("review-unanswered"));
    expect(screen.getByTestId("outputs-panel")).toBeInTheDocument();
  });

  it("marks the row as one that produced no answer for the outputs panel", async () => {
    mockRun({
      results: [
        {
          test_case_id: "t-3",
          name: "Never answered",
          passed: false,
          unanswered: true,
          reasoning: "Agent returned HTTP 500",
        },
      ],
    });
    await screen.findByRole("button", { name: "Results" });
    await setupUser().click(screen.getByRole("button", { name: "Results" }));
    expect(screen.getByTestId("unanswered-t-3")).toHaveTextContent("true");
  });

  describe("stopping a run", () => {
    /** A run still going, then the same run once it has been stopped. */
    function mockRunThenStop() {
      let stopped = false;
      (global.fetch as jest.Mock).mockImplementation(
        (url: string, init?: any) => {
          if (url.includes("/evaluators?include_defaults=true")) {
            return Promise.resolve(jsonResponse([]));
          }
          if (url.endsWith("/agent-tests/run/task-stop/abort")) {
            expect(init?.method).toBe("POST");
            stopped = true;
            return Promise.resolve(
              jsonResponse({
                task_id: "task-stop",
                status: "done",
                aborted: true,
                total_tests: 2,
                passed: 1,
                results: [
                  { test_case_id: "t-1", name: "Test One", passed: true },
                ],
              }),
            );
          }
          if (isRunDetail(url, "task-stop")) {
            return Promise.resolve(
              jsonResponse({
                task_id: "task-stop",
                status: stopped ? "done" : "in_progress",
                aborted: stopped || undefined,
                results: [
                  { test_case_id: "t-1", name: "Test One", passed: true },
                  { test_case_id: "t-2", name: "Test Two", passed: null },
                ],
              }),
            );
          }
          return Promise.reject(new Error(`Unexpected fetch ${url}`));
        },
      );
    }

    function renderDialog() {
      return render(
        <TestRunnerDialog
          isOpen
          onClose={jest.fn()}
          agentUuid="agent-1"
          agentName="My Agent"
          taskId="task-stop"
        />,
      );
    }

    it("offers Stop only while the run is still going", async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes("/evaluators?include_defaults=true")) {
          return Promise.resolve(jsonResponse([]));
        }
        return Promise.resolve(
          jsonResponse({
            task_id: "task-stop",
            status: "done",
            results: [{ test_case_id: "t-1", name: "Test One", passed: true }],
          }),
        );
      });

      renderDialog();

      await waitFor(() =>
        expect(screen.getByTestId("summary-panel")).toBeInTheDocument(),
      );
      expect(
        screen.queryByRole("button", { name: "Stop" }),
      ).not.toBeInTheDocument();
    });

    it("says it cannot stop the run when the backend address is missing", async () => {
      mockRunThenStop();
      const user = setupUser();
      renderDialog();
      await screen.findByRole("button", { name: "Stop" });

      delete process.env.NEXT_PUBLIC_BACKEND_URL;
      await stopAndConfirm(user);

      expect(toast.error).toHaveBeenCalledWith(
        "Cannot stop the run: the backend URL is not configured.",
      );
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url]) =>
          String(url).includes("/abort"),
        ),
      ).toBe(false);
    });

    it("keeps the window as it was when the run cannot be read back", async () => {
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes("/evaluators?include_defaults=true")) {
          return Promise.resolve(jsonResponse([]));
        }
        if (url.endsWith("/agent-tests/run/task-stop/abort")) {
          return Promise.resolve(jsonResponse({ task_id: "task-stop" }));
        }
        if (isRunDetail(url, "task-stop")) {
          // The first read lands, the read after the stop does not.
          return (global.fetch as jest.Mock).mock.calls.filter(([u]) =>
            String(u).endsWith("/agent-tests/run/task-stop"),
          ).length > 1
            ? Promise.resolve(jsonResponse({}, false, 500))
            : Promise.resolve(
                jsonResponse({
                  task_id: "task-stop",
                  status: "in_progress",
                  results: [
                    { test_case_id: "t-1", name: "Test One", passed: true },
                  ],
                }),
              );
        }
        return Promise.reject(new Error(`Unexpected fetch ${url}`));
      });

      const user = setupUser();
      renderDialog();
      await stopAndConfirm(user);

      // The run it already had is still on screen, and nothing crashed.
      expect(await screen.findByText(/Test One:passed/)).toBeInTheDocument();
    });

    it("stops the run and says so in the summary", async () => {
      mockRunThenStop();
      const user = setupUser();
      renderDialog();

      await stopAndConfirm(user);

      await waitFor(() =>
        expect(
          (global.fetch as jest.Mock).mock.calls.some(([url]) =>
            String(url).endsWith("/agent-tests/run/task-stop/abort"),
          ),
        ).toBe(true),
      );

      // The test that never started is named as not run, not left spinning.
      expect(await screen.findByText(/Test Two:not_run/)).toBeInTheDocument();

      // The run is finished now, so the tabs are there to read it.
      await user.click(await screen.findByRole("button", { name: "Summary" }));
      expect(screen.getByTestId("summary-stopped")).toHaveTextContent("true");
      expect(
        screen.queryByRole("button", { name: "Stop" }),
      ).not.toBeInTheDocument();
    });
  });
  describe("naming the run", () => {
    function mockRun(name: string | null) {
      (global.fetch as jest.Mock).mockImplementation(
        (url: string, init?: any) => {
          if (url.includes("/evaluators?include_defaults=true")) {
            return Promise.resolve(jsonResponse([]));
          }
          if (url.endsWith("/agent-tests/run/task-name/name")) {
            return Promise.resolve(
              jsonResponse({
                task_id: "task-name",
                name: JSON.parse(init.body).name,
              }),
            );
          }
          if (isRunDetail(url, "task-name")) {
            return Promise.resolve(
              jsonResponse({
                task_id: "task-name",
                status: "completed",
                name,
                results: [
                  { test_case_id: "test-1", name: "Test One", passed: true },
                ],
              }),
            );
          }
          return Promise.reject(new Error(`Unexpected fetch ${url}`));
        },
      );
    }

    it("shows the run's own name", async () => {
      mockRun("Run 4");
      render(
        <TestRunnerDialog
          isOpen
          onClose={jest.fn()}
          agentUuid="agent-1"
          agentName="My Agent"
          taskId="task-name"
        />,
      );

      expect(await screen.findByText("Evaluation run 4")).toBeInTheDocument();
    });

    it("puts a new name on screen and tells the parent about it", async () => {
      mockRun("Run 4");
      const onRenamed = jest.fn();
      const user = setupUser();
      render(
        <TestRunnerDialog
          isOpen
          onClose={jest.fn()}
          agentUuid="agent-1"
          agentName="My Agent"
          taskId="task-name"
          onRenamed={onRenamed}
        />,
      );

      await user.click(await screen.findByRole("button", { name: "Rename" }));
      await user.clear(screen.getByLabelText("Name"));
      await user.type(
        screen.getByLabelText("Name"),
        "Regression before v2{Enter}",
      );

      expect(
        await screen.findByText("Regression before v2"),
      ).toBeInTheDocument();
      expect(onRenamed).toHaveBeenCalledWith("Regression before v2");
    });
  });
});

// The window reads a run without each test's conversation, reply and verdicts,
// and asks for the one test someone opens. A run of nearly two thousand tests
// was 4.64 MB read this way and 0.86 MB read the light way.
describe("reading a run light, and one test in full", () => {
  const originalBackendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

  const lightRun = {
    task_id: "task-light",
    status: "completed",
    total_tests: 2,
    passed: 2,
    failed: 0,
    results: [
      {
        test_case_id: "test-1",
        name: "First test",
        passed: true,
        test_type: "response",
      },
      {
        test_case_id: "test-2",
        name: "Second test",
        passed: true,
        test_type: "response",
      },
    ],
    evaluator_summary: [
      {
        metric_key: "correctness",
        name: "Correctness",
        type: "binary",
        evaluator_uuid: "eval-1",
        passed: 2,
        total: 2,
        pass_rate: 100,
      },
    ],
  };

  const fullCase = {
    test_case_id: "test-1",
    name: "First test",
    passed: true,
    test_type: "response",
    inputs: { city: "Bengaluru" },
    output: { response: "The full reply" },
    test_case: { evaluation: { type: "response" } },
    judge_results: [{ evaluator_uuid: "eval-1", match: true }],
  };

  /** Every request the window made for one test's own result. */
  const caseCalls = () =>
    (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
      String(url).includes("/agent-tests/run/task-light/results/"),
    );

  beforeEach(() => {
    process.env.NEXT_PUBLIC_BACKEND_URL = BACKEND_URL;
    localStorage.setItem("access_token", "test-token");
    (global.fetch as any) = jest.fn((url: string) => {
      if (url.includes("/evaluators?include_defaults=true")) {
        return Promise.resolve(jsonResponse([]));
      }
      if (String(url).includes("/agent-tests/run/task-light/results/test-1")) {
        return Promise.resolve(jsonResponse(fullCase));
      }
      if (String(url).includes("/agent-tests/run/task-light/results/test-2")) {
        return Promise.resolve(
          jsonResponse({ ...fullCase, test_case_id: "test-2", name: "Second test" }),
        );
      }
      if (isRunDetail(url, "task-light")) {
        return Promise.resolve(jsonResponse(lightRun));
      }
      return Promise.reject(new Error(`Unexpected fetch ${url}`));
    });
    clearTestRunCache();
  });

  afterEach(() => {
    localStorage.clear();
    jest.clearAllMocks();
    jest.useRealTimers();
    process.env.NEXT_PUBLIC_BACKEND_URL = originalBackendUrl;
  });

  const open = () =>
    render(
      <TestRunnerDialog
        isOpen
        onClose={jest.fn()}
        agentUuid="agent-1"
        agentName="My Agent"
        taskId="task-light"
      />,
    );

  /** Open the window and go to the list of tests. A finished run lands on the
   * Summary tab, so the list is one click away. */
  const openOnResults = async (user: ReturnType<typeof setupUser>) => {
    open();
    await screen.findByTestId("summary-panel");
    await user.click(screen.getByRole("button", { name: "Results" }));
    await screen.findByTestId("outputs-panel");
  };

  it("asks for the run without every test's detail", async () => {
    open();
    await screen.findByTestId("summary-panel");
    const runUrls = (global.fetch as jest.Mock).mock.calls
      .map(([url]) => String(url))
      .filter((url) => isRunDetail(url, "task-light"));
    expect(runUrls.length).toBeGreaterThan(0);
    for (const url of runUrls) expect(url).toContain("mode=summary");
  });

  it("reads one test in full, not all of them", async () => {
    const user = setupUser();
    await openOnResults(user);

    // The window opens the first finished test on its own, so exactly that one
    // test is read in full. The second is not touched until someone opens it.
    await waitFor(() =>
      expect(screen.getByTestId("inputs-test-1")).toHaveTextContent(
        "Bengaluru",
      ),
    );
    expect(caseCalls()).toHaveLength(1);
    expect(String(caseCalls()[0][0])).toContain(
      "/agent-tests/run/task-light/results/test-1",
    );
    expect(screen.getByTestId("inputs-test-2")).toHaveTextContent("");

    await user.click(screen.getByText("Second test:passed"));
    await waitFor(() => expect(caseCalls()).toHaveLength(2));
    expect(String(caseCalls()[1][0])).toContain("results/test-2");
  });

  it("does not ask for the same test twice", async () => {
    const user = setupUser();
    await openOnResults(user);
    await user.click(screen.getByText("First test:passed"));
    await waitFor(() => expect(caseCalls()).toHaveLength(1));
    await user.click(screen.getByText("Second test:passed"));
    await user.click(screen.getByText("First test:passed"));
    await waitFor(() =>
      expect(screen.getByTestId("inputs-test-1")).toHaveTextContent(
        "Bengaluru",
      ),
    );
    expect(
      caseCalls().filter(([url]) => String(url).includes("test-1")),
    ).toHaveLength(1);
  });

  it("takes the per-evaluator totals from the run rather than counting them here", async () => {
    open();
    await screen.findByTestId("summary-panel");
    const shown = JSON.parse(
      screen.getByTestId("summary-evaluators").textContent || "[]",
    );
    expect(shown).toHaveLength(1);
    expect(shown[0].name).toBe("Correctness");
    // Straight from the backend: the cards draw a percentage out of 100 and
    // nothing here rescales it.
    expect(shown[0].pass_rate).toBe(100);
  });

  it("reads every test in full only when the results are exported", async () => {
    const user = setupUser();
    open();
    await screen.findByTestId("summary-panel");
    const fullReads = () =>
      (global.fetch as jest.Mock).mock.calls.filter(
        ([url]) =>
          isRunDetail(String(url), "task-light") &&
          !String(url).includes("mode=summary"),
      );
    expect(fullReads()).toHaveLength(0);

    await user.click(screen.getByRole("button", { name: "Export" }));
    await waitFor(() => expect(fullReads()).toHaveLength(1));
  });
});
