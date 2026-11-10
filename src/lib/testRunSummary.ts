import { answeredCounts, type TestRowLike } from "./testTypes";

/**
 * Pass/total over the tool-call tests among a run's rows: `total` counts the
 * ones answered and judged, the same denominator as the overall pass rate.
 * Shared by a single run and each model of a comparison.
 */
export function toolCallPassFail(
  rows: readonly (TestRowLike & TestTypeRowLike)[],
): { passed: number; total: number } {
  const { passed, answered } = answeredCounts(rows.filter(isToolCallRow));
  return { passed, total: answered };
}

/** One row of a run, as far as finding the tool-call evaluator needs. */
export type ToolCallEvaluatorRowLike = {
  testCase?: { evaluation?: { type?: string } | null } | null;
  judgeResults?: { evaluator_uuid?: string | null }[] | null;
};

/**
 * The evaluator that judged this run's tool-call tests, or null when the run
 * has none.
 *
 * Found from the rows on purpose. The run's evaluator list does not say what
 * kind each evaluator is, and the evaluator's name can be changed by the
 * workspace, so neither can be trusted. A tool-call test's judge result names
 * the evaluator directly, which cannot drift.
 */
export function toolCallEvaluatorUuidFromRows(
  rows: readonly ToolCallEvaluatorRowLike[],
): string | null {
  for (const row of rows) {
    if (row?.testCase?.evaluation?.type !== "tool_call") continue;
    for (const jr of row.judgeResults ?? []) {
      if (jr?.evaluator_uuid) return jr.evaluator_uuid;
    }
  }
  return null;
}

/** A row, as far as telling what kind of test it ran needs. */
type TestTypeRowLike = {
  test_type?: string | null;
  test_case?: { evaluation?: { type?: string } | null } | null;
};

/**
 * What kind of test a row ran: "response", "general", "tool_call" or
 * "conversation".
 *
 * The backend says so on every case. A run answered before it started saying
 * so has to be read from the test's own config instead, which is only there
 * in full mode. This is the ONE rule for the question; never read either
 * field straight.
 */
export function rowTestType(row: TestTypeRowLike): string | null {
  return row.test_type ?? row.test_case?.evaluation?.type ?? null;
}

/** Whether a row ran a tool-call test. */
export function isToolCallRow(row: TestTypeRowLike): boolean {
  return rowTestType(row) === "tool_call";
}

/**
 * Which test a row ran, as the id to ask the backend for that one case.
 *
 * The backend stamps `test_uuid` on every case. A run answered before it did
 * has only `test_case_id`, which holds the test's id on some runs and its
 * name on others, so it is the fallback rather than the answer. This is the
 * ONE rule for the question; never read either field straight.
 */
export function rowTestUuid(row: {
  test_uuid?: string | null;
  test_case_id?: string | null;
}): string | null {
  return row.test_uuid ?? row.test_case_id ?? null;
}
