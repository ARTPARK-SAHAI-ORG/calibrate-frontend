import { render, screen, setupUser, waitFor } from "@/test-utils";
import { TestsTabContent } from "../TestsTabContent";

const BACKEND = "http://test-backend";
const AGENT_UUID = "agent-1";

jest.mock("../../../hooks", () => ({
  useAccessToken: () => "test-token",
  useMaxRowsPerEval: () => 100,
  useDialogUrlParam: () => ({ setParam: jest.fn() }),
}));
jest.mock("../../../lib/reportError", () => ({ reportError: jest.fn() }));

jest.mock("../../TestRunnerDialog", () => ({
  TestRunnerDialog: ({ isOpen, taskId }: { isOpen: boolean; taskId: string }) =>
    isOpen ? <div data-testid="test-runner">runner:{taskId}</div> : null,
}));
jest.mock("../../BenchmarkDialog", () => ({ BenchmarkDialog: () => null }));
jest.mock("../../BenchmarkResultsDialog", () => ({
  BenchmarkResultsDialog: () => null,
}));
jest.mock("../../BulkUploadTestsModal", () => ({
  BulkUploadTestsModal: () => null,
}));
jest.mock("../../AddTestDialog", () => ({ AddTestDialog: () => null }));
jest.mock("../CompareModelsButton", () => ({ CompareModelsButton: () => null }));

// The verify window is stubbed so the gate can be driven directly: a pass
// button fires onVerified, a settings button fires onGoToConnectionSettings.
jest.mock("../../VerifyConnectionDialog", () => ({
  VerifyConnectionDialog: ({
    isOpen,
    agentUuid,
    onVerified,
    onGoToConnectionSettings,
  }: {
    isOpen: boolean;
    agentUuid: string;
    onVerified: () => void;
    onGoToConnectionSettings: () => void;
  }) =>
    isOpen ? (
      <div data-testid="verify-dialog">
        verify:{agentUuid}
        <button type="button" onClick={onVerified}>
          pass-verify
        </button>
        <button type="button" onClick={onGoToConnectionSettings}>
          go-settings
        </button>
      </div>
    ) : null,
}));

jest.mock("../../../lib/evaluatorApi", () => ({
  fetchAgentEvaluators: jest.fn().mockResolvedValue([]),
  fetchAllEvaluators: jest.fn().mockResolvedValue([]),
  addEvaluatorsToAgent: jest.fn().mockResolvedValue(undefined),
}));

const agentTest = {
  uuid: "test-1",
  name: "Refund test",
  description: "",
  type: "response" as const,
  config: {
    history: [{ role: "user", content: "hi" }],
    evaluation: { type: "response" },
  },
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

function jsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data };
}

let runPosts = 0;
function setupFetch() {
  runPosts = 0;
  global.fetch = jest.fn(async (url: string, init?: RequestInit) => {
    if (url.includes(`/agent-tests/agent/${AGENT_UUID}/tests`)) {
      return jsonResponse({ items: [agentTest], total: 1 });
    }
    if (url.includes(`/agent-tests/agent/${AGENT_UUID}/runs`)) {
      return jsonResponse({ items: [], total: 0 });
    }
    if (
      init?.method === "POST" &&
      url.endsWith(`/agent-tests/agent/${AGENT_UUID}/run`)
    ) {
      runPosts += 1;
      return jsonResponse({ task_id: "task-99", status: "pending" });
    }
    return jsonResponse({}, false, 404);
  }) as jest.Mock;
}

beforeEach(() => {
  jest.clearAllMocks();
  process.env.NEXT_PUBLIC_BACKEND_URL = BACKEND;
  setupFetch();
});

function runAllButton() {
  return document.querySelector(
    '[data-tour="tests-run-all"]',
  ) as HTMLElement;
}

describe("TestsTabContent verify-before-run gate", () => {
  it("opens the verify window instead of starting a run for an unverified connection agent", async () => {
    const user = setupUser();
    render(
      <TestsTabContent
        agentUuid={AGENT_UUID}
        agentType="connection"
        connectionVerified={false}
      />,
    );

    await waitFor(() => expect(runAllButton()).toBeInTheDocument());
    await user.click(runAllButton());

    // No run was started; the window is shown instead.
    expect(runPosts).toBe(0);
    expect(screen.getByTestId("verify-dialog")).toHaveTextContent(
      "verify:agent-1",
    );
    expect(screen.queryByTestId("test-runner")).not.toBeInTheDocument();
  });

  it("starts the held run and tells the parent once the check passes", async () => {
    const onConnectionVerified = jest.fn();
    const user = setupUser();
    render(
      <TestsTabContent
        agentUuid={AGENT_UUID}
        agentType="connection"
        connectionVerified={false}
        onConnectionVerified={onConnectionVerified}
      />,
    );

    await waitFor(() => expect(runAllButton()).toBeInTheDocument());
    await user.click(runAllButton());
    await user.click(screen.getByRole("button", { name: "pass-verify" }));

    expect(onConnectionVerified).toHaveBeenCalledTimes(1);
    expect(await screen.findByTestId("test-runner")).toHaveTextContent(
      "runner:task-99",
    );
    expect(runPosts).toBe(1);
    expect(screen.queryByTestId("verify-dialog")).not.toBeInTheDocument();
  });

  it("routes to Connection settings from the verify window", async () => {
    const onGoToConnectionSettings = jest.fn();
    const user = setupUser();
    render(
      <TestsTabContent
        agentUuid={AGENT_UUID}
        agentType="connection"
        connectionVerified={false}
        onGoToConnectionSettings={onGoToConnectionSettings}
      />,
    );

    await waitFor(() => expect(runAllButton()).toBeInTheDocument());
    await user.click(runAllButton());
    await user.click(screen.getByRole("button", { name: "go-settings" }));

    expect(onGoToConnectionSettings).toHaveBeenCalledTimes(1);
    expect(runPosts).toBe(0);
    expect(screen.queryByTestId("verify-dialog")).not.toBeInTheDocument();
  });

  it("runs straight away for a verified connection agent (no window)", async () => {
    const user = setupUser();
    render(
      <TestsTabContent
        agentUuid={AGENT_UUID}
        agentType="connection"
        connectionVerified={true}
      />,
    );

    await waitFor(() => expect(runAllButton()).toBeInTheDocument());
    await user.click(runAllButton());

    expect(await screen.findByTestId("test-runner")).toHaveTextContent(
      "runner:task-99",
    );
    expect(runPosts).toBe(1);
    expect(screen.queryByTestId("verify-dialog")).not.toBeInTheDocument();
  });
});
