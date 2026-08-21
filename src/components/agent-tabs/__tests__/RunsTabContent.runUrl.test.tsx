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
  BenchmarkResultsDialog: () => null,
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

function jsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data };
}

beforeEach(() => {
  jest.clearAllMocks();
  window.history.replaceState(null, "", "/");
  process.env.NEXT_PUBLIC_BACKEND_URL = BACKEND;
  global.fetch = jest.fn(async (url: string) => {
    if (url.includes(`/agent-tests/agent/${AGENT_UUID}/runs`)) {
      return jsonResponse({ items: [pastRun], total: 1 });
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

  it("closes and forgets a run the agent does not have", async () => {
    window.history.replaceState(null, "", "/?runId=run-gone");
    renderTab();

    // The run is not on this page, so it is asked for directly. The backend
    // says there is no such run, so the window closes and the address stops
    // naming it.
    await waitFor(() => expect(runIdInUrl()).toBeNull());
    expect(screen.queryByTestId("test-runner")).not.toBeInTheDocument();
  });

  it("keeps the run open when asking about it fails", async () => {
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes(`/agent-tests/agent/${AGENT_UUID}/runs`)) {
        return jsonResponse({}, false, 500);
      }
      // A server problem, not a "no such run" answer.
      return jsonResponse({}, false, 500);
    });
    window.history.replaceState(null, "", "/?runId=run-7");
    renderTab();

    expect(await screen.findByTestId("test-runner")).toBeInTheDocument();
    await waitFor(() =>
      expect(
        (global.fetch as jest.Mock).mock.calls.some(([url]) =>
          String(url).includes(`/agent-tests/run/run-7`),
        ),
      ).toBe(true),
    );
    expect(screen.getByTestId("test-runner")).toBeInTheDocument();
    expect(runIdInUrl()).toBe("run-7");
  });
});
