/**
 * Test-type helpers shared across the tests list views.
 *
 * A test's `type` is one of these three backend values. Keeping the
 * human-readable label in one place means a rename only happens here
 * instead of in every table / card that shows the type.
 */
export type TestType = "response" | "tool_call" | "conversation";

/**
 * Human-readable label for a test type.
 *
 * Unknown / missing types fall back to `fallback`. The agent Tests tab
 * treats anything non-tool_call / non-conversation as "Next Reply" (the
 * default fallback); the standalone /tests page passes "—" so a truly
 * unknown type renders as a dash.
 */
export function testTypeLabel(
  type: string | null | undefined,
  fallback = "Next Reply",
): string {
  switch (type) {
    case "tool_call":
      return "Tool Call";
    case "conversation":
      return "Conversation";
    case "response":
      return "Next Reply";
    default:
      return fallback;
  }
}

/**
 * Minimal per-test result shape needed to categorise a run. Both the agent
 * Tests tab and the /tests Runs table have richer local `TestRunResult` types;
 * those are structurally compatible with this.
 */
export type UnitTestResultLike = {
  passed: boolean | null;
  status?: string;
  error?: string | null;
};

/**
 * Bucket a unit-test run's per-test results into passed / failed / errored.
 *
 * Genuine failures come back with `passed: false` (evaluation ran and the test
 * did not pass); errored tests never reached evaluation, so they surface with
 * no verdict (`passed: null`) — or, on the detail endpoint, an explicit
 * `error` / `status: "error"`. The runs-list payload omits the `error` field,
 * so the `passed == null` signal is what separates errored from failed here.
 *
 * Only meaningful for terminal runs (callers gate out pending/queued/
 * in_progress first), so a null verdict means errored, not "still running".
 * Returns `null` when the run has no usable per-test results.
 */
export function getUnitTestBreakdown(
  results: UnitTestResultLike[] | null | undefined,
): { passed: number; failed: number; errored: number } | null {
  if (!results || results.length === 0) return null;
  const isPassed = (r: UnitTestResultLike) =>
    r.passed === true || r.status === "passed";
  const isErrored = (r: UnitTestResultLike) =>
    !!r.error || r.status === "error" || r.passed === null || r.passed === undefined;
  const passed = results.filter((r) => isPassed(r)).length;
  const errored = results.filter((r) => !isPassed(r) && isErrored(r)).length;
  const failed = results.length - passed - errored;
  return { passed, failed, errored };
}
