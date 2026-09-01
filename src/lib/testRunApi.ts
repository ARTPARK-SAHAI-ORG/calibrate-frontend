import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { getDefaultHeaders } from "./api";
import { overEvalLimit } from "./evalLimit";
import { reportError } from "./reportError";
import type { AggStat, LatencyStat } from "./llmMetrics";
import type { BenchmarkEvaluatorSummaryEntry } from "./benchmarkEvaluatorSummary";
import type {
  TestCaseOutput,
  TestCaseData,
  JudgeResult,
  TestRunEvaluator,
} from "@/components/test-results/shared";

export type TestCaseResult = {
  /** The test this row ran. */
  test_case_id?: string;
  test_name?: string;
  name?: string; // Test name from in-progress API response
  /** null / absent means the test has not finished yet. It never means the
   * test produced no answer — read `unanswered` for that. */
  passed?: boolean | null;
  /** True when the test produced no answer: the agent timed out or returned
   * an error, or the judge could not be reached. `reasoning` then holds why,
   * and `passed: false` on such a row is not a verdict on the agent. */
  unanswered?: boolean;
  /** The judge's reasoning, or — when `unanswered` is true — the error. */
  reasoning?: string;
  output?: TestCaseOutput | null;
  test_case?: TestCaseData | null;
  /** Effective custom inputs the agent received: the agent's default_inputs
   * merged with this case's per-test overrides. Absent when the agent has no
   * custom fields. */
  inputs?: Record<string, unknown> | null;
  /** True when this test never started, because the run was stopped first. */
  not_run?: boolean;
  /** What kind of test this row ran. Sent on every case in both modes. Absent
   * on runs answered before the backend started sending it, which is why
   * `rowTestType` falls back to the test's own config. */
  test_type?: "response" | "general" | "tool_call" | "conversation" | null;
  /** Per-evaluator verdicts for response tests. Null for tool-call tests
   * and absent for legacy rows. */
  judge_results?: JudgeResult[] | null;
  /** Per-case agent latency (ms) / cost (USD). Lifted to the top level by the
   * backend (not inside `output`). Null while the case is running, for
   * eval-only runs, and — for cost — the `openai` provider. */
  latency_ms?: number | null;
  cost?: number | null;
};

export type TestRunStatusResponse = {
  task_id: string;
  status: string;
  /** What the run is called. The automatic "Run 3" unless someone renamed it. */
  name?: string | null;
  total_tests?: number;
  passed?: number;
  failed?: number;
  /** How many of the tests produced no answer. */
  unanswered_tests?: number;
  /** True when the run gave up before it started every test. Never set on a
   * run someone stopped: it comes from a file the backend writes only when a
   * run finishes on its own. */
  stopped_early?: boolean;
  /** True when someone stopped the run before it finished. The tests already
   * answered are kept; the rest were never started. */
  aborted?: boolean;
  results?: TestCaseResult[];
  /** Top-level per-evaluator metadata block. Each entry pins the version the
   * run executed against and carries name, description, output_config,
   * scale_min, scale_max. Backend guarantees an entry for every uuid
   * referenced by judge_results (synthesises stubs for legacy rows). */
  evaluators?: TestRunEvaluator[];
  /** Aggregate per-test latency ({p50,p95,p99,count}; legacy runs use
   * {mean,min,max,count}) plus cost / total tokens ({mean,min,max,count} |
   * null) across the whole run. Null for eval-only runs or before metrics
   * land; cost is also null for the `openai` provider. */
  latency_ms?: LatencyStat;
  cost?: AggStat;
  total_tokens?: AggStat;
  results_s3_prefix?: string;
  /** The test uuids this run executed, in run order. Used to rerun the exact
   * same tests. Absent on runs created before the backend started snapshotting
   * it — the Rerun button is hidden in that case. */
  test_uuids?: string[];
  /** The run's totals for each evaluator that judged something, the same shape
   * a benchmark gives per model. Counted by the backend as it reads the run,
   * so it is there for runs made before this existed. An evaluator that has
   * judged nothing yet is left out rather than shown as a zero.
   *
   * Read it through `runEvaluatorSummary`, so a missing list reads as none.
   * `pass_rate` is out of 100, the same as a benchmark's. */
  evaluator_summary?: BenchmarkEvaluatorSummaryEntry[] | null;
  /** True when the run itself broke. `status` says the same thing; nothing
   * reads this. */
  error?: boolean;
  is_public?: boolean;
  share_token?: string | null;
};

/** Thrown on a 401 so callers can sign the user out. */
export class UnauthorizedError extends Error {
  constructor() {
    super("Unauthorized");
    this.name = "UnauthorizedError";
  }
}

/**
 * Start a run of `testUuids` against `agentUuid` and return its task id.
 *
 * Pass `null` for `testUuids` to run every test linked to the agent (the
 * backend reads the link table when the field is omitted).
 *
 * This is the ONE place a test run is created. Callers own opening the dialog
 * with the returned id — the dialog never creates its own run to view.
 */
export async function startTestRun(
  backendUrl: string,
  accessToken: string | null | undefined,
  agentUuid: string,
  testUuids: string[] | null,
): Promise<string> {
  const response = await fetch(
    `${backendUrl}/agent-tests/agent/${agentUuid}/run`,
    {
      method: "POST",
      headers: {
        ...getDefaultHeaders(accessToken),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(testUuids === null ? {} : { test_uuids: testUuids }),
    },
  );

  if (response.status === 401) throw new UnauthorizedError();
  if (!response.ok) throw new Error("Failed to start test run");

  const result: TestRunStatusResponse = await response.json();
  return result.task_id;
}

/**
 * `startTestRun` plus the two things every caller needs: the workspace limit
 * on how many tests one run may cover, and the failure handling (sign out on a
 * 401, otherwise report the error and show one toast). Returns the new task
 * id, or null when the run was over the limit or could not be started.
 *
 * `testCount` says how big the run is. It defaults to the length of
 * `testUuids`, and only has to be passed when `testUuids` is null (run every
 * test linked to the agent), where the list itself does not say.
 */
export async function startTestRunOrNotify(
  backendUrl: string,
  accessToken: string | null | undefined,
  agentUuid: string,
  testUuids: string[] | null,
  testCount: number = testUuids?.length ?? 0,
): Promise<string | null> {
  if (await overEvalLimit(accessToken, testCount, "tests")) return null;
  try {
    return await startTestRun(backendUrl, accessToken, agentUuid, testUuids);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      await signOut({ callbackUrl: "/login" });
      return null;
    }
    reportError("Error starting test run:", error);
    toast.error("Could not start the test run. Please try again.");
    return null;
  }
}

/**
 * Runs the backend has finished with, so the window can show one again the
 * moment it is reopened instead of downloading it a second time. Only finished
 * runs go in: an unfinished one changes on every poll.
 *
 * One run of 1880 tests is several megabytes, so this holds at most three and
 * drops the oldest. An unbounded cache would grow the tab's memory until it
 * is reloaded. Lives for the session only.
 */
const FINISHED_RUN_CACHE_LIMIT = 3;
const finishedRuns = new Map<string, TestRunStatusResponse>();
/** Cases already read in full, keyed by run and test. A finished case never
 * changes, so reopening a test the reader has already looked at costs
 * nothing. Capped for the same reason as the runs above. */
const CASE_CACHE_LIMIT = 200;
const finishedCases = new Map<string, TestCaseResult>();

/** How much of a run to ask for. `summary` leaves out each case's
 * conversation, the agent's reply, the judges' reasoning and the custom
 * inputs, which is nearly all of the weight. Read one case in full with
 * `fetchTestCase` when someone opens it. */
export type RunDetailMode = "full" | "summary";

/** Newest last, oldest dropped once past `limit`. */
function remember<T>(store: Map<string, T>, key: string, value: T, limit: number) {
  store.delete(key);
  store.set(key, value);
  if (store.size > limit) {
    store.delete(store.keys().next().value as string);
  }
}

/** The remembered copy of a finished run, if there is one. */
export function getCachedTestRun(
  taskId: string,
  mode: RunDetailMode = "full",
): TestRunStatusResponse | undefined {
  return finishedRuns.get(`${taskId}|${mode}`);
}

/** Clears the remembered runs and cases. For tests. */
export function clearTestRunCache(): void {
  finishedRuns.clear();
  finishedCases.clear();
}

/**
 * Fetch a run. `summary` gives every case's name and verdict without the
 * weight behind them, which is what the list on screen needs; `full` is
 * unchanged and still carries everything.
 */
export async function fetchTestRun(
  backendUrl: string,
  accessToken: string | null | undefined,
  taskId: string,
  mode: RunDetailMode = "full",
): Promise<TestRunStatusResponse> {
  const query = mode === "summary" ? "?mode=summary" : "";
  const response = await fetch(
    `${backendUrl}/agent-tests/run/${taskId}${query}`,
    {
      method: "GET",
      headers: getDefaultHeaders(accessToken),
    },
  );

  if (response.status === 401) throw new UnauthorizedError();
  if (!response.ok) throw new Error("Failed to fetch test run");

  const run: TestRunStatusResponse = await response.json();
  if (isTerminalRunStatus(run.status)) {
    remember(finishedRuns, `${taskId}|${mode}`, run, FINISHED_RUN_CACHE_LIMIT);
  }
  return run;
}

/** The remembered copy of a case read in full, if there is one. */
export function getCachedTestCase(
  taskId: string,
  testCaseId: string,
  model?: string | null,
): TestCaseResult | undefined {
  return finishedCases.get(`${taskId}|${testCaseId}|${model ?? ""}`);
}

/**
 * One case in full: the conversation, the agent's reply, and each evaluator's
 * verdict and reasoning. The same object shape as one entry of a run's
 * `results` in full mode.
 *
 * One route serves a plain run and a model comparison alike; a comparison runs
 * every test once per model, so it needs `model` to say which answer to read.
 * A case still running has no id yet and cannot be asked for.
 */
export async function fetchTestCase(
  backendUrl: string,
  accessToken: string | null | undefined,
  taskId: string,
  testCaseId: string,
  model?: string | null,
): Promise<TestCaseResult> {
  const cached = getCachedTestCase(taskId, testCaseId, model);
  if (cached) return cached;

  const query = model ? `?model=${encodeURIComponent(model)}` : "";
  const response = await fetch(
    `${backendUrl}/agent-tests/run/${taskId}/results/${testCaseId}${query}`,
    {
      method: "GET",
      headers: getDefaultHeaders(accessToken),
    },
  );

  if (response.status === 401) throw new UnauthorizedError();
  if (!response.ok) throw new Error("Failed to fetch the test case");

  const testCase: TestCaseResult = await response.json();
  remember(
    finishedCases,
    `${taskId}|${testCaseId}|${model ?? ""}`,
    testCase,
    CASE_CACHE_LIMIT,
  );
  return testCase;
}

/**
 * Rename a run, or clear the name back to the automatic one by passing an
 * empty string. One route covers a plain evaluation run and a model
 * comparison alike. Returns the name as it now reads, which for a cleared
 * name is the automatic one the backend gives back (e.g. "Run 3").
 */
export async function renameRun(
  backendUrl: string,
  accessToken: string | null | undefined,
  taskId: string,
  name: string,
): Promise<string> {
  const response = await fetch(`${backendUrl}/agent-tests/run/${taskId}/name`, {
    method: "PATCH",
    headers: {
      ...getDefaultHeaders(accessToken),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name: name.trim() || null }),
  });

  if (response.status === 401) throw new UnauthorizedError();
  if (!response.ok) throw new Error("Failed to rename the run");

  // The remembered copies now have the old name on them, so forget them.
  finishedRuns.delete(`${taskId}|full`);
  finishedRuns.delete(`${taskId}|summary`);

  const result: { name?: string | null } = await response.json();
  return result.name ?? "";
}

/**
 * Stop a run that is still going. One route covers both a plain test run and
 * a model comparison, since the backend treats them as the same kind of job.
 *
 * The reply carries the run's id, its status and `aborted`, and nothing else:
 * read the results back from the endpoint the caller was already polling.
 */
export async function abortRun(
  backendUrl: string,
  accessToken: string | null | undefined,
  taskId: string,
): Promise<void> {
  const response = await fetch(
    `${backendUrl}/agent-tests/run/${taskId}/abort`,
    {
      method: "POST",
      headers: getDefaultHeaders(accessToken),
    },
  );

  if (response.status === 401) throw new UnauthorizedError();
  if (!response.ok) throw new Error("Failed to stop the run");
}

/**
 * `abortRun` plus the failure handling every caller needs: sign out on a 401,
 * otherwise report the error and show one toast. Returns whether the run was
 * stopped, so the caller knows whether to read it back.
 */
export async function abortRunOrNotify(
  backendUrl: string,
  accessToken: string | null | undefined,
  taskId: string,
): Promise<boolean> {
  try {
    await abortRun(backendUrl, accessToken, taskId);
    return true;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      await signOut({ callbackUrl: "/login" });
      return false;
    }
    reportError("Error stopping test run:", error);
    toast.error("Could not stop the run. Please try again.");
    return false;
  }
}

/** Whether a run status means the backend is finished with it. */
export function isTerminalRunStatus(status: string): boolean {
  return status === "done" || status === "completed" || status === "failed";
}

/**
 * Delete a run and the results it produced. One route covers a plain
 * evaluation run and a model comparison alike.
 *
 * Only call this for a run that has finished. Deleting a run still going
 * removes the record but does not stop the run: the backend holds no handle
 * on the work, so it keeps going with nowhere left to report to.
 */
export async function deleteRun(
  backendUrl: string,
  accessToken: string | null | undefined,
  taskId: string,
): Promise<void> {
  const response = await fetch(`${backendUrl}/agent-tests/job/${taskId}`, {
    method: "DELETE",
    headers: getDefaultHeaders(accessToken),
  });

  if (response.status === 401) throw new UnauthorizedError();
  if (!response.ok) throw new Error("Failed to delete the run");
}

/**
 * `deleteRun` plus the failure handling every caller needs: sign out on a 401,
 * otherwise report the error and show one toast. Returns whether the run was
 * deleted, so the caller knows whether to read the list back.
 */
export async function deleteRunOrNotify(
  backendUrl: string,
  accessToken: string | null | undefined,
  taskId: string,
): Promise<boolean> {
  try {
    await deleteRun(backendUrl, accessToken, taskId);
    return true;
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      await signOut({ callbackUrl: "/login" });
      return false;
    }
    reportError("Error deleting test run:", error);
    toast.error("Could not delete the evaluation. Please try again.");
    return false;
  }
}
