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
  /** True when the run gave up before it started every test. */
  stopped_early?: boolean | null;
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
  /** How many of the run's tests produced no answer. */
  unanswered_tests?: number | null;
  /** One entry per model on a comparison. */
  model_results?: ModelRunCountsLike[] | null;
  /** True when someone stopped the run before it finished. */
  aborted?: boolean | null;
  /** True when the run gave up before it started every test. */
  stopped_early?: boolean | null;
  /** How many tests were tried but produced no answer. */
  unanswered_tests?: number | null;
  /** How many tests the run set out to do. Read with `unanswered_tests` to
   * tell a run where nothing could be run from one where some tests were. */
  total_tests?: number | null;
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
/** Added to the could-not-be-run note when the run gave up before starting
 * every test. Shared by the run summary and the model comparison note. */
export const STOPPED_EARLY_SENTENCE =
  "The evaluation stopped before it started every test. ";

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
export type RunState =
  "finished" | "gave_up" | "none_run" | "stopped" | "error";

/**
 * Did any test in the run produce no answer? Read off the counts: a single run
 * says so outright, and each model of a comparison answers fewer tests than it
 * was given. A model that does not say how many it passed and failed is left
 * out, since its total covers every test it was meant to run either way.
 */
function someTestNeverRan(run: RunStatusLike): boolean {
  if ((run.unanswered_tests ?? 0) > 0) return true;
  return (run.model_results ?? []).some((model) => {
    const total = model.total_tests ?? 0;
    if (typeof model.passed !== "number" || typeof model.failed !== "number")
      return false;
    return total > 0 && model.passed + model.failed < total;
  });
}

/**
 * Which of those a run is. The one rule, so the list of runs and the window
 * that opens from it cannot disagree.
 */
export function runStateOf(run: RunStatusLike): RunState | null {
  if (isRunStopped(run)) return "stopped";
  if (isRunErrored(run)) return "error";
  if (isRunInProgress(run)) return null;
  // Two ways a run can end without covering every test: it gave up before
  // starting them all, or it started a test that never produced an answer.
  // Neither gets the green tick that says every test ran.
  const unanswered = run.unanswered_tests ?? 0;
  // Nothing was scored at all when every test the run set out to do produced
  // no answer, which reads differently from a run that got part of the way.
  if (unanswered > 0 && unanswered >= (run.total_tests ?? 0)) return "none_run";
  if (run.stopped_early === true || someTestNeverRan(run)) return "gave_up";
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

/** One model's results as a runs-list row carries them. */
export type ModelRunCountsLike = {
  model?: string;
  /** False when this model's run could not be carried out at all. */
  success?: boolean | null;
  total_tests?: number | null;
  passed?: number | null;
  failed?: number | null;
};

/**
 * How a comparison went, as the share of tests each model passed rather than
 * a count. Adding the counts up would report 1,410 tests for a 470-test
 * comparison tried against three models, which is why this reads as a rate.
 *
 * `lowest` and `highest` are the same number when every model passed the same
 * share, and both are null when no model carries counts. Null altogether when
 * there is nothing to say: no counts and no model that failed outright.
 */
export function getModelPassRange(
  models: ModelRunCountsLike[] | null | undefined,
): { lowest: number | null; highest: number | null; failedModels: number } | null {
  const rates: number[] = [];
  let failedModels = 0;
  for (const model of models ?? []) {
    if (model.success === false) {
      failedModels += 1;
      continue;
    }
    // Out of the tests that ran, the same way a single run reads, and only
    // when the model says how many of each it got. A model that ran nothing
    // is still listed with every test it was meant to run, so reading its
    // share against that total would score a run that never happened.
    if (typeof model.passed !== "number" || typeof model.failed !== "number")
      continue;
    const answered = Math.max(model.passed, 0) + Math.max(model.failed, 0);
    if (answered <= 0) continue;
    rates.push((Math.max(model.passed, 0) / answered) * 100);
  }
  if (rates.length === 0) {
    return failedModels > 0 ? { lowest: null, highest: null, failedModels } : null;
  }
  return { lowest: Math.min(...rates), highest: Math.max(...rates), failedModels };
}
