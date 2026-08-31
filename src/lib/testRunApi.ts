import { signOut } from "next-auth/react";
import { toast } from "sonner";
import { getDefaultHeaders } from "./api";
import { overEvalLimit } from "./evalLimit";
import { reportError } from "./reportError";
import type { AggStat, LatencyStat } from "./llmMetrics";
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

/** Fetch the full state of a run. The dialog's only source of run content. */
export async function fetchTestRun(
  backendUrl: string,
  accessToken: string | null | undefined,
  taskId: string,
): Promise<TestRunStatusResponse> {
  const response = await fetch(`${backendUrl}/agent-tests/run/${taskId}`, {
    method: "GET",
    headers: getDefaultHeaders(accessToken),
  });

  if (response.status === 401) throw new UnauthorizedError();
  if (!response.ok) throw new Error("Failed to fetch test run");

  return response.json();
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
