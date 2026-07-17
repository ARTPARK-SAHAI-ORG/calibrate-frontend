import {
  makeOptimisticTestRun,
  makeOptimisticBenchmarkRun,
} from "../optimisticRuns";

const NOW = "2026-01-01T00:00:00.000Z";

describe("makeOptimisticTestRun", () => {
  it("builds a pending unit-test row with one result per test", () => {
    const run = makeOptimisticTestRun(
      "task-1",
      [{ name: "A" }, { name: "B" }],
      NOW,
    );
    expect(run).toEqual({
      uuid: "task-1",
      name: "",
      status: "pending",
      type: "llm-unit-test",
      updated_at: NOW,
      total_tests: 2,
      passed: null,
      failed: null,
      results: [
        { name: "A", passed: null, test_case: { name: "A" } },
        { name: "B", passed: null, test_case: { name: "B" } },
      ],
    });
  });

  it("handles an empty test list (total_tests 0, no result rows)", () => {
    const run = makeOptimisticTestRun("task-2", [], NOW);
    expect(run.total_tests).toBe(0);
    expect(run.results).toEqual([]);
  });
});

describe("makeOptimisticBenchmarkRun", () => {
  it("builds a pending benchmark row with one entry per model", () => {
    const run = makeOptimisticBenchmarkRun("task-3", ["gpt-4", "claude"], NOW);
    expect(run).toEqual({
      uuid: "task-3",
      name: "Benchmark",
      status: "pending",
      type: "llm-benchmark",
      updated_at: NOW,
      total_tests: null,
      passed: null,
      failed: null,
      model_results: [{ model: "gpt-4" }, { model: "claude" }],
    });
  });

  it("supports an unknown model set (empty → shows 0 models)", () => {
    const run = makeOptimisticBenchmarkRun("task-4", [], NOW);
    expect(run.model_results).toEqual([]);
  });
});
