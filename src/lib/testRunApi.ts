import { getDefaultHeaders } from "./api";
import type { AggStat, LatencyStat } from "./llmMetrics";
import type {
  TestCaseOutput,
  TestCaseData,
  JudgeResult,
  TestRunEvaluator,
} from "@/components/test-results/shared";

export type ChatMessage = {
  role: "user" | "agent" | "tool";
  content: string;
  tool_name?: string;
  tool_args?: Record<string, unknown>;
};

export type TestCaseResult = {
  test_uuid?: string;
  test_name?: string;
  name?: string; // Test name from in-progress API response
  status?: "passed" | "failed" | "error";
  passed?: boolean | null; // null means test is still running
  reasoning?: string;
  output?: TestCaseOutput | null;
  test_case?: TestCaseData | null;
  chat_history?: ChatMessage[];
  evaluation?: {
    passed: boolean;
    message?: string;
    details?: Record<string, unknown>;
  };
  /** Per-evaluator verdicts for response tests. Null for tool-call tests
   * and absent for legacy rows. */
  judge_results?: JudgeResult[] | null;
  /** Per-case agent latency (ms) / cost (USD) / total tokens. Lifted to the
   * top level by the backend (not inside `output`). Null while the case is
   * running, for eval-only runs, and — for cost — the `openai` provider. */
  latency_ms?: number | null;
  cost?: number | null;
  total_tokens?: number | null;
  error?: string;
};

export type TestRunStatusResponse = {
  task_id: string;
  name?: string;
  status: string;
  total_tests?: number;
  passed?: number;
  failed?: number;
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
  error?: string;
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

/** Whether a run status means the backend is finished with it. */
export function isTerminalRunStatus(status: string): boolean {
  return status === "done" || status === "completed" || status === "failed";
}
