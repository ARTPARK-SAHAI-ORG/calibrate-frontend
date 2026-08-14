import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import { TestsTabContent } from "../TestsTabContent";

const BACKEND = "http://test-backend";
const AGENT_UUID = "agent-1";

// The real useDialogUrlParam is kept — this file is about the address bar.
jest.mock("../../../hooks", () => ({
  ...jest.requireActual("../../../hooks"),
  useAccessToken: () => "test-token",
  useMaxRowsPerEval: () => 100,
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
jest.mock("../../BenchmarkDialog", () => ({ BenchmarkDialog: () => null }));
jest.mock("../../BenchmarkResultsDialog", () => ({
  BenchmarkResultsDialog: () => null,
}));
jest.mock("../../BulkUploadTestsModal", () => ({
  BulkUploadTestsModal: () => null,
}));
jest.mock("../CompareModelsButton", () => ({ CompareModelsButton: () => null }));
jest.mock("../../AddTestDialog", () => ({ AddTestDialog: () => null }));

jest.mock("../../../lib/evaluatorApi", () => ({
  fetchAgentEvaluators: jest.fn().mockResolvedValue([]),
  fetchAllEvaluators: jest.fn().mockResolvedValue([]),
  addEvaluatorsToAgent: jest.fn().mockResolvedValue(undefined),
}));

const pastRun = {
  uuid: "run-7",
  type: "llm-unit-test",
  status: "completed",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  total_tests: 1,
};

function jsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data };
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_BACKEND_URL = BACKEND;
  global.fetch = jest.fn(async (url: string) => {
    if (url.includes(`/agent-tests/agent/${AGENT_UUID}/runs`)) {
      return jsonResponse({ items: [pastRun], total: 1 });
    }
    if (url.includes(`/agent-tests/agent/${AGENT_UUID}/tests`)) {
      return jsonResponse({ items: [], total: 0 });
    }
    return jsonResponse({}, false, 404);
  }) as jest.Mock;
});

function runIdInUrl() {
  return new URLSearchParams(window.location.search).get("runId");
}

describe("TestsTabContent run deep-link", () => {
  it("puts the opened run in the address bar and takes it out on close", async () => {
    const user = setupUser();
    render(<TestsTabContent agentUuid={AGENT_UUID} />);

    await user.click(await screen.findByText("1 test"));
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
    render(<TestsTabContent agentUuid={AGENT_UUID} />);

    expect(await screen.findByTestId("test-runner")).toHaveTextContent(
      "runner:run-7",
    );
  });
});
