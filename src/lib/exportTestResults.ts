import type {
  TestCaseData,
  TestCaseHistory,
  TestCaseOutput,
} from "@/components/test-results/shared";
import type { ExportColumn } from "@/components/ExportResultsButton";

export type ExportTestRow = {
  name?: string;
  status: "passed" | "failed" | "running" | "pending" | "queued" | "error" | string;
  output?: TestCaseOutput | null;
  testCase?: TestCaseData | null;
  reasoning?: string;
  error?: string;
};

export type ExportBenchmarkRow = {
  model: string;
  name?: string;
  passed: boolean | null;
  reasoning?: string;
  output?: TestCaseOutput | null;
  testCase?: TestCaseData | null;
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

function toolCallsToString(output: TestCaseOutput | null | undefined): string {
  if (!output?.tool_calls || output.tool_calls.length === 0) return "";
  return JSON.stringify(output.tool_calls);
}

const TEST_RUN_COLUMNS: ExportColumn[] = [
  { key: "name", header: "Test name" },
  { key: "status", header: "Status" },
  { key: "agent_response", header: "Agent response" },
  { key: "tool_calls", header: "Tool calls" },
  { key: "reasoning", header: "Reasoning" },
  { key: "history", header: "Conversation history" },
  { key: "error", header: "Error" },
];

export function buildTestRunCsv(results: ExportTestRow[]): {
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
} {
  const rows = results
    .filter((r) => r.status === "passed" || r.status === "failed" || r.status === "error")
    .map((r) => ({
      name: r.name ?? "",
      status: statusLabel(r.status),
      agent_response: r.output?.response ?? "",
      tool_calls: toolCallsToString(r.output ?? undefined),
      reasoning: r.reasoning ?? "",
      history: historyToString(r.testCase?.history),
      error: r.error ?? "",
    }));

  return { columns: TEST_RUN_COLUMNS, rows };
}

const BENCHMARK_COLUMNS: ExportColumn[] = [
  { key: "model", header: "Model" },
  { key: "name", header: "Test name" },
  { key: "status", header: "Status" },
  { key: "agent_response", header: "Agent response" },
  { key: "tool_calls", header: "Tool calls" },
  { key: "reasoning", header: "Reasoning" },
  { key: "history", header: "Conversation history" },
];

export function buildBenchmarkCsv(rows: ExportBenchmarkRow[]): {
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
} {
  const csvRows = rows
    .filter((r) => r.passed !== null)
    .map((r) => ({
      model: r.model,
      name: r.name ?? "",
      status: r.passed ? "passed" : "failed",
      agent_response: r.output?.response ?? "",
      tool_calls: toolCallsToString(r.output ?? undefined),
      reasoning: r.reasoning ?? "",
      history: historyToString(r.testCase?.history),
    }));

  return { columns: BENCHMARK_COLUMNS, rows: csvRows };
}
