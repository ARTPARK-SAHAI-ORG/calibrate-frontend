import React from "react";
import { render, screen, setupUser, act, waitFor } from "@/test-utils";
import {
  RunsTabContent,
  runTestCount,
  runModelCount,
  runEvaluatorLabels,
} from "../RunsTabContent";
import type { AgentRun } from "@/hooks";

const BACKEND = "http://test-backend";
const AGENT_UUID = "agent-1";

jest.mock("../../../hooks", () => ({
  ...jest.requireActual("../../../hooks"),
  useAccessToken: () => "test-token",
}));

jest.mock("../../../lib/reportError", () => ({ reportError: jest.fn() }));

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

const rerunStart = jest.fn();
jest.mock("../../BenchmarkRerunDialog", () => ({
  BenchmarkRerunDialog: () => null,
  useBenchmarkRerun: () => ({
    config: null,
    key: 0,
    start: rerunStart,
    clear: jest.fn(),
  }),
}));

function jsonResponse(data: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => data };
}

const unitRun: AgentRun = {
  uuid: "run-unit",
  name: "",
  status: "done",
  type: "llm-unit-test",
  updated_at: new Date().toISOString(),
  total_tests: 3,
  passed: 1,
  failed: 1,
  results: [
    { passed: true },
    { passed: false },
    { passed: null, status: "error", error: "boom" },
  ],
};

const benchmarkRun: AgentRun = {
  uuid: "run-bench",
  name: "Bench",
  status: "done",
  type: "llm-benchmark",
  updated_at: new Date().toISOString(),
  total_tests: 4,
  passed: null,
  failed: null,
  model_results: [{ model: "a" }, { model: "b" }],
};

let state: { runs: AgentRun[]; total?: number; pollUnit?: unknown };

function installFetch() {
  global.fetch = jest.fn(async (url: string) => {
    if (url.includes(`/agent-tests/agent/${AGENT_UUID}/runs`)) {
      return jsonResponse({
        items: state.runs,
        total: state.total ?? state.runs.length,
      });
    }
    if (url.includes("/agent-tests/run/")) {
      return jsonResponse(state.pollUnit ?? {}, !!state.pollUnit, 200);
    }
    return jsonResponse({});
  }) as jest.Mock;
}

function renderTab() {
  return render(
    <RunsTabContent agentUuid={AGENT_UUID} agentName="Test agent" />,
  );
}

/** The query the tab sent on its last runs request. */
function lastRunsQuery() {
  const calls = (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
    String(url).includes("/runs?"),
  );
  return new URL(String(calls[calls.length - 1][0])).searchParams;
}

beforeEach(() => {
  jest.clearAllMocks();
  window.history.replaceState(null, "", "/");
  localStorage.clear();
  process.env.NEXT_PUBLIC_BACKEND_URL = BACKEND;
  runnerProps = null;
  benchmarkResultsProps = null;
  state = { runs: [unitRun, benchmarkRun] };
  installFetch();
});

describe("run counts", () => {
  it("reads the test count from the run, its results, then the first model", () => {
    expect(runTestCount({ ...unitRun, total_tests: 7 })).toBe(7);
    expect(runTestCount({ ...unitRun, total_tests: null })).toBe(3);
    expect(
      runTestCount({
        ...benchmarkRun,
        total_tests: null,
        model_results: [{ model: "a", test_results: [{}, {}] }],
      }),
    ).toBe(2);
  });

  it("has no test count when the run carries none", () => {
    expect(
      runTestCount({
        ...benchmarkRun,
        total_tests: null,
        results: null,
        model_results: [{ model: "a" }],
      }),
    ).toBeNull();
  });

  it("counts one model for a plain run and every model for a benchmark", () => {
    expect(runModelCount(unitRun)).toBe(1);
    expect(runModelCount(benchmarkRun)).toBe(2);
  });

  it("lists the evaluators, adding Tool call when the run had one", () => {
    expect(
      runEvaluatorLabels({
        ...unitRun,
        evaluators: [
          { uuid: "e1", name: "Correctness" },
          { uuid: "e2", name: "Tone" },
        ],
      }),
    ).toEqual(["Correctness", "Tone"]);

    expect(
      runEvaluatorLabels({
        ...unitRun,
        evaluators: [{ uuid: "e1", name: "Correctness" }],
        results: [{ passed: true, test_case: { type: "tool_call" } }],
      }),
    ).toEqual(["Correctness", "Tool call"]);

    // Nothing known about this run: the cell stays empty rather than guessing.
    expect(runEvaluatorLabels({ ...unitRun, results: null })).toEqual([]);
  });
});

describe("RunsTabContent", () => {
  it("names each run and when it was created", async () => {
    state.runs = [{ ...unitRun, created_at: "2026-01-18 09:30:00" }];
    renderTab();
    await screen.findAllByText("1 Success");
    // The whole id, so two runs can be told apart and one can be quoted.
    expect(screen.getAllByTitle("run-unit").length).toBeGreaterThan(0);
    // The day and time it started, not "3 min ago".
    expect(screen.getAllByText(/Jan 18/).length).toBeGreaterThan(0);
  });

  it("lists what judged the run, with tool calls named too", async () => {
    state.runs = [
      {
        ...unitRun,
        evaluators: [{ uuid: "e1", name: "Correctness" }],
        results: [{ passed: true }, { passed: true, type: "tool_call" }],
      },
    ];
    renderTab();
    expect((await screen.findAllByText("Correctness")).length).toBeGreaterThan(
      0,
    );
    expect(screen.getAllByText("Tool call").length).toBeGreaterThan(0);
  });

  it("shows both run kinds in one table with their test and model counts", async () => {
    renderTab();
    await screen.findAllByText("1 Success");

    const table = document.querySelector("table") as HTMLElement;
    const cells = Array.from(table.querySelectorAll("tbody tr")).map((row) =>
      Array.from(row.querySelectorAll("td")).map((td) => td.textContent),
    );
    // Run, result, number of tests, number of models: the counts sit third
    // and fourth, for the plain run and the benchmark.
    expect(cells[0]?.[2]).toBe("3");
    expect(cells[0]?.[3]).toBe("1");
    expect(cells[1]?.[2]).toBe("4");
    expect(cells[1]?.[3]).toBe("2");
    // No Test or Benchmark label anywhere.
    expect(screen.queryByText("Benchmark")).not.toBeInTheDocument();
  });

  it("shows a dash when the run does not say how many tests it covered", async () => {
    state.runs = [{ ...benchmarkRun, total_tests: null, results: null }];
    renderTab();
    await screen.findAllByText("Complete");
    const firstRow = document.querySelector("tbody tr") as HTMLElement;
    expect(firstRow.querySelectorAll("td")[2].textContent).toBe("—");
  });

  it("shows the per-test tally for a finished run", async () => {
    state.runs = [unitRun];
    renderTab();
    expect((await screen.findAllByText("1 Success")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 Fail").length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 Error").length).toBeGreaterThan(0);
  });

  it("shows Running while a run has not finished", async () => {
    state.runs = [{ ...unitRun, status: "in_progress", results: null }];
    renderTab();
    expect((await screen.findAllByText("Running")).length).toBeGreaterThan(0);
  });

  it("shows Error when the run itself broke", async () => {
    state.runs = [{ ...benchmarkRun, status: "failed" }];
    renderTab();
    expect((await screen.findAllByText("Error")).length).toBeGreaterThan(0);
  });

  it("asks the backend for the chosen result rather than filtering here", async () => {
    const user = setupUser();
    renderTab();
    await screen.findAllByText("1 Success");

    await user.click(screen.getByRole("button", { name: "All passed" }));
    await waitFor(() =>
      expect(lastRunsQuery().get("has_failures")).toBe("false"),
    );

    await user.click(screen.getByRole("button", { name: "All failed" }));
    await waitFor(() =>
      expect(lastRunsQuery().get("has_failures")).toBe("true"),
    );

    await user.click(screen.getByRole("button", { name: "Error" }));
    await waitFor(() => expect(lastRunsQuery().get("status")).toBe("failed"));

    await user.click(screen.getByRole("button", { name: "All results" }));
    await waitFor(() => {
      const q = lastRunsQuery();
      expect(q.get("has_failures")).toBeNull();
      expect(q.get("status")).toBeNull();
    });
  });

  it("asks for one page at a time", async () => {
    renderTab();
    await screen.findAllByText("1 Success");
    const q = lastRunsQuery();
    expect(q.get("limit")).toBe("50");
    expect(q.get("offset")).toBe("0");
  });

  it("moves to the next page and back", async () => {
    state.runs = [unitRun];
    state.total = 120;
    const user = setupUser();
    renderTab();
    await screen.findAllByText("1 Success");

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() => expect(lastRunsQuery().get("offset")).toBe("50"));

    await user.click(screen.getByRole("button", { name: "Previous page" }));
    await waitFor(() => expect(lastRunsQuery().get("offset")).toBe("0"));
  });

  it("opens the run window for a plain run", async () => {
    state.runs = [unitRun];
    const user = setupUser();
    renderTab();
    await user.click((await screen.findAllByText("1 Success"))[0]);
    expect(await screen.findByTestId("test-runner")).toHaveTextContent(
      "runner:run-unit",
    );
  });

  it("opens the model comparison window for a benchmark", async () => {
    state.runs = [benchmarkRun];
    const user = setupUser();
    renderTab();
    await user.click((await screen.findAllByText("Complete"))[0]);
    expect(await screen.findByTestId("benchmark-results")).toHaveTextContent(
      "bench:run-bench",
    );
  });

  it("starts a fresh comparison when the benchmark window asks to rerun", async () => {
    state.runs = [benchmarkRun];
    const user = setupUser();
    renderTab();
    await user.click((await screen.findAllByText("Complete"))[0]);
    await screen.findByTestId("benchmark-results");

    await act(async () => {
      benchmarkResultsProps.onRerun(["gpt-4"], ["t1"], ["A"]);
    });

    expect(rerunStart).toHaveBeenCalledWith(
      expect.objectContaining({ models: ["gpt-4"], testUuids: ["t1"] }),
    );
    expect(screen.queryByTestId("benchmark-results")).not.toBeInTheDocument();
  });

  it("points the run window at the rerun it reports", async () => {
    state.runs = [unitRun];
    const user = setupUser();
    renderTab();
    await user.click((await screen.findAllByText("1 Success"))[0]);
    await screen.findByTestId("test-runner");

    await act(async () => {
      runnerProps.onNewRun("task-rerun", ["t1"]);
    });
    expect(screen.getByTestId("test-runner")).toHaveTextContent(
      "runner:task-rerun",
    );
  });

  it("says what to do when the agent has never run its tests", async () => {
    state.runs = [];
    renderTab();
    await screen.findByText("No evaluations yet");
    expect(
      screen.getByText(/Run this agent's tests from the Tests tab/),
    ).toBeInTheDocument();
  });

  it("says a filter is hiding the evaluations rather than that there are none", async () => {
    state.runs = [];
    const user = setupUser();
    renderTab();
    await screen.findByText("No evaluations yet");
    await user.click(screen.getByRole("button", { name: "All passed" }));
    await screen.findByText("No evaluations match this filter");
  });

  it("asks once whether an opened run exists, not on every refresh", async () => {
    // A run that is not on this page, next to one that is still going, so the
    // rows keep refreshing underneath it.
    state.runs = [
      { ...unitRun, uuid: "run-pending", status: "pending", results: null },
    ];
    state.pollUnit = { status: "pending", results: null };
    window.history.replaceState(null, "", "/?runId=run-elsewhere");
    renderTab();
    await screen.findAllByText("Running");

    const existsCalls = () =>
      (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
        String(url).includes("/agent-tests/run/run-elsewhere"),
      ).length;
    await waitFor(() => expect(existsCalls()).toBe(1));
    // Let a couple of row refreshes go by: still one.
    await new Promise((resolve) => setTimeout(resolve, 3500));
    expect(existsCalls()).toBe(1);
  }, 10000);

  it("keeps an unfinished run up to date", async () => {
    state.runs = [
      {
        ...unitRun,
        uuid: "run-pending",
        status: "pending",
        results: [{ passed: null }],
      },
    ];
    state.pollUnit = {
      status: "done",
      total_tests: 1,
      passed: 1,
      failed: 0,
      results: [{ passed: true }],
    };
    renderTab();
    await screen.findAllByText("Running");
    expect(
      (await screen.findAllByText("1 Success", {}, { timeout: 5000 })).length,
    ).toBeGreaterThan(0);
  }, 10000);
});
