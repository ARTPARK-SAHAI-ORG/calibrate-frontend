import React from "react";
import { render, screen, setupUser, act, waitFor, within } from "@/test-utils";
import { RunsTabContent, runTestCount, runModels } from "../RunsTabContent";
import type { AgentRun } from "@/hooks";
import type { AgentRunLauncherOptions } from "../useAgentRunLaunchers";

const BACKEND = "http://test-backend";
const AGENT_UUID = "agent-1";

jest.mock("../../../hooks", () => ({
  ...jest.requireActual("../../../hooks"),
  useAccessToken: () => "test-token",
}));

jest.mock("../../../lib/reportError", () => ({ reportError: jest.fn() }));

const mockToastError = jest.fn();
jest.mock("sonner", () => ({
  toast: {
    error: (...args: unknown[]) => mockToastError(...args),
    success: jest.fn(),
  },
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

let launcherOptions: AgentRunLauncherOptions | null = null;
const confirmTestRun = jest.fn();
const openCompare = jest.fn().mockResolvedValue(true);
jest.mock("../useAgentRunLaunchers", () => ({
  useAgentRunLaunchers: (options: AgentRunLauncherOptions) => {
    launcherOptions = options;
    return {
      confirmTestRun,
      openCompare,
      dialogs: <div data-testid="launcher-dialogs" />,
    };
  },
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
  // One passed, one wrong answer, one that produced no answer. The counts are
  // what the list carries; it does not send the cases behind them.
  unanswered_tests: 1,
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

let state: {
  runs: AgentRun[];
  total?: number;
  deleteOk?: boolean;
  /** Holds the next runs request until this resolves. */
  holdList?: Promise<void>;
};

function installFetch() {
  global.fetch = jest.fn(async (url: string) => {
    if (url.includes(`/agent-tests/agent/${AGENT_UUID}/runs`)) {
      if (state.holdList) {
        const hold = state.holdList;
        state.holdList = undefined;
        await hold;
      }
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
    if (url.includes("/agent-tests/job/")) {
      return jsonResponse(
        state.deleteOk === false ? {} : { message: "ok" },
        state.deleteOk !== false,
        state.deleteOk === false ? 500 : 200,
      );
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
  launcherOptions = null;
  state = { runs: [unitRun, benchmarkRun] };
  installFetch();
});

describe("run counts", () => {
  it("reads the test count from the run, then the first model", () => {
    expect(runTestCount({ ...unitRun, total_tests: 7 })).toBe(7);
    // The list carries the count, never the cases behind it.
    expect(runTestCount({ ...unitRun, total_tests: null })).toBeNull();
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
        model_results: [{ model: "a", total_tests: 4 }],
      }),
    ).toBe(4);
  });

  it("has no test count when the run carries none", () => {
    expect(
      runTestCount({
        ...benchmarkRun,
        total_tests: null,
        model_results: [{ model: "a" }],
      }),
    ).toBeNull();
  });

  it("names no model for a plain run and every model for a comparison", () => {
    expect(runModels(unitRun)).toEqual([]);
    expect(runModels(benchmarkRun)).toEqual(["a", "b"]);
    // The backend stores a model with "__" where the name has a "/", and the
    // company that makes it is left off.
    expect(
      runModels({
        ...benchmarkRun,
        model_results: [{ model: "google__gemini-2.5-flash" }],
      }),
    ).toEqual(["gemini-2.5-flash"]);
  });
});

describe("RunsTabContent", () => {
  it("names each run and when it was created", async () => {
    state.runs = [
      { ...unitRun, name: "Run 4", created_at: "2026-01-18 09:30:00" },
    ];
    renderTab();
    await screen.findAllByText("50% passed");
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
    await screen.findAllByText("50% passed");
    const cells = Array.from(
      (document.querySelector("tbody tr") as HTMLElement).querySelectorAll(
        "td",
      ),
    ).map((td) => td.textContent);
    // Last cell is the delete button; "Created at" is the one before it.
    expect(cells[cells.length - 2]).toBe("—");
  });

  it("shows both run kinds in one table with their test and model counts", async () => {
    renderTab();
    await screen.findAllByText("50% passed");

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
    // One model, then how many more, so a run with several does not widen the
    // column for every other row.
    expect(cells[1]?.[3]).toBe("a+1");
    // No Test or Benchmark label anywhere.
    expect(screen.queryByText("Benchmark")).not.toBeInTheDocument();
  });

  it("names the evaluators that judged each run as chips", async () => {
    state.runs = [
      {
        ...unitRun,
        evaluators: [
          { uuid: "ev1", name: "Correctness" },
          { uuid: "ev2", name: "Script Fidelity" },
          { uuid: null, name: "Tool call" },
        ],
      },
    ];
    renderTab();
    await screen.findAllByText("50% passed");

    const row = document.querySelector("tbody tr") as HTMLElement;
    const cells = Array.from(row.querySelectorAll("td")).map(
      (td) => td.textContent,
    );
    // Run, result, tests, models, evaluators, created at. The first
    // evaluator, then how many more, so a run with many of them does not push
    // the other rows' columns out of line.
    expect(cells[4]).toBe("Correctness+2");
    // The name is a button, so it opens how that evaluator judges.
    expect(
      within(row.querySelectorAll("td")[4] as HTMLElement).getByRole("button", {
        name: "Correctness",
      }),
    ).toBeInTheDocument();
  });

  it("still names the evaluators when the backend sends bare names", async () => {
    // An older backend sends `evaluators` as plain strings. The names still
    // show; there is just no id, so nothing to open.
    state.runs = [
      {
        ...unitRun,
        evaluators: ["Correctness", "Script Fidelity", "Tool call"],
      },
    ];
    renderTab();
    await screen.findAllByText("50% passed");

    const row = document.querySelector("tbody tr") as HTMLElement;
    const cells = Array.from(row.querySelectorAll("td")).map(
      (td) => td.textContent,
    );
    expect(cells[4]).toBe("Correctness+2");
    expect(
      (row.querySelectorAll("td")[4] as HTMLElement).querySelector("button"),
    ).toBeNull();
  });

  it("shows a dash when no evaluators judged the run", async () => {
    state.runs = [{ ...unitRun, evaluators: [] }];
    renderTab();
    await screen.findAllByText("50% passed");
    const cells = Array.from(
      (document.querySelector("tbody tr") as HTMLElement).querySelectorAll(
        "td",
      ),
    ).map((td) => td.textContent);
    expect(cells[4]).toBe("—");
  });

  it("shows a dash when the run does not say how many tests it covered", async () => {
    state.runs = [{ ...benchmarkRun, total_tests: null }];
    renderTab();
    await screen.findAllByText("No results");
    const firstRow = document.querySelector("tbody tr") as HTMLElement;
    expect(firstRow.querySelectorAll("td")[2].textContent).toBe("—");
  });

  it("shows what a finished run passed, leaving the tests it never ran out of it", async () => {
    // One passed, one answered wrongly, one never run: half of what was
    // answered passed, and the third is counted on its own.
    state.runs = [unitRun];
    renderTab();
    expect((await screen.findAllByText("50% passed")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 Not run").length).toBeGreaterThan(0);
  });

  it("colours the share by how good it is", async () => {
    const bands = [
      { total_tests: 4, passed: 1, label: "25% passed", colour: "bg-red-100" },
      { total_tests: 4, passed: 3, label: "75% passed", colour: "bg-amber-100" },
      { total_tests: 4, passed: 4, label: "100% passed", colour: "bg-green-100" },
    ];
    for (const band of bands) {
      state.runs = [
        { ...unitRun, ...band, failed: band.total_tests - band.passed, unanswered_tests: 0 },
      ];
      const view = render(
        <RunsTabContent agentUuid={AGENT_UUID} agentName="Test agent" />,
      );
      const pill = (await screen.findAllByText(band.label))[0];
      expect(pill.className).toContain(band.colour);
      view.unmount();
    }
  });

  it("says a run that answered nothing has no results, rather than scoring it zero", async () => {
    state.runs = [{ ...unitRun, passed: 0, failed: 0, unanswered_tests: 3 }];
    renderTab();
    expect((await screen.findAllByText("No results")).length).toBeGreaterThan(0);
    expect(screen.queryByText(/% passed/)).not.toBeInTheDocument();
  });

  it("says only Error for a run that broke, whichever kind of run it is", async () => {
    state.runs = [
      { ...unitRun, uuid: "broke-plain", status: "failed" },
      {
        ...benchmarkRun,
        uuid: "broke-comparison",
        status: "failed",
        model_results: [{ model: "a", total_tests: 20, passed: 0, failed: 20 }],
      },
    ];
    renderTab();
    // Both rows say Error and neither is scored: a run that fell over before
    // it asked anything still carries a count for every test it was meant to
    // run, so its own counts cannot say how the tests went.
    expect((await screen.findAllByText("Error")).length).toBe(4);
    expect(screen.queryByText(/% passed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Not run/)).not.toBeInTheDocument();
  });

  it("says a run was stopped, alongside what it managed to do", async () => {
    // 10 tests, stopped after 3 passed and 1 failed: the other 6 were never
    // asked, so they must not be counted as wrong answers.
    state.runs = [
      {
        ...unitRun,
        aborted: true,
        total_tests: 10,
        passed: 3,
        failed: 1,
        unanswered_tests: 0,
      },
    ];
    renderTab();
    // The mark sits with the run's name, not among the result pills.
    expect(
      (
        await screen.findAllByLabelText(
          "Someone stopped the evaluation before it finished",
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText("75% passed").length).toBeGreaterThan(0);
    expect(screen.getAllByText("6 Not run").length).toBeGreaterThan(0);
  });

  it("marks each run by how the run itself went", async () => {
    state.runs = [
      // Every test answered, so this is the only finished one: `unitRun` has
      // a test that produced no answer.
      { ...unitRun, uuid: "run-whole", passed: 2, failed: 1, unanswered_tests: 0 },
      unitRun,
      { ...benchmarkRun, uuid: "run-going", status: "in_progress" },
      { ...benchmarkRun, uuid: "run-broke", status: "failed" },
      { ...unitRun, uuid: "run-stopped", aborted: true },
    ];
    renderTab();
    // Desktop table and mobile cards both render, so each mark appears twice.
    expect(
      (await screen.findAllByLabelText("The evaluation ran every test")).length,
    ).toBe(2);
    expect(
      screen.getAllByLabelText("Some of the tests could not be run").length,
    ).toBe(2);
    expect(
      screen.getAllByLabelText(
        "Someone stopped the evaluation before it finished",
      ).length,
    ).toBe(2);
    expect(
      screen.getAllByLabelText("The evaluation broke before it could finish")
        .length,
    ).toBe(2);
    // A run still going says so in the results instead.
    expect(screen.getAllByText("Running").length).toBeGreaterThan(0);
  });

  it("does not call a run complete when a test produced no answer", async () => {
    // The same run the tally test uses: one test gave no answer, so the run
    // did not cover every test and must not carry the green tick.
    state.runs = [unitRun];
    renderTab();
    expect(
      (
        await screen.findAllByLabelText(
          "Partially complete as some tests could not be run",
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryByLabelText("The evaluation ran every test"),
    ).not.toBeInTheDocument();
  });

  it("says there are no results when the run was stopped before any test ran", async () => {
    state.runs = [{ ...unitRun, aborted: true, total_tests: null }];
    renderTab();
    expect((await screen.findAllByText("No results")).length).toBeGreaterThan(0);
  });

  it("says a stopped model comparison was stopped rather than complete", async () => {
    state.runs = [{ ...benchmarkRun, aborted: true }];
    renderTab();
    expect(
      (
        await screen.findAllByLabelText(
          "Someone stopped the evaluation before it finished",
        )
      ).length,
    ).toBeGreaterThan(0);
    expect(screen.queryByText("Complete")).not.toBeInTheDocument();
    // It carries no counts, so the results cell says so in words, the way the
    // models cell says "Default", rather than being left blank.
    const firstRow = document.querySelector("tbody tr") as HTMLElement;
    expect(firstRow.querySelectorAll("td")[1].textContent).toBe("No results");
  });

  it("shows what a comparison's models passed instead of a bare Complete", async () => {
    state.runs = [
      {
        ...benchmarkRun,
        model_results: [
          { model: "a", total_tests: 100, passed: 88, failed: 12 },
          { model: "b", total_tests: 100, passed: 96, failed: 4 },
        ],
      },
    ];
    renderTab();
    expect((await screen.findAllByText("88\u201396% passed")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Complete")).not.toBeInTheDocument();
  });

  it("names the models a comparison could not run at all", async () => {
    state.runs = [
      {
        ...benchmarkRun,
        model_results: [
          { model: "a", total_tests: 100, passed: 94, failed: 6 },
          { model: "b", success: false },
        ],
      },
    ];
    renderTab();
    expect((await screen.findAllByText("94% passed")).length).toBeGreaterThan(0);
    expect(screen.getAllByText("1 model failed").length).toBeGreaterThan(0);
  });

  it("says only that the models failed when none of them carries counts", async () => {
    state.runs = [
      {
        ...benchmarkRun,
        model_results: [{ model: "a", success: false }, { model: "b", success: false }],
      },
    ];
    renderTab();
    expect((await screen.findAllByText("2 models failed")).length).toBeGreaterThan(0);
    expect(screen.queryByText(/% passed/)).not.toBeInTheDocument();
  });

  it("says a run someone stopped is stopping, not running", async () => {
    state.runs = [{ ...unitRun, status: "in_progress", aborted: true }];
    renderTab();
    expect((await screen.findAllByText("Stopping")).length).toBeGreaterThan(0);
    expect(screen.queryByText("Running")).not.toBeInTheDocument();
  });

  it("counts a comparison's tests that never ran, the same as a single run", async () => {
    state.runs = [
      {
        ...benchmarkRun,
        model_results: [
          { model: "a", total_tests: 10, passed: 5, failed: 3 },
          { model: "b", total_tests: 10, passed: 6, failed: 4 },
        ],
      },
    ];
    renderTab();
    // Two of the first model's tests never ran; the run is still 10 tests.
    expect((await screen.findAllByText("2 Not run")).length).toBeGreaterThan(0);
  });

  it("shows Running while a run has not finished", async () => {
    state.runs = [{ ...unitRun, status: "in_progress" }];
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
    await screen.findAllByText("50% passed");

    await user.click(screen.getByRole("button", { name: "All passed" }));
    await waitFor(() =>
      expect(lastRunsQuery().get("has_failures")).toBe("false"),
    );

    await user.click(screen.getByRole("button", { name: "Any failed" }));
    await waitFor(() =>
      expect(lastRunsQuery().get("has_failures")).toBe("true"),
    );

    await user.click(screen.getByRole("button", { name: "Any error" }));
    await waitFor(() => expect(lastRunsQuery().get("status")).toBe("failed"));

    await user.click(screen.getByRole("button", { name: "All results" }));
    await waitFor(() => {
      const q = lastRunsQuery();
      expect(q.get("has_failures")).toBeNull();
      expect(q.get("status")).toBeNull();
    });
  });

  it("takes the runs off screen while a new filter is being fetched", async () => {
    const user = setupUser();
    renderTab();
    await screen.findAllByText("50% passed");

    let releaseList: () => void = () => {};
    state.holdList = new Promise<void>((resolve) => {
      releaseList = resolve;
    });
    await user.click(screen.getByRole("button", { name: "All passed" }));

    // The rows of the old filter are gone the moment the button is clicked,
    // rather than sitting there until the new ones arrive.
    await waitFor(() =>
      expect(screen.queryByText("50% passed")).not.toBeInTheDocument(),
    );

    releaseList();
    await screen.findAllByText("50% passed");
  });

  it("asks the backend for model comparisons only when that filter is on", async () => {
    const user = setupUser();
    renderTab();
    await screen.findAllByText("50% passed");
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
    await screen.findAllByText("50% passed");

    state.runs = [];
    state.total = 0;
    await user.click(screen.getByRole("button", { name: "Model comparisons" }));
    await screen.findByText("No evaluations match this filter");
  });

  it("asks for one page at a time", async () => {
    renderTab();
    await screen.findAllByText("50% passed");
    const q = lastRunsQuery();
    expect(q.get("limit")).toBe("50");
    expect(q.get("offset")).toBe("0");
  });

  it("moves to the next page and back", async () => {
    state.runs = [unitRun];
    state.total = 120;
    const user = setupUser();
    renderTab();
    await screen.findAllByText("50% passed");

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
    await screen.findAllByText("50% passed");
    expect(new URLSearchParams(window.location.search).get("page")).toBeNull();

    await user.click(screen.getByRole("button", { name: "Next page" }));
    await waitFor(() =>
      expect(new URLSearchParams(window.location.search).get("page")).toBe("2"),
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

    await screen.findAllByText("50% passed");
    await waitFor(() => expect(lastRunsQuery().get("offset")).toBe("50"));
  });

  it("opens the run window for a plain run", async () => {
    state.runs = [unitRun];
    const user = setupUser();
    renderTab();
    await user.click((await screen.findAllByText("50% passed"))[0]);
    expect(await screen.findByTestId("test-runner")).toHaveTextContent(
      "runner:run-unit",
    );
  });

  it("opens the model comparison window for a benchmark", async () => {
    state.runs = [benchmarkRun];
    const user = setupUser();
    renderTab();
    await user.click((await screen.findAllByText("No results"))[0]);
    expect(await screen.findByTestId("benchmark-results")).toHaveTextContent(
      "bench:run-bench",
    );
  });

  it("reopens the model picker filled in when the comparison window asks to rerun", async () => {
    state.runs = [benchmarkRun];
    const user = setupUser();
    renderTab();
    await user.click((await screen.findAllByText("No results"))[0]);
    await screen.findByTestId("benchmark-results");

    await act(async () => {
      benchmarkResultsProps.onRerun({
        models: ["gpt-4", "claude"],
        testUuids: ["t1", "t2"],
        testNames: ["A", "B"],
        parallelModels: false,
      });
    });

    expect(openCompare).toHaveBeenCalledWith(
      [
        { uuid: "t1", name: "A" },
        { uuid: "t2", name: "B" },
      ],
      false,
      { models: ["gpt-4", "claude"], parallelModels: false },
    );
  });

  it("keeps the comparison on screen until a new one actually exists", async () => {
    state.runs = [benchmarkRun];
    const user = setupUser();
    renderTab();
    await user.click((await screen.findAllByText("Complete"))[0]);
    await screen.findByTestId("benchmark-results");

    await act(async () => {
      benchmarkResultsProps.onRerun({
        models: ["gpt-4"],
        testUuids: ["t1"],
        testNames: ["A"],
      });
    });

    // Backing out of the picker, or having it refused, must leave the reader
    // where they were. The window closes when a comparison is created.
    expect(screen.getByTestId("benchmark-results")).toBeInTheDocument();

    await act(async () => {
      launcherOptions!.onComparisonCreated!();
    });
    expect(screen.queryByTestId("benchmark-results")).not.toBeInTheDocument();
  });

  it("carries no way-to-run choice when the comparison never recorded one", async () => {
    state.runs = [benchmarkRun];
    const user = setupUser();
    renderTab();
    await user.click((await screen.findAllByText("Complete"))[0]);
    await screen.findByTestId("benchmark-results");

    await act(async () => {
      benchmarkResultsProps.onRerun({
        models: ["gpt-4"],
        testUuids: ["t1"],
        testNames: ["A"],
      });
    });

    expect(openCompare).toHaveBeenCalledWith([{ uuid: "t1", name: "A" }], false, {
      models: ["gpt-4"],
      parallelModels: undefined,
    });
  });

  it("keeps a test whose name the comparison did not carry", async () => {
    state.runs = [benchmarkRun];
    const user = setupUser();
    renderTab();
    await user.click((await screen.findAllByText("Complete"))[0]);
    await screen.findByTestId("benchmark-results");

    await act(async () => {
      benchmarkResultsProps.onRerun({
        models: ["gpt-4"],
        testUuids: ["t1", "t2"],
        testNames: ["A"],
      });
    });

    // The second test still goes to the picker, so the rerun covers the same
    // tests even when the run carried no name for it.
    expect(openCompare.mock.calls[0][0]).toEqual([
      { uuid: "t1", name: "A" },
      { uuid: "t2", name: "" },
    ]);
  });

  it("points the run window at the rerun it reports", async () => {
    state.runs = [unitRun];
    const user = setupUser();
    renderTab();
    await user.click((await screen.findAllByText("50% passed"))[0]);
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
    state.runs = [{ ...unitRun, uuid: "run-pending", status: "pending" }];
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
    const listCalls = () =>
      (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
        String(url).includes("/runs?"),
      ).length;
    const before = listCalls();
    await waitFor(
      () => expect(listCalls()).toBeGreaterThanOrEqual(before + 2),
      {
        timeout: 8000,
      },
    );
    expect(existsCalls()).toBe(1);
  }, 12000);

  it("leaves a running run alone when a refresh fails", async () => {
    state.runs = [{ ...unitRun, uuid: "run-pending", status: "pending" }];
    // The first read works; every refresh after it fails, as a dropped
    // connection would. The rows already on screen must stay.
    let listCallCount = 0;
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes(`/agent-tests/agent/${AGENT_UUID}/runs`)) {
        listCallCount += 1;
        if (listCallCount > 1) throw new Error("offline");
        return jsonResponse({ items: state.runs, total: state.runs.length });
      }
      return jsonResponse({});
    });

    renderTab();
    await screen.findAllByText("Running");

    // Wait for two failed refreshes rather than for a fixed time.
    await waitFor(() => expect(listCallCount).toBeGreaterThanOrEqual(3), {
      timeout: 8000,
    });

    expect(screen.getAllByText("Running").length).toBeGreaterThan(0);
    // Scoped to the table: "Error" is also one of the filter buttons.
    const table = document.querySelector("table") as HTMLElement;
    expect(table.textContent).not.toContain("Error");
  }, 12000);

  it("keeps an unfinished run up to date", async () => {
    state.runs = [{ ...unitRun, uuid: "run-pending", status: "pending" }];
    // The run finishes between the first read and the next refresh.
    let listCallCount = 0;
    (global.fetch as jest.Mock).mockImplementation(async (url: string) => {
      if (url.includes(`/agent-tests/agent/${AGENT_UUID}/runs`)) {
        listCallCount += 1;
        const runs =
          listCallCount === 1
            ? state.runs
            : [
                {
                  ...unitRun,
                  uuid: "run-pending",
                  status: "done",
                  total_tests: 1,
                  passed: 1,
                  failed: 0,
                  unanswered_tests: 0,
                },
              ];
        return jsonResponse({ items: runs, total: 1 });
      }
      return jsonResponse({});
    });

    renderTab();
    await screen.findAllByText("Running");
    expect(
      (await screen.findAllByText("100% passed", {}, { timeout: 8000 })).length,
    ).toBeGreaterThan(0);
  }, 12000);

  describe("deleting a run", () => {
    /** The delete buttons in the desktop table. */
    const deleteButtons = () =>
      Array.from(
        (document.querySelector("table") as HTMLElement).querySelectorAll(
          'button[aria-label="Delete evaluation"]',
        ),
      ) as HTMLButtonElement[];

    it("deletes the run after the reader confirms, then reads the list back", async () => {
      const user = setupUser();
      state.runs = [{ ...unitRun, name: "Run 4" }];
      renderTab();
      await screen.findAllByText("50% passed");

      await user.click(deleteButtons()[0]);
      // The window for the run must not open: the delete button swallows the
      // row click.
      expect(screen.queryByTestId("test-runner")).not.toBeInTheDocument();
      expect(
        screen.getByText(/Are you sure you want to delete "Evaluation run 4"/),
      ).toBeInTheDocument();

      state.runs = [];
      await user.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() =>
        expect(
          (global.fetch as jest.Mock).mock.calls.some(
            ([url, init]) =>
              String(url) === `${BACKEND}/agent-tests/job/run-unit` &&
              init.method === "DELETE",
          ),
        ).toBe(true),
      );
      await screen.findByText("No evaluations yet");
    });

    it("keeps the confirmation open until the list has been read back", async () => {
      const user = setupUser();
      state.runs = [{ ...unitRun, name: "Run 4" }];
      renderTab();
      await screen.findAllByText("50% passed");

      // Hold the list request that follows the delete, so the moment between
      // the delete answering and the fresh list arriving can be looked at.
      let releaseList: () => void = () => {};
      state.holdList = new Promise<void>((resolve) => {
        releaseList = resolve;
      });

      await user.click(deleteButtons()[0]);
      state.runs = [];
      await user.click(screen.getByRole("button", { name: "Delete" }));

      // The delete has answered, the list has not: the confirmation is still
      // up, saying so, and the row is still the old one.
      await screen.findByText("Deleting...");
      expect(
        screen.getByText(/Are you sure you want to delete/),
      ).toBeInTheDocument();

      releaseList();
      await screen.findByText("No evaluations yet");
      expect(
        screen.queryByText(/Are you sure you want to delete/),
      ).not.toBeInTheDocument();
    });

    it("keeps the run listed when the delete fails", async () => {
      const user = setupUser();
      state.runs = [{ ...unitRun, name: "Run 4" }];
      state.deleteOk = false;
      renderTab();
      await screen.findAllByText("50% passed");

      await user.click(deleteButtons()[0]);
      await user.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(mockToastError).toHaveBeenCalled());
      // The confirmation stays open and the run is still there.
      expect(
        screen.getByText(/Are you sure you want to delete/),
      ).toBeInTheDocument();
    });

    it("steps back a page when the deleted run was the last one on it", async () => {
      const user = setupUser();
      state.runs = [{ ...unitRun, name: "Run 4" }];
      state.total = 51;
      renderTab();
      await screen.findAllByText("50% passed");

      await user.click(screen.getByRole("button", { name: "Next page" }));
      await waitFor(() => expect(lastRunsQuery().get("offset")).toBe("50"));

      await user.click(deleteButtons()[0]);
      state.total = 50;
      await user.click(screen.getByRole("button", { name: "Delete" }));

      await waitFor(() => expect(lastRunsQuery().get("offset")).toBe("0"));
    });

    it("cannot delete a run that is still going", async () => {
      state.runs = [{ ...unitRun, uuid: "run-live", status: "in_progress" }];
      renderTab();
      await screen.findAllByText("Running");

      expect(deleteButtons()[0]).toBeDisabled();
    });
  });
});

describe("the Run column width", () => {
  it("gets wider when its edge is dragged right, and stops at the widest", async () => {
    renderTab();
    await screen.findAllByText("50% passed");
    const header = screen.getByRole("columnheader", { name: /Run/ });
    const handle = screen.getByTestId("run-column-resize");
    expect(header).toHaveStyle({ width: "240px" });
    // The heading itself reads as "Run", with nothing about the drag edge.
    expect(header).toHaveAccessibleName("Run");

    act(() => {
      handle.dispatchEvent(
        new MouseEvent("mousedown", { bubbles: true, clientX: 100 }),
      );
      document.dispatchEvent(
        new MouseEvent("mousemove", { bubbles: true, clientX: 160 }),
      );
    });
    expect(header).toHaveStyle({ width: "300px" });

    act(() => {
      document.dispatchEvent(
        new MouseEvent("mousemove", { bubbles: true, clientX: 9999 }),
      );
      document.dispatchEvent(new MouseEvent("mouseup", { bubbles: true }));
    });
    expect(header).toHaveStyle({ width: "560px" });
  }, 10000);
});

describe("running tests from an open results window", () => {
  const tests = [{ uuid: "t1", name: "A" }];
  const runsListCalls = () =>
    (global.fetch as jest.Mock).mock.calls.filter(([url]) =>
      String(url).includes("/runs?"),
    ).length;

  it("passes the agent's launcher settings through and draws the launcher dialogs", async () => {
    render(
      <RunsTabContent
        agentUuid={AGENT_UUID}
        agentName="Test agent"
        agentType="connection"
        connectionVerified={false}
        supportsBenchmark
        benchmarkProvider="google"
      />,
    );
    await screen.findAllByText("50% passed");
    expect(screen.getByTestId("launcher-dialogs")).toBeInTheDocument();
    expect(launcherOptions).toMatchObject({
      agentUuid: AGENT_UUID,
      agentName: "Test agent",
      agentType: "connection",
      connectionVerified: false,
      supportsBenchmark: true,
      benchmarkProvider: "google",
    });
  });

  it("runs or compares the ticked tests from the run window", async () => {
    state.runs = [unitRun];
    const user = setupUser();
    renderTab();
    await user.click((await screen.findAllByText("50% passed"))[0]);
    await screen.findByTestId("test-runner");

    runnerProps.onRunTests(tests);
    expect(confirmTestRun).toHaveBeenCalledWith(tests, false, "window");
    runnerProps.onCompareTests(tests);
    expect(openCompare).toHaveBeenCalledWith(tests, false);
  });

  it("runs or compares the ticked tests from the model comparison window", async () => {
    state.runs = [benchmarkRun];
    const user = setupUser();
    renderTab();
    await user.click((await screen.findAllByText("No results"))[0]);
    await screen.findByTestId("benchmark-results");

    benchmarkResultsProps.onRunTests(tests);
    expect(confirmTestRun).toHaveBeenCalledWith(tests, false, "window");
    benchmarkResultsProps.onCompareTests(tests);
    expect(openCompare).toHaveBeenCalledWith(tests, false);
  });

  it("opens the new run in the window and reads the list again once it is created", async () => {
    state.runs = [unitRun];
    const user = setupUser();
    renderTab();
    await user.click((await screen.findAllByText("50% passed"))[0]);
    await screen.findByTestId("test-runner");
    const before = runsListCalls();

    await act(async () => {
      launcherOptions?.onRunCreated("run-new", "window");
    });
    expect(screen.getByTestId("test-runner")).toHaveTextContent(
      "runner:run-new",
    );
    expect(new URLSearchParams(window.location.search).get("runId")).toBe(
      "run-new",
    );
    await waitFor(() => expect(runsListCalls()).toBe(before + 1));
  });

  it("closes the open window and reads the list again once a comparison is created", async () => {
    state.runs = [benchmarkRun];
    const user = setupUser();
    renderTab();
    await user.click((await screen.findAllByText("No results"))[0]);
    await screen.findByTestId("benchmark-results");
    expect(new URLSearchParams(window.location.search).get("runId")).toBe(
      "run-bench",
    );
    const before = runsListCalls();

    await act(async () => {
      launcherOptions?.onComparisonCreated?.();
    });
    expect(screen.queryByTestId("benchmark-results")).not.toBeInTheDocument();
    expect(screen.queryByTestId("test-runner")).not.toBeInTheDocument();
    expect(new URLSearchParams(window.location.search).get("runId")).toBeNull();
    await waitFor(() => expect(runsListCalls()).toBe(before + 1));
  });

});
