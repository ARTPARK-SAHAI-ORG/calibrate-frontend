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

jest.mock("../useAgentRunLaunchers", () => ({
  useAgentRunLaunchers: (options: AgentRunLauncherOptions) => {
    void options;
    return {
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

function renderTab() {
  return render(
    <RunsTabContent agentUuid={AGENT_UUID} agentName="Test agent" />,
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
});
