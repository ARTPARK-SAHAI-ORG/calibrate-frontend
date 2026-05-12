import type {
  TestCaseData,
  TestCaseHistory,
  TestCaseOutput,
  JudgeResult,
} from "@/components/test-results/shared";
import type { ExportColumn } from "@/components/ExportResultsButton";

export type ExportTestRow = {
  name?: string;
  status:
    | "passed"
    | "failed"
    | "running"
    | "pending"
    | "queued"
    | "error"
    | string;
  output?: TestCaseOutput | null;
  testCase?: TestCaseData | null;
  reasoning?: string;
  /** Per-evaluator verdicts for response tests (null/absent for tool-call
   * and legacy snapshots). Drives the dynamic per-evaluator columns. */
  judgeResults?: JudgeResult[] | null;
};

export type ExportBenchmarkRow = {
  model: string;
  name?: string;
  passed: boolean | null;
  reasoning?: string;
  output?: TestCaseOutput | null;
  testCase?: TestCaseData | null;
  /** Per-evaluator verdicts for response tests (null/absent for tool-call
   * and legacy snapshots). Drives the dynamic per-evaluator columns. */
  judgeResults?: JudgeResult[] | null;
};

function statusLabel(status: string): string {
  if (status === "passed") return "passed";
  if (status === "failed") return "failed";
  if (status === "error") return "error";
  return status;
}

function historyToString(history: TestCaseHistory[] | undefined): string {
  if (!history || history.length === 0) return "";
  return JSON.stringify(history);
}

// Determine whether a row is a tool-call test or a response test. Prefers
// the explicit `evaluation.type` echoed by the API, falls back to peeking
// at the agent output (`tool_calls` present and non-empty ⇒ tool-call).
function isToolCallTest(
  testCase: TestCaseData | null | undefined,
  output: TestCaseOutput | null | undefined,
): boolean {
  const t = testCase?.evaluation?.type;
  if (t === "tool_call") return true;
  if (t === "response") return false;
  return !!output?.tool_calls && output.tool_calls.length > 0;
}

// Format a single evaluator verdict: "true"/"false" for binary, "score/max"
// for rating (or "score" when scale_max is unknown), empty string when the
// evaluator has no result on this row.
function evaluatorVerdict(jr: JudgeResult | undefined): string {
  if (!jr) return "";
  if (jr.match !== null && jr.match !== undefined) {
    return jr.match ? "true" : "false";
  }
  if (jr.score !== null && jr.score !== undefined) {
    return typeof jr.scale_max === "number"
      ? `${jr.score}/${jr.scale_max}`
      : String(jr.score);
  }
  return "";
}

// Stable key for an evaluator: prefer uuid (canonical across runs), fall
// back to name for legacy snapshots that pre-date uuid capture.
function evaluatorKey(jr: JudgeResult): string {
  return jr.evaluator_uuid ? `uuid:${jr.evaluator_uuid}` : `name:${jr.name}`;
}

// Walk every row's `judgeResults` and build the union of evaluators present
// in the batch, preserving first-seen order so columns stay stable across
// re-exports. Returns paired `<name>` / `<name> reasoning` column specs.
type EvaluatorColumn = {
  key: string;         // unique column key (e.g. "eval:uuid:abc")
  reasoningKey: string;
  displayName: string; // header shown in the CSV
  matchKey: string;    // stable key used to look up the row's verdict
};

function collectEvaluatorColumns(
  rows: Array<{ judgeResults?: JudgeResult[] | null }>,
): EvaluatorColumn[] {
  const seen = new Map<string, EvaluatorColumn>();
  const nameCounts = new Map<string, number>();

  for (const row of rows) {
    const jrs = row.judgeResults;
    if (!Array.isArray(jrs)) continue;
    for (const jr of jrs) {
      const key = evaluatorKey(jr);
      if (seen.has(key)) continue;

      // Disambiguate when two distinct evaluators share a display name.
      const baseName = jr.name || "Evaluator";
      const count = (nameCounts.get(baseName) ?? 0) + 1;
      nameCounts.set(baseName, count);
      const displayName = count === 1 ? baseName : `${baseName} (${count})`;

      seen.set(key, {
        key: `eval:${key}`,
        reasoningKey: `eval_reasoning:${key}`,
        displayName,
        matchKey: key,
      });
    }
  }

  return Array.from(seen.values());
}

function buildEvaluatorColumnSpecs(cols: EvaluatorColumn[]): ExportColumn[] {
  const specs: ExportColumn[] = [];
  for (const c of cols) {
    specs.push({ key: c.key, header: c.displayName });
    specs.push({ key: c.reasoningKey, header: `${c.displayName} reasoning` });
  }
  return specs;
}

// Build a key→value map of evaluator verdicts and reasonings for one row.
// Returns empty cells for any evaluator the row didn't include.
function evaluatorCellsForRow(
  judgeResults: JudgeResult[] | null | undefined,
  cols: EvaluatorColumn[],
): Record<string, string> {
  const byKey = new Map<string, JudgeResult>();
  if (Array.isArray(judgeResults)) {
    for (const jr of judgeResults) byKey.set(evaluatorKey(jr), jr);
  }
  const out: Record<string, string> = {};
  for (const c of cols) {
    const jr = byKey.get(c.matchKey);
    out[c.key] = evaluatorVerdict(jr);
    out[c.reasoningKey] = jr?.reasoning ?? "";
  }
  return out;
}

export function buildTestRunCsv(results: ExportTestRow[]): {
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
} {
  const filtered = results.filter(
    (r) => r.status === "passed" || r.status === "failed" || r.status === "error",
  );

  const flags = filtered.map((r) => isToolCallTest(r.testCase, r.output));
  const hasToolCall = flags.some(Boolean);
  const evalCols = collectEvaluatorColumns(filtered);

  const columns: ExportColumn[] = [
    { key: "name", header: "Test name" },
    { key: "status", header: "Status" },
    { key: "history", header: "Conversation history" },
    { key: "agent_response", header: "Agent response" },
    ...(hasToolCall
      ? [
          { key: "tool_call_result", header: "Tool call test result" },
          { key: "tool_call_reasoning", header: "Tool call test reasoning" },
        ]
      : []),
    ...buildEvaluatorColumnSpecs(evalCols),
  ];

  const rows = filtered.map((r, i) => {
    const isToolCall = flags[i];
    return {
      name: r.name ?? "",
      status: statusLabel(r.status),
      history: historyToString(r.testCase?.history),
      agent_response: r.output?.response ?? "",
      ...(hasToolCall
        ? {
            tool_call_result: isToolCall
              ? r.status === "passed"
                ? "true"
                : r.status === "failed"
                  ? "false"
                  : ""
              : "",
            tool_call_reasoning: isToolCall ? (r.reasoning ?? "") : "",
          }
        : {}),
      ...evaluatorCellsForRow(isToolCall ? null : r.judgeResults, evalCols),
    };
  });

  return { columns, rows };
}

export function buildBenchmarkCsv(rows: ExportBenchmarkRow[]): {
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
} {
  const filtered = rows.filter((r) => r.passed !== null);

  const flags = filtered.map((r) => isToolCallTest(r.testCase, r.output));
  const hasToolCall = flags.some(Boolean);
  const evalCols = collectEvaluatorColumns(filtered);

  const columns: ExportColumn[] = [
    { key: "model", header: "Model" },
    { key: "name", header: "Test name" },
    { key: "status", header: "Status" },
    { key: "history", header: "Conversation history" },
    { key: "agent_response", header: "Agent response" },
    ...(hasToolCall
      ? [
          { key: "tool_call_result", header: "Tool call test result" },
          { key: "tool_call_reasoning", header: "Tool call test reasoning" },
        ]
      : []),
    ...buildEvaluatorColumnSpecs(evalCols),
  ];

  const csvRows = filtered.map((r, i) => {
    const isToolCall = flags[i];
    return {
      model: r.model,
      name: r.name ?? "",
      status: r.passed ? "passed" : "failed",
      history: historyToString(r.testCase?.history),
      agent_response: r.output?.response ?? "",
      ...(hasToolCall
        ? {
            tool_call_result: isToolCall ? (r.passed ? "true" : "false") : "",
            tool_call_reasoning: isToolCall ? (r.reasoning ?? "") : "",
          }
        : {}),
      ...evaluatorCellsForRow(isToolCall ? null : r.judgeResults, evalCols),
    };
  });

  return { columns, rows: csvRows };
}
