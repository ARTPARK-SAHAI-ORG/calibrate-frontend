// Builders for the optimistic "pending" run row shown the instant a run/
// benchmark is started, before the first poll lands. Shared by the agent Tests
// tab (`TestRun`) and the global Tests page (`AllRun`) — `AllRun` is a superset,
// so callers needing it spread the result and add their extra fields.

import type { BenchmarkModelVariant } from "./benchmarkModelSettings";

export type OptimisticRunResult = {
  name?: string;
  passed: boolean | null;
  test_case?: { name?: string } | null;
};

/** The common subset of `TestRun` (agent Tests tab) and `AllRun` (Tests page). */
export type OptimisticRun = {
  uuid: string;
  name: string;
  status: "pending";
  type: "llm-unit-test" | "llm-benchmark";
  updated_at: string;
  total_tests: number | null;
  passed: null;
  failed: null;
  results?: OptimisticRunResult[] | null;
  model_results?: { model: string }[] | null;
};

/**
 * Optimistic row for a just-started unit-test run. `updatedAt` is passed in
 * (ISO string) so the helper stays pure and testable rather than reading the
 * clock itself.
 */
export function makeOptimisticTestRun(
  taskId: string,
  tests: { name: string }[],
  updatedAt: string,
): OptimisticRun {
  return {
    uuid: taskId,
    name: "",
    status: "pending",
    type: "llm-unit-test",
    updated_at: updatedAt,
    total_tests: tests.length,
    passed: null,
    failed: null,
    results: tests.map((t) => ({
      name: t.name,
      passed: null,
      test_case: { name: t.name },
    })),
  };
}

/**
 * Optimistic row for a just-started benchmark. `models` may be empty when the
 * caller doesn't yet know them (the row then shows "0 models" until the poller
 * fills it in).
 *
 * A comparison can run the same model twice under different settings, so a
 * model may arrive as a variant. The row stores the variant's id, the same
 * string every result of that row comes back keyed by, so the optimistic row
 * and the polled one are the same row.
 */
export function makeOptimisticBenchmarkRun(
  taskId: string,
  models: string[] | BenchmarkModelVariant[],
  updatedAt: string,
): OptimisticRun {
  return {
    uuid: taskId,
    name: "Model comparison",
    status: "pending",
    type: "llm-benchmark",
    updated_at: updatedAt,
    total_tests: null,
    passed: null,
    failed: null,
    model_results: (models as (string | BenchmarkModelVariant)[]).map((m) => ({
      model: typeof m === "string" ? m : m.id,
    })),
  };
}
