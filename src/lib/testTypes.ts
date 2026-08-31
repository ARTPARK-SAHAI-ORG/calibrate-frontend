/**
 * Test-type helpers shared across the tests list views.
 *
 * A test's `type` is one of these three backend values. Keeping the
 * human-readable label in one place means a rename only happens here
 * instead of in every table / card that shows the type.
 */
export type TestType = "response" | "tool_call" | "conversation" | "general";

/**
 * Human-readable label for a test type.
 *
 * "response" (a conversation agent's reply) and "general" (a general
 * agent's plain input/output) both show the same name, "Agent Response" —
 * the test type name doesn't distinguish the two, only the test's own
 * config shape does. Unknown / missing types fall back to `fallback`. The
 * agent Tests tab treats anything non-tool_call / non-conversation as
 * "Agent Response" (the default fallback); the standalone /tests page passes
 * "—" so a truly unknown type renders as a dash.
 */
export function testTypeLabel(
  type: string | null | undefined,
  fallback = "Agent Response",
): string {
  switch (type) {
    case "tool_call":
      return "Tool Call";
    case "conversation":
      return "Conversation";
    case "response":
    case "general":
      return "Agent Response";
    default:
      return fallback;
  }
}

/** The test-type filter value: a concrete test type, or "all" for no filter. */
export type TestTypeFilterValue = "all" | TestType;

/**
 * Does a test's type belong under the chosen filter chip?
 *
 * The "response" chip also matches "general" tests. To the reader they are one
 * thing, "Agent Response": a general agent's test and a conversation agent's
 * test are both a reply being judged, and both show that same name. The split
 * lives only in how the test stores its content, so a single chip has to
 * select both or a general agent's tests would have no chip that finds them.
 */
export function matchesTestTypeFilter(
  testType: string | null | undefined,
  filter: TestTypeFilterValue,
): boolean {
  if (filter === "all") return true;
  if (filter === "response")
    return testType === "response" || testType === "general";
  return testType === filter;
}

/**
 * What to call a run that tried the tests against several models at once. The
 * backend names those runs "Benchmark 3"; everywhere a reader can see one, the
 * app calls it a model comparison, which is the word on the button that starts
 * it and on the filter that lists them.
 *
 * Only that automatic name is rewritten. A name someone typed is shown word
 * for word, even one that starts with "Benchmark".
 */
export function modelComparisonName(name?: string | null): string {
  const trimmed = name?.trim();
  if (!trimmed) return "Model comparison";
  return trimmed.replace(/^Benchmark (\d+)$/, "Model comparison $1");
}

/**
 * What to call one run where it is listed. The backend names runs "Run 12" and
 * "Benchmark 3"; on screen those are an evaluation run and a model comparison,
 * the words used on the tab and on the button that starts each one.
 *
 * Only those automatic names are rewritten. A name someone typed is shown word
 * for word, even one that starts with "Run".
 */
export function runDisplayName(
  type: string | null | undefined,
  name?: string | null,
): string {
  if (type === "llm-benchmark") return modelComparisonName(name);
  const trimmed = name?.trim();
  if (!trimmed) return "Evaluation run";
  return trimmed.replace(/^Run (\d+)$/, "Evaluation run $1");
}

/** A test row, trimmed to what the shared rules need. */
export type TestRowLike = {
  unanswered?: boolean | null;
  passed?: boolean | null;
  not_run?: boolean | null;
};

/**
 * Did this test produce no answer at all — the agent timed out, returned an
 * error, or the judge could not be reached?
 *
 * The backend says so outright, and nothing else is a signal. A test that
 * produced no answer comes back with `passed: false`, so a verdict of false
 * cannot be read as "the answer was wrong"; and a missing verdict means only
 * that the test has not finished yet.
 *
 * This is the one rule. The runs list, the run window and the model
 * comparison panel all use it, so no two screens can count differently.
 */
export function isUnanswered(row: TestRowLike): boolean {
  return row.unanswered === true;
}

/**
 * Did this test never start, because the run was stopped before it got there?
 *
 * Different from a test that produced no answer: that one was tried and the
 * agent or the judge failed it. This one was never asked.
 *
 * The backend says so outright with `not_run`. On a stopped run that predates
 * that field, a test with no verdict never ran either: the run is finished, so
 * nothing more is coming for it. `runStopped` must come from `isRunStopped`.
 */
export function isNotRun(row: TestRowLike, runStopped: boolean): boolean {
  if (row.not_run === true) return true;
  return runStopped && (row.passed === null || row.passed === undefined);
}

/** A finished run, trimmed to the counts the buckets need. */
export type RunCountsLike = {
  total_tests?: number | null;
  passed?: number | null;
  failed?: number | null;
  unanswered_tests?: number | null;
  /** True when someone stopped the run before it finished. */
  aborted?: boolean | null;
};

/**
 * Split a finished run into tests that passed, tests answered wrongly, and
 * tests that produced no answer.
 *
 * Read off the run's own counts rather than its rows: the runs list carries
 * the counts but not the rows behind them. Only meaningful for a finished run
 * (callers rule out pending / queued / in progress first). Returns null when
 * the run reports no tests.
 */
export function getRunBreakdown(
  run: RunCountsLike,
): { passed: number; failed: number; unanswered: number } | null {
  const total = run.total_tests ?? 0;
  if (total <= 0) return null;
  // A stopped run counts the tests it never started, which is every test left
  // over once the ones it did run are taken out. Working failures out from the
  // total instead would report each of them as a wrong answer.
  if (isRunStopped(run)) {
    const ranPassed = Math.max(run.passed ?? 0, 0);
    const ranFailed = Math.max(run.failed ?? 0, 0);
    return {
      passed: ranPassed,
      failed: ranFailed,
      unanswered: Math.max(total - ranPassed - ranFailed, 0),
    };
  }
  const passed = Math.max(run.passed ?? 0, 0);
  const unanswered = Math.max(run.unanswered_tests ?? 0, 0);
  const failed = Math.max(total - passed - unanswered, 0);
  return { passed, failed, unanswered };
}

/** A run row as the runs list returns it, trimmed to what the buckets need. */
export type RunStatusLike = {
  status: string;
  failed?: number | null;
  /** True when someone stopped the run before it finished. */
  aborted?: boolean | null;
};

/**
 * Was this run stopped by someone before it finished?
 *
 * The backend says so outright. This is the one rule: the runs list, the run
 * window and the model comparison window all use it, so no two screens can
 * disagree about whether a run was stopped or simply ended.
 */
export function isRunStopped(run: { aborted?: boolean | null }): boolean {
  return run.aborted === true;
}

/**
 * What a stopped run says about itself: how many of its tests ran before it
 * was stopped, out of how many it set out to do.
 *
 * The ONE wording. The run window's summary and the model comparison's
 * leaderboard both say it, so it lives here and neither writes its own. No
 * full stop: a caller that follows it with another sentence adds one.
 */
export function stoppedRunSentence(
  testsRun: number,
  totalTests: number | null,
): string {
  if (testsRun === 0) return "This run was stopped before any test ran";
  if (totalTests && totalTests > 0)
    return `This run was stopped after ${testsRun} of ${totalTests} tests ran`;
  return "This run was stopped before it finished";
}

/**
 * How a run itself went, as opposed to how its tests went. Null while the run
 * is still going, which the run says where its results would be.
 */
export type RunState = "finished" | "stopped" | "error";

/**
 * Which of those a run is. The one rule, so the list of runs and the window
 * that opens from it cannot disagree.
 */
export function runStateOf(run: RunStatusLike): RunState | null {
  if (isRunStopped(run)) return "stopped";
  if (isRunErrored(run)) return "error";
  if (isRunInProgress(run)) return null;
  return "finished";
}

/** The run has not finished yet. */
export function isRunInProgress(run: RunStatusLike): boolean {
  return (
    run.status === "pending" ||
    run.status === "queued" ||
    run.status === "in_progress"
  );
}

/** The run itself broke, so it has no results to read. */
export function isRunErrored(run: RunStatusLike): boolean {
  return run.status === "failed";
}

/** The run finished and every test in it passed. */
export function isRunAllPassed(run: RunStatusLike): boolean {
  return (
    run.status === "done" &&
    (run.failed === null || run.failed === undefined || run.failed === 0)
  );
}

/** The run finished and at least one test in it did not pass. */
export function isRunAnyFailed(run: RunStatusLike): boolean {
  return (
    run.status === "done" &&
    run.failed !== null &&
    run.failed !== undefined &&
    run.failed > 0
  );
}
