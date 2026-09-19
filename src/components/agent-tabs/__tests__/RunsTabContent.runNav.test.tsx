import React from "react";
import { render, screen, setupUser, act, waitFor } from "@/test-utils";
import { RunsTabContent } from "../RunsTabContent";
import type { AgentRun } from "@/hooks";
import type { AgentRunLauncherOptions } from "../useAgentRunLaunchers";

const BACKEND = "http://test-backend";
const AGENT_UUID = "agent-1";
// Small enough that twelve runs cross a page boundary.
const PAGE_SIZE = 10;

jest.mock("../../../hooks", () => ({
  ...jest.requireActual("../../../hooks"),
  useAccessToken: () => "test-token",
}));

jest.mock("../../../lib/reportError", () => ({ reportError: jest.fn() }));

jest.mock("sonner", () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

let runnerProps: any = null;
jest.mock("../../TestRunnerDialog", () => ({
  TestRunnerDialog: (props: any) => {
    runnerProps = props;
    return props.isOpen ? (
      <div data-testid="test-runner">runner:{props.taskId}</div>
    ) : null;
  },
}));

let benchmarkResultsProps: any = null;
jest.mock("../../BenchmarkResultsDialog", () => ({
  BenchmarkResultsDialog: (props: any) => {
    benchmarkResultsProps = props;
    return props.isOpen ? (
      <div data-testid="benchmark-results">bench:{props.taskId}</div>
    ) : null;
  },
}));

// Whether a launcher dialog (the model picker, the confirmation, the
// connection check) is covering the run window right now. A test turns this on
// to check the run window stops offering previous / next while it is.
let mockLauncherDialogOpen = false;

jest.mock("../useAgentRunLaunchers", () => ({
  useAgentRunLaunchers: (options: AgentRunLauncherOptions) => {
    void options;
    return {
      isDialogOpen: mockLauncherDialogOpen,
      confirmTestRun: jest.fn(),
      openCompare: jest.fn().mockResolvedValue(true),
      dialogs: <div data-testid="launcher-dialogs" />,
    };
  },
}));

function jsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data };
}

/**
 * Twelve runs, newest first, so page one holds ten and page two holds two.
 * The second run is a model comparison, so stepping from the first run to it
 * has to swap which window is open.
 */
function buildRuns(): AgentRun[] {
  return Array.from({ length: 12 }, (_, index) => {
    const benchmark = index === 1;
    return {
      uuid: `run-${index}`,
      // A name the app shows word for word, so each row is easy to click.
      name: `R${index}`,
      status: "done",
      type: benchmark ? "llm-benchmark" : "llm-unit-test",
      updated_at: "2026-01-01T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
      total_tests: 2,
      passed: benchmark ? null : 2,
      failed: benchmark ? null : 0,
      unanswered_tests: 0,
      ...(benchmark ? { model_results: [{ model: "a" }] } : {}),
    } as AgentRun;
  });
}

let runs: AgentRun[];

// The page whose request is made to wait, so a test can catch the list
// mid-page-turn, and the call that lets it answer.
let heldOffset: number | null = null;
let heldWait: Promise<void> | null = null;
let releaseHeldPage: () => void = () => {};

/** Makes the request for this page wait until `releaseHeldPage()` is called. */
function holdPage(offset: number) {
  heldOffset = offset;
  heldWait = new Promise<void>((resolve) => {
    releaseHeldPage = () => {
      heldOffset = null;
      resolve();
    };
  });
}

/** Answers the runs list for the page it is actually asked for. */
function installFetch() {
  global.fetch = jest.fn(async (url: string) => {
    if (url.includes(`/agent-tests/agent/${AGENT_UUID}/runs`)) {
      const params = new URL(url).searchParams;
      const limit = Number(params.get("limit")) || PAGE_SIZE;
      const around = params.get("around");
      let offset = Number(params.get("offset")) || 0;
      if (around) {
        const at = runs.findIndex((run) => run.uuid === around);
        if (at < 0) return jsonResponse({}, false, 404);
        offset = Math.floor(at / limit) * limit;
      }
      if (heldOffset === offset && heldWait) await heldWait;
      return jsonResponse({
        items: runs.slice(offset, offset + limit),
        total: runs.length,
        offset,
        limit,
      });
    }
    return jsonResponse({});
  }) as jest.Mock;
}

function renderTab(props: { isActive?: boolean } = {}) {
  return render(
    <RunsTabContent
      agentUuid={AGENT_UUID}
      agentName="Test agent"
      {...props}
    />,
  );
}

/** Clicks the row for the run with this name (the table and the mobile cards
 *  both render it, so take the first). */
async function openRow(
  user: ReturnType<typeof setupUser>,
  name: string,
): Promise<void> {
  await user.click((await screen.findAllByText(name))[0]);
}

beforeEach(() => {
  jest.clearAllMocks();
  window.history.replaceState(null, "", "/");
  localStorage.clear();
  localStorage.setItem("calibrate:items-page-size", String(PAGE_SIZE));
  process.env.NEXT_PUBLIC_BACKEND_URL = BACKEND;
  runnerProps = null;
  benchmarkResultsProps = null;
  mockLauncherDialogOpen = false;
  heldOffset = null;
  heldWait = null;
  releaseHeldPage = () => {};
  runs = buildRuns();
  installFetch();
});

describe("stepping from one run to the next", () => {
  it("tells the open window where the run sits in the whole list", async () => {
    const user = setupUser();
    renderTab();
    await openRow(user, "R3");
    await screen.findByTestId("test-runner");

    // Fourth of twelve, counted across every page, not just the ten on screen.
    expect(runnerProps.runPosition).toEqual({ index: 3, total: 12 });
    expect(runnerProps.hasPrevRun).toBe(true);
    expect(runnerProps.hasNextRun).toBe(true);
  });

  it("has nothing before the first run and nothing after the last", async () => {
    const user = setupUser();
    renderTab();
    await openRow(user, "R0");
    await screen.findByTestId("test-runner");
    expect(runnerProps.runPosition).toEqual({ index: 0, total: 12 });
    expect(runnerProps.hasPrevRun).toBe(false);
    expect(runnerProps.hasNextRun).toBe(true);

    // The last run lives on page two.
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await openRow(user, "R11");
    await screen.findByTestId("test-runner");
    expect(runnerProps.runPosition).toEqual({ index: 11, total: 12 });
    expect(runnerProps.hasPrevRun).toBe(true);
    expect(runnerProps.hasNextRun).toBe(false);
  });

  it("opens the next run, swapping the window when the next one is a model comparison", async () => {
    const user = setupUser();
    renderTab();
    await openRow(user, "R0");
    await screen.findByTestId("test-runner");

    await act(async () => {
      runnerProps.onNextRun();
    });

    expect(screen.getByTestId("benchmark-results")).toHaveTextContent(
      "bench:run-1",
    );
    expect(screen.queryByTestId("test-runner")).not.toBeInTheDocument();
    expect(benchmarkResultsProps.runPosition).toEqual({ index: 1, total: 12 });
  });

  it("opens the run before it, swapping back from the comparison window", async () => {
    const user = setupUser();
    renderTab();
    await openRow(user, "R1");
    await screen.findByTestId("benchmark-results");

    await act(async () => {
      benchmarkResultsProps.onPrevRun();
    });

    expect(screen.getByTestId("test-runner")).toHaveTextContent("runner:run-0");
    expect(screen.queryByTestId("benchmark-results")).not.toBeInTheDocument();
    expect(runnerProps.runPosition).toEqual({ index: 0, total: 12 });
  });

  it("turns to the next page and opens the first run on it", async () => {
    const user = setupUser();
    renderTab();
    // The last run on page one.
    await openRow(user, "R9");
    await screen.findByTestId("test-runner");

    await act(async () => {
      runnerProps.onNextRun();
    });

    await waitFor(() =>
      expect(screen.getByTestId("test-runner")).toHaveTextContent(
        "runner:run-10",
      ),
    );
    expect(runnerProps.runPosition).toEqual({ index: 10, total: 12 });
    // The rows behind the window moved with it.
    expect((await screen.findAllByText("R11")).length).toBeGreaterThan(0);
  });

  it("turns back a page and opens the last run on it", async () => {
    const user = setupUser();
    renderTab();
    await screen.findAllByText("R0");
    await user.click(screen.getByRole("button", { name: "Next page" }));
    // The first run on page two.
    await openRow(user, "R10");
    await screen.findByTestId("test-runner");

    await act(async () => {
      runnerProps.onPrevRun();
    });

    await waitFor(() =>
      expect(screen.getByTestId("test-runner")).toHaveTextContent(
        "runner:run-9",
      ),
    );
    expect(runnerProps.runPosition).toEqual({ index: 9, total: 12 });
    expect((await screen.findAllByText("R0")).length).toBeGreaterThan(0);
  });

  it("offers a next run on the last row of a page, and a previous one on the first row of a later page", async () => {
    const user = setupUser();
    renderTab();
    // The last run on page one. The next one is on page two, so the arrow has
    // to be live even though there is nothing after it on screen.
    await openRow(user, "R9");
    await screen.findByTestId("test-runner");
    expect(runnerProps.runPosition).toEqual({ index: 9, total: 12 });
    expect(runnerProps.hasNextRun).toBe(true);

    // The first run on page two. The one before it is on page one, so that
    // arrow has to be live too.
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await openRow(user, "R10");
    await screen.findByTestId("test-runner");
    expect(runnerProps.runPosition).toEqual({ index: 10, total: 12 });
    expect(runnerProps.hasPrevRun).toBe(true);
  });

  it("does not reopen a run when the window is closed while the next page is still loading", async () => {
    const user = setupUser();
    renderTab();
    // The last run on page one, so stepping on has to turn the page.
    await openRow(user, "R9");
    await screen.findByTestId("test-runner");

    // Page two answers only when the test says so.
    holdPage(10);
    await act(async () => {
      runnerProps.onNextRun();
    });
    // Closing the window is what Back does too.
    await act(async () => {
      runnerProps.onClose();
    });
    expect(screen.queryByTestId("test-runner")).not.toBeInTheDocument();

    await act(async () => {
      releaseHeldPage();
    });
    // Page two's rows land behind the closed window...
    await waitFor(() =>
      expect(screen.getAllByText("R10").length).toBeGreaterThan(0),
    );
    // ...and no run window comes back with them.
    expect(screen.queryByTestId("test-runner")).not.toBeInTheDocument();
    expect(screen.queryByTestId("benchmark-results")).not.toBeInTheDocument();
  });

  it("does not reopen a run when Back closes the window while the next page is still loading", async () => {
    const user = setupUser();
    const { rerender } = renderTab();
    await openRow(user, "R9");
    await screen.findByTestId("test-runner");

    holdPage(10);
    await act(async () => {
      runnerProps.onNextRun();
    });

    // What the Back button leaves behind: the run is gone from the address,
    // and the page renders again. (The address hooks are stubbed for every
    // test in this app, so the render Next does on Back is done by hand.)
    await act(async () => {
      window.history.replaceState(null, "", "/");
    });
    rerender(
      <RunsTabContent agentUuid={AGENT_UUID} agentName="Test agent" />,
    );
    await waitFor(() =>
      expect(screen.queryByTestId("test-runner")).not.toBeInTheDocument(),
    );

    await act(async () => {
      releaseHeldPage();
    });
    await waitFor(() =>
      expect(screen.getAllByText("R10").length).toBeGreaterThan(0),
    );
    expect(screen.queryByTestId("test-runner")).not.toBeInTheDocument();
    expect(screen.queryByTestId("benchmark-results")).not.toBeInTheDocument();
  });

  it("offers no stepping while this tab is not the one on screen", async () => {
    const user = setupUser();
    const { rerender } = renderTab({ isActive: false });
    await openRow(user, "R3");
    await screen.findByTestId("test-runner");

    expect(runnerProps.onNextRun).toBeUndefined();
    expect(runnerProps.onPrevRun).toBeUndefined();
    expect(runnerProps.runPosition).toBeUndefined();

    rerender(
      <RunsTabContent agentUuid={AGENT_UUID} agentName="Test agent" isActive />,
    );
    await waitFor(() => expect(runnerProps.onNextRun).toBeDefined());
    expect(runnerProps.onPrevRun).toBeDefined();
    expect(runnerProps.runPosition).toEqual({ index: 3, total: 12 });
  });

  it("offers no stepping while a launcher dialog is covering the window", async () => {
    mockLauncherDialogOpen = true;
    const user = setupUser();
    const { rerender } = renderTab();
    await openRow(user, "R3");
    await screen.findByTestId("test-runner");

    expect(runnerProps.onNextRun).toBeUndefined();
    expect(runnerProps.onPrevRun).toBeUndefined();
    expect(runnerProps.runPosition).toBeUndefined();

    // The picker closes, and the window under it can step again.
    mockLauncherDialogOpen = false;
    rerender(
      <RunsTabContent agentUuid={AGENT_UUID} agentName="Test agent" isActive />,
    );
    await waitFor(() => expect(runnerProps.onNextRun).toBeDefined());
    expect(runnerProps.runPosition).toEqual({ index: 3, total: 12 });
  });

  it("goes back to the first page for a run that has just been created, so the arrows still work", async () => {
    const user = setupUser();
    renderTab();
    await screen.findAllByText("R0");
    await user.click(screen.getByRole("button", { name: "Next page" }));
    await openRow(user, "R10");
    await screen.findByTestId("test-runner");

    // The window reports a new run. It is the newest, so it is on page one.
    await act(async () => {
      runnerProps.onNewRun("run-2");
    });

    await waitFor(() =>
      expect(screen.getByTestId("test-runner")).toHaveTextContent(
        "runner:run-2",
      ),
    );
    // The list went back to page one, with the new run in it.
    await waitFor(() =>
      expect(screen.getAllByText("R0").length).toBeGreaterThan(0),
    );
    await waitFor(() =>
      expect(runnerProps.runPosition).toEqual({ index: 2, total: 12 }),
    );
    expect(runnerProps.hasPrevRun).toBe(true);
    expect(runnerProps.hasNextRun).toBe(true);
  });
});
