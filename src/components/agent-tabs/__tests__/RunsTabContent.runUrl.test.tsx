import React from "react";
import { render, screen, setupUser, waitFor } from "@/test-utils";
import { RunsTabContent } from "../RunsTabContent";

const BACKEND = "http://test-backend";
const AGENT_UUID = "agent-1";

// The real useDialogUrlParam is kept — this file is about the address bar.
jest.mock("../../../hooks", () => ({
  ...jest.requireActual("../../../hooks"),
  useAccessToken: () => "test-token",
}));

jest.mock("../../../lib/reportError", () => ({ reportError: jest.fn() }));

jest.mock("../../TestRunnerDialog", () => ({
  TestRunnerDialog: ({
    isOpen,
    taskId,
    onClose,
  }: {
    isOpen: boolean;
    taskId: string;
    onClose: () => void;
  }) =>
    isOpen ? (
      <div data-testid="test-runner">
        runner:{taskId}
        <button type="button" onClick={onClose}>
          Close runner
        </button>
      </div>
    ) : null,
}));
jest.mock("../../BenchmarkResultsDialog", () => ({
  BenchmarkResultsDialog: ({
    isOpen,
    taskId,
  }: {
    isOpen: boolean;
    taskId: string;
  }) => (isOpen ? <div data-testid="benchmark-results">bench:{taskId}</div> : null),
}));
jest.mock("../../BenchmarkRerunDialog", () => ({
  BenchmarkRerunDialog: () => null,
  useBenchmarkRerun: () => ({
    config: null,
    key: 0,
    start: jest.fn(),
    clear: jest.fn(),
  }),
}));

const pastRun = {
  uuid: "run-7",
  name: "",
  type: "llm-unit-test",
  status: "done",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  total_tests: 1,
  passed: 1,
  failed: 0,
};

const benchRun = {
  uuid: "run-bench",
  name: "",
  type: "llm-benchmark",
  status: "done",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  total_tests: 2,
  passed: null,
  failed: null,
  model_results: [{ model: "a" }],
};

function jsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data };
}

/** The runs the list endpoint answers with, and whether an `around` id it's
 * asked about is among them. */
let listedRuns: Array<typeof pastRun | typeof benchRun>;

beforeEach(() => {
  jest.clearAllMocks();
  window.history.replaceState(null, "", "/");
  process.env.NEXT_PUBLIC_BACKEND_URL = BACKEND;
  listedRuns = [pastRun];
  global.fetch = jest.fn(async (url: string) => {
    if (url.includes(`/agent-tests/agent/${AGENT_UUID}/runs`)) {
      const around = new URL(url).searchParams.get("around");
      if (around && !listedRuns.some((r) => r.uuid === around)) {
        return jsonResponse({}, false, 404);
      }
      return jsonResponse({ items: listedRuns, total: listedRuns.length, offset: 0 });
    }
    return jsonResponse({}, false, 404);
  }) as jest.Mock;
});

function runIdInUrl() {
  return new URLSearchParams(window.location.search).get("runId");
}

function renderTab() {
  return render(
    <RunsTabContent agentUuid={AGENT_UUID} agentName="Test agent" />,
  );
}

describe("RunsTabContent run deep-link", () => {
  it("puts the opened run in the address bar and takes it out on close", async () => {
    const user = setupUser();
    renderTab();

    // Desktop table and mobile cards both render, so take the first row.
    await user.click((await screen.findAllByText("Complete"))[0]);
    expect(await screen.findByTestId("test-runner")).toHaveTextContent(
      "runner:run-7",
    );
    expect(runIdInUrl()).toBe("run-7");

    await user.click(screen.getByRole("button", { name: "Close runner" }));
    expect(screen.queryByTestId("test-runner")).not.toBeInTheDocument();
    expect(runIdInUrl()).toBeNull();
  });

  it("re-opens the run dialog when the address already names a run", async () => {
    window.history.replaceState(null, "", "/?runId=run-7");
    renderTab();

    expect(await screen.findByTestId("test-runner")).toHaveTextContent(
      "runner:run-7",
    );
  });

  it("opens the model comparison dialog, not the run dialog, for a benchmark link", async () => {
    listedRuns = [pastRun, benchRun];
    window.history.replaceState(null, "", "/?runId=run-bench");
    renderTab();

    expect(await screen.findByTestId("benchmark-results")).toHaveTextContent(
      "bench:run-bench",
    );
    expect(screen.queryByTestId("test-runner")).not.toBeInTheDocument();
  });

  it("closes and forgets a run the agent does not have", async () => {
    window.history.replaceState(null, "", "/?runId=run-gone");
    renderTab();

    // Not among the results, so the backend says 404 for it and the window
    // never opens; the address stops naming it.
    await waitFor(() => expect(runIdInUrl()).toBeNull());
    expect(screen.queryByTestId("test-runner")).not.toBeInTheDocument();
    expect(screen.queryByTestId("benchmark-results")).not.toBeInTheDocument();
  });

  it("shows the error banner instead of guessing a dialog when the list can't be checked", async () => {
    global.fetch = jest.fn(async () => jsonResponse({}, false, 500)) as jest.Mock;
    window.history.replaceState(null, "", "/?runId=run-7");
    renderTab();

    expect(await screen.findByText(/Failed to load runs/)).toBeInTheDocument();
    expect(screen.queryByTestId("test-runner")).not.toBeInTheDocument();
    expect(screen.queryByTestId("benchmark-results")).not.toBeInTheDocument();
    // The link stays in the address so a retry (or reload) can pick it up.
    expect(runIdInUrl()).toBe("run-7");
  });
});
