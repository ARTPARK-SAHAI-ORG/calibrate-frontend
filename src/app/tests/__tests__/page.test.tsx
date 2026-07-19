/**
 * Run-start behaviour for the /tests page.
 *
 * The page (not TestRunnerDialog) starts an agent test run: it calls
 * startAgentTestRun on the click, then hands the returned run uuid to the
 * dialog, which is display only: it renders from what the server returns for
 * that uuid, so the page passes it no test list. These tests pin that contract:
 * exactly one start call per click, the dialog opens immediately on the click
 * and then takes the returned uuid, rerun starts a fresh run, and a failed
 * start closes the dialog again, surfacing a toast rather than tearing down the
 * tests list.
 */
import React from "react";
import { render, screen, waitFor, setupUser } from "@/test-utils";
import { toast } from "sonner";
import TestsPage from "../page";
import { startAgentTestRun } from "../../../lib/agentTestRun";

jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

const mockToastError = toast.error as jest.MockedFunction<typeof toast.error>;

// The page chrome isn't under test — render children straight through.
jest.mock("../../../components/AppLayout", () => ({
  AppLayout: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useHideFloatingButton: () => {},
}));

// Mocked at the leaf module, not the "hooks" barrel: the page reads the token
// through the barrel, but useStartTestRun imports this module directly, so both
// have to see the same token.
jest.mock("../../../hooks/useAccessToken", () => ({
  useAccessToken: () => "test-token",
  useAuth: () => ({ accessToken: "test-token", isAuthenticated: true }),
}));

// Jest mocks are keyed by resolved path, and the "@/" alias does not resolve
// inside jest.mock here, so the relative path is used on both sides.
jest.mock("../../../lib/agentTestRun", () => ({
  startAgentTestRun: jest.fn(),
}));

const mockStartAgentTestRun = startAgentTestRun as jest.MockedFunction<
  typeof startAgentTestRun
>;

// Agent-picker dialog: a single button that answers with a chosen agent, which
// is all handleRunTest needs.
jest.mock("../../../components/RunTestDialog", () => ({
  RunTestDialog: ({
    isOpen,
    onRunTest,
  }: {
    isOpen: boolean;
    onRunTest: (
      agentUuid: string,
      agentName: string,
      attachToAgent: boolean,
    ) => void;
  }) =>
    isOpen ? (
      <button onClick={() => onRunTest("agent-1", "Agent One", false)}>
        pick-agent
      </button>
    ) : null,
}));

// Pulls in jspdf (untranspiled ESM) and plays no part in starting a run.
jest.mock("../../../components/BulkUploadTestsModal", () => ({
  BulkUploadTestsModal: () => null,
}));

// Runner dialog stub: records the props it is opened with and exposes a rerun
// trigger so the page's rerun path can be driven.
type RunnerProps = {
  isOpen: boolean;
  taskId?: string;
  onRerun?: (tests: { uuid: string; name: string }[]) => void;
};
let runnerOpenLog: RunnerProps[] = [];

jest.mock("../../../components/TestRunnerDialog", () => ({
  TestRunnerDialog: (props: RunnerProps) => {
    if (props.isOpen) runnerOpenLog.push(props);
    return props.isOpen ? (
      <div>
        <span data-testid="runner-task-id">{props.taskId ?? "none"}</span>
        <button
          onClick={() =>
            props.onRerun?.([{ uuid: "test-9", name: "Rerun only test" }])
          }
        >
          mock-rerun
        </button>
      </div>
    ) : null;
  },
}));

const TESTS = [
  {
    uuid: "test-1",
    name: "First test",
    description: "",
    type: "response",
    config: {},
    created_at: "2026-07-15 10:00:00",
    updated_at: "2026-07-15 10:00:00",
  },
];

const originalFetch = global.fetch;

beforeEach(() => {
  process.env.NEXT_PUBLIC_BACKEND_URL = "http://localhost:8000";
  runnerOpenLog = [];
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({
      items: TESTS,
      total: TESTS.length,
      limit: null,
      offset: 0,
    }),
  }) as unknown as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
  jest.clearAllMocks();
});

/** Row play button → agent picker → run. Leaves the runner dialog open. */
async function runFirstTest(user: ReturnType<typeof setupUser>) {
  await user.click(await screen.findByLabelText("Run this test"));
  await user.click(await screen.findByText("pick-agent"));
}

describe("/tests run start", () => {
  it("starts exactly one run and opens the dialog on the returned uuid", async () => {
    mockStartAgentTestRun.mockResolvedValue("run-abc");
    const user = setupUser();

    render(<TestsPage />);
    await runFirstTest(user);

    await waitFor(() =>
      expect(screen.getByTestId("runner-task-id")).toHaveTextContent("run-abc"),
    );
    expect(mockStartAgentTestRun).toHaveBeenCalledTimes(1);
    expect(mockStartAgentTestRun).toHaveBeenCalledWith({
      agentUuid: "agent-1",
      testUuids: ["test-1"],
      // This page never runs the agent's whole linked set, it always names the
      // tests to run.
      runAllLinked: undefined,
      accessToken: "test-token",
    });
  });

  it("opens the runner immediately, before the start request answers", async () => {
    let resolveStart: (taskId: string) => void = () => {};
    mockStartAgentTestRun.mockReturnValue(
      new Promise<string>((resolve) => {
        resolveStart = resolve;
      }),
    );
    const user = setupUser();

    render(<TestsPage />);
    await runFirstTest(user);

    // Still in flight: the runner is already on screen, with no run uuid yet.
    await waitFor(() =>
      expect(screen.getByTestId("runner-task-id")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("runner-task-id")).toHaveTextContent("none");

    resolveStart("run-abc");
    await waitFor(() =>
      expect(screen.getByTestId("runner-task-id")).toHaveTextContent("run-abc"),
    );
  });

  it("closes the runner again when the start fails", async () => {
    mockStartAgentTestRun.mockRejectedValue(new Error("nope"));
    const user = setupUser();

    render(<TestsPage />);
    await runFirstTest(user);

    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("nope"));
    // No empty window left spinning, and the list is untouched.
    expect(screen.queryByTestId("runner-task-id")).not.toBeInTheDocument();
    expect(screen.getAllByText("First test").length).toBeGreaterThan(0);
  });

  it("does not re-fire the start call on later re-renders", async () => {
    mockStartAgentTestRun.mockResolvedValue("run-abc");
    const user = setupUser();

    render(<TestsPage />);
    await runFirstTest(user);

    await waitFor(() =>
      expect(screen.getByTestId("runner-task-id")).toHaveTextContent("run-abc"),
    );
    // The dialog may render repeatedly, but only one run was ever started.
    expect(runnerOpenLog.length).toBeGreaterThan(0);
    expect(mockStartAgentTestRun).toHaveBeenCalledTimes(1);
  });

  it("starts a fresh run on rerun and shows the new uuid", async () => {
    mockStartAgentTestRun.mockResolvedValue("run-abc");
    const user = setupUser();

    render(<TestsPage />);
    await runFirstTest(user);
    await waitFor(() =>
      expect(screen.getByTestId("runner-task-id")).toHaveTextContent("run-abc"),
    );

    mockStartAgentTestRun.mockResolvedValue("run-xyz");
    await user.click(screen.getByText("mock-rerun"));

    await waitFor(() =>
      expect(screen.getByTestId("runner-task-id")).toHaveTextContent("run-xyz"),
    );
    expect(mockStartAgentTestRun).toHaveBeenCalledTimes(2);
    expect(mockStartAgentTestRun).toHaveBeenLastCalledWith({
      agentUuid: "agent-1",
      testUuids: ["test-9"],
      runAllLinked: undefined,
      accessToken: "test-token",
    });
  });

  it("toasts a failed start and leaves the tests list intact", async () => {
    mockStartAgentTestRun.mockRejectedValue(
      new Error("Failed to start test run"),
    );
    const user = setupUser();

    render(<TestsPage />);
    await runFirstTest(user);

    await waitFor(() => expect(mockStartAgentTestRun).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("runner-task-id")).not.toBeInTheDocument();
    await waitFor(() =>
      expect(mockToastError).toHaveBeenCalledWith("Failed to start test run"),
    );
    // The list survives: no full-page load-error panel, no reload prompt.
    // The row renders twice: the desktop table and the mobile card.
    expect(screen.getAllByText("First test").length).toBeGreaterThan(0);
    expect(screen.queryByText("Retry")).not.toBeInTheDocument();
  });

  it("opens the next run on its own uuid after a failed rerun", async () => {
    mockStartAgentTestRun.mockResolvedValue("run-abc");
    const user = setupUser();

    render(<TestsPage />);
    await runFirstTest(user);
    await waitFor(() =>
      expect(screen.getByTestId("runner-task-id")).toHaveTextContent("run-abc"),
    );

    // Rerun a different set of tests, and have the start fail.
    mockStartAgentTestRun.mockRejectedValue(new Error("nope"));
    await user.click(screen.getByText("mock-rerun"));
    await waitFor(() => expect(mockToastError).toHaveBeenCalledWith("nope"));

    // A failed start closes the runner rather than leaving it on a run that
    // never began.
    await waitFor(() =>
      expect(screen.queryByTestId("runner-task-id")).not.toBeInTheDocument(),
    );

    // The next ordinary run opens on the fresh uuid, not the previous one.
    mockStartAgentTestRun.mockResolvedValue("run-xyz");
    await runFirstTest(user);

    await waitFor(() =>
      expect(screen.getByTestId("runner-task-id")).toHaveTextContent("run-xyz"),
    );
    expect(mockStartAgentTestRun).toHaveBeenCalledTimes(3);
  });

  it("does not open the runner when the session expired", async () => {
    mockStartAgentTestRun.mockResolvedValue(null);
    const user = setupUser();

    render(<TestsPage />);
    await runFirstTest(user);

    await waitFor(() => expect(mockStartAgentTestRun).toHaveBeenCalledTimes(1));
    expect(screen.queryByTestId("runner-task-id")).not.toBeInTheDocument();
  });
});
