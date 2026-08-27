import React from "react";
import { render, screen, setupUser, act, waitFor } from "@/test-utils";
import { RunsTabContent, runTestCount, runModels } from "../RunsTabContent";
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
      const around = new URL(url).searchParams.get("around");
      if (around && !state.runs.some((r) => r.uuid === around)) {
        return jsonResponse({}, false, 404);
      }
      return jsonResponse({
        items: state.runs,
        total: state.total ?? state.runs.length,
        offset: 0,
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

  it("reads a model comparison's count from the list, which carries no cases", () => {
    // The runs list gives each model a `total_tests` but not the cases behind
    // it, so a finished comparison showed a dash until the count was read.
    expect(
      runTestCount({
        ...benchmarkRun,
        total_tests: null,
        results: null,
        model_results: [{ model: "a", total_tests: 4 }],
      }),
    ).toBe(4);
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

  it("names no model for a plain run and every model for a comparison", () => {
    expect(runModels(unitRun)).toEqual([]);
    expect(runModels(benchmarkRun)).toEqual(["a", "b"]);
    // The backend stores a model with "__" where the name has a "/".
    expect(
      runModels({
        ...benchmarkRun,
        model_results: [{ model: "google__gemini-2.5-flash" }],
      }),
    ).toEqual(["google/gemini-2.5-flash"]);
  });
});

describe("RunsTabContent", () => {
  it("names each run and when it was created", async () => {
    state.runs = [
      { ...unitRun, name: "Run 4", created_at: "2026-01-18 09:30:00" },
    ];
    renderTab();
    await screen.findAllByText("1 Success");
    // The name the run is known by, not its id.
    expect(screen.getAllByText("Evaluation run 4").length).toBeGreaterThan(0);
    expect(screen.queryByText("run-unit")).not.toBeInTheDocument();
    // The day and time it started, not "3 min ago".
    expect(screen.getAllByText(/Jan 18/).length).toBeGreaterThan(0);
  });

  it("shows a dash when the run does not say when it started", async () => {
    // Only created_at will do: updated_at moves as the run progresses.
    state.runs = [{ ...unitRun, created_at: undefined }];
    renderTab();
    await screen.findAllByText("1 Success");
    const cells = Array.from(
      (document.querySelector("tbody tr") as HTMLElement).querySelectorAll(
        "td",
      ),
    ).map((td) => td.textContent);
    expect(cells[cells.length - 1]).toBe("—");
  });

  it("shows both run kinds in one table with their test and model counts", async () => {
    renderTab();
    await screen.findAllByText("1 Success");

    const table = document.querySelector("table") as HTMLElement;
    const cells = Array.from(table.querySelectorAll("tbody tr")).map((row) =>
      Array.from(row.querySelectorAll("td")).map((td) => td.textContent),
    );
    // Run, result, tests, models: the counts sit third and fourth, for the
    // plain run and the benchmark.
    expect(cells[0]?.[2]).toBe("3");
    // A plain run used the agent's own model, so there is nothing to name.
    expect(cells[0]?.[3]).toBe("Default");
    expect(cells[1]?.[2]).toBe("4");
    expect(cells[1]?.[3]).toBe("ab");
    // No Test or Benchmark label anywhere.
    expect(screen.queryByText("Benchmark")).not.toBeInTheDocument();
  });

  it("names the evaluators that judged each run as chips", async () => {
    state.runs = [
      { ...unitRun, evaluators: ["Correctness", "Script Fidelity", "Tool call"] },
    ];
    renderTab();
    await screen.findAllByText("1 Success");

    const row = document.querySelector("tbody tr") as HTMLElement;
    const cells = Array.from(row.querySelectorAll("td")).map(
      (td) => td.textContent,
    );
    // Run, result, tests, models, evaluators, created at.
    expect(cells[4]).toBe("CorrectnessScript FidelityTool call");
    // Plain chips, nothing to click.
    expect(
      (row.querySelectorAll("td")[4] as HTMLElement).querySelector(
        "a, button",
      ),
    ).toBeNull();
  });

  it("shows a dash when no evaluators judged the run", async () => {
    state.runs = [{ ...unitRun, evaluators: [] }];
    renderTab();
    await screen.findAllByText("1 Success");
    const cells = Array.from(
      (document.querySelector("tbody tr") as HTMLElement).querySelectorAll(
        "td",
      ),
    ).map((td) => td.textContent);
    expect(cells[4]).toBe("—");
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

  it("asks the backend for model comparisons only when that filter is on", async () => {
    const user = setupUser();
    renderTab();
    await screen.findAllByText("1 Success");
    expect(lastRunsQuery().get("type")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Model comparisons" }));
    await waitFor(() =>
      expect(lastRunsQuery().get("type")).toBe("llm-benchmark"),
    );

    await user.click(screen.getByRole("button", { name: "All runs" }));
    await waitFor(() => expect(lastRunsQuery().get("type")).toBeNull());
  });

  it("says a filter is hiding the runs when only model comparisons are asked for", async () => {
    const user = setupUser();
    renderTab();
    await screen.findAllByText("1 Success");

    state.runs = [];
    state.total = 0;
    await user.click(screen.getByRole("button", { name: "Model comparisons" }));
    await screen.findByText("No evaluations match this filter");
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

  it("puts the page number in the address as you page, so a reload reopens on it", async () => {
    state.runs = [unitRun];
    state.total = 120;
    const user = setupUser();
    renderTab();
    await screen.findAllByText("1 Success");
    expect(new URLSearchParams(window.location.search).get("page")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("page")).toBe(
        "2",
      ),
    );

    await user.click(screen.getByRole("button", { name: "Previous page" }));
    await waitFor(() =>
      // Page one is the default, so it's left out rather than written as
      // `page=1`.
      expect(
        new URLSearchParams(window.location.search).get("page"),
      ).toBeNull(),
    );
  });

  it("reopens on the page named in the address instead of resetting to page one", async () => {
    state.runs = [unitRun];
    state.total = 120;
    window.history.replaceState(null, "", "/?page=2");
    renderTab();

    await screen.findAllByText("1 Success");
    await waitFor(() => expect(lastRunsQuery().get("offset")).toBe("50"));
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

  it("asks the list for a run not on this page once, not on every refresh", async () => {
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
        String(url).includes("around=run-elsewhere"),
      ).length;
    await waitFor(() => expect(existsCalls()).toBe(1));

    // Wait for the rows to be refreshed twice rather than for a fixed time, so
    // a slow machine cannot make this pass by accident.
    const pollCalls = () =>
      (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
        String(url).includes("/agent-tests/run/run-pending"),
      ).length;
    await waitFor(() => expect(pollCalls()).toBeGreaterThanOrEqual(2), {
      timeout: 8000,
    });
    expect(existsCalls()).toBe(1);
  }, 12000);

  it("leaves a running run alone when one ask for it fails", async () => {
    state.runs = [
      {
        ...unitRun,
        uuid: "run-pending",
        status: "pending",
        results: [{ passed: null }],
      },
    ];
    // Every ask about this run fails, as a dropped connection would.
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes(`/agent-tests/agent/${AGENT_UUID}/runs`)) {
        return jsonResponse({ items: state.runs, total: state.runs.length });
      }
      if (url.includes("/agent-tests/run/")) throw new Error("offline");
      return jsonResponse({});
    });

    renderTab();
    await screen.findAllByText("Running");

    // Wait for two failed asks rather than for a fixed time.
    const pollCalls = () =>
      (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
        String(url).includes("/agent-tests/run/"),
      ).length;
    await waitFor(() => expect(pollCalls()).toBeGreaterThanOrEqual(2), {
      timeout: 8000,
    });

    expect(screen.getAllByText("Running").length).toBeGreaterThan(0);
    // Scoped to the table: "Error" is also one of the filter buttons.
    const table = document.querySelector("table") as HTMLElement;
    expect(table.textContent).not.toContain("Error");
  }, 12000);

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
