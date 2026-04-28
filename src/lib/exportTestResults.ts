import type {
  TestCaseData,
  TestCaseHistory,
  TestCaseOutput,
  JudgeResult,
} from "@/components/test-results/shared";
import { normalizeToolCall } from "@/components/test-results/shared";
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
   * and legacy snapshots). When present, drives the "Next reply" cell. */
  judgeResults?: JudgeResult[] | null;
  error?: string;
};

export type ExportBenchmarkRow = {
  model: string;
  name?: string;
  passed: boolean | null;
  reasoning?: string;
  output?: TestCaseOutput | null;
  testCase?: TestCaseData | null;
  /** Per-evaluator verdicts for response tests (null/absent for tool-call
   * and legacy snapshots). When present, drives the "Next reply" cell. */
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

// Multi-line text dump of the agent's tool calls for tool-call tests.
// One block per call (`Tool: <name>` + `Arguments: <json>`), blocks
// separated by a blank line. Routes through `normalizeToolCall` so the
// historical `{name, arguments}` / `{tool, arguments}` / `{function: …}`
// shapes all render consistently.
function toolCallsCell(output: TestCaseOutput | null | undefined): string {
  if (!output?.tool_calls || output.tool_calls.length === 0) return "";
  return output.tool_calls
    .map((tc) => {
      const { toolName, args } = normalizeToolCall(tc);
      const argsStr =
        args && Object.keys(args).length > 0 ? JSON.stringify(args) : "{}";
      return `Tool: ${toolName}\nArguments: ${argsStr}`;
    })
    .join("\n\n");
}

// Multi-line text dump of the per-evaluator verdicts for response tests.
// One block per evaluator: `<name>: <verdict>`, optional `Variables:` list
// (one indented line per `{{var}}: <value>`), and `Reasoning: …` line.
// Falls back to the top-level `reasoning` string for legacy response
// snapshots that pre-date the `judge_results` rollout (rendered as a
// single un-keyed reasoning block).
function nextReplyCell(
  judgeResults: JudgeResult[] | null | undefined,
  reasoning: string | undefined,
): string {
  if (Array.isArray(judgeResults) && judgeResults.length > 0) {
    return judgeResults
      .map((jr) => {
        const lines: string[] = [];

        // Verdict line (binary → Pass/Fail; rating → score / scale_max,
        // or Score: N when scale is unknown).
        let verdict = "—";
        if (jr.match !== null && jr.match !== undefined) {
          verdict = jr.match ? "Pass" : "Fail";
        } else if (jr.score !== null && jr.score !== undefined) {
          verdict =
            typeof jr.scale_max === "number"
              ? `${jr.score} / ${jr.scale_max}`
              : `Score: ${jr.score}`;
        }
        lines.push(`${jr.name}: ${verdict}`);

        // Per-test variable substitutions (frozen at submission time).
        if (
          jr.variable_values &&
          typeof jr.variable_values === "object" &&
          Object.keys(jr.variable_values).length > 0
        ) {
          lines.push("Variables:");
          for (const [name, value] of Object.entries(jr.variable_values)) {
            lines.push(`  ${name}: ${String(value)}`);
          }
        }

        if (jr.reasoning) {
          lines.push(`Reasoning: ${jr.reasoning}`);
        }
        return lines.join("\n");
      })
      .join("\n\n");
  }

  // Legacy response-test fallback: surface the single top-level reasoning
  // (which historically came from the default `default-llm-next-reply`
  // evaluator). Returns empty when no reasoning was captured.
  return reasoning ? `Reasoning: ${reasoning}` : "";
}

const TEST_RUN_COLUMNS: ExportColumn[] = [
  { key: "name", header: "Test name" },
  { key: "status", header: "Status" },
  { key: "history", header: "Conversation history" },
  { key: "agent_response", header: "Agent response" },
  { key: "tool_calls", header: "Tool calls" },
  { key: "next_reply", header: "Next reply" },
  { key: "error", header: "Error" },
];

export function buildTestRunCsv(results: ExportTestRow[]): {
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
} {
  const rows = results
    .filter(
      (r) => r.status === "passed" || r.status === "failed" || r.status === "error",
    )
    .map((r) => {
      const isToolCall = isToolCallTest(r.testCase, r.output);
      return {
        name: r.name ?? "",
        status: statusLabel(r.status),
        history: historyToString(r.testCase?.history),
        agent_response: r.output?.response ?? "",
        tool_calls: isToolCall ? toolCallsCell(r.output ?? undefined) : "",
        next_reply: isToolCall
          ? ""
          : nextReplyCell(r.judgeResults, r.reasoning),
        error: r.error ?? "",
      };
    });

  return { columns: TEST_RUN_COLUMNS, rows };
}

const BENCHMARK_COLUMNS: ExportColumn[] = [
  { key: "model", header: "Model" },
  { key: "name", header: "Test name" },
  { key: "status", header: "Status" },
  { key: "history", header: "Conversation history" },
  { key: "agent_response", header: "Agent response" },
  { key: "tool_calls", header: "Tool calls" },
  { key: "next_reply", header: "Next reply" },
];

export function buildBenchmarkCsv(rows: ExportBenchmarkRow[]): {
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
} {
  const csvRows = rows
    .filter((r) => r.passed !== null)
    .map((r) => {
      const isToolCall = isToolCallTest(r.testCase, r.output);
      return {
        model: r.model,
        name: r.name ?? "",
        status: r.passed ? "passed" : "failed",
        history: historyToString(r.testCase?.history),
        agent_response: r.output?.response ?? "",
        tool_calls: isToolCall ? toolCallsCell(r.output ?? undefined) : "",
        next_reply: isToolCall
          ? ""
          : nextReplyCell(r.judgeResults, r.reasoning),
      };
    });

  return { columns: BENCHMARK_COLUMNS, rows: csvRows };
}
