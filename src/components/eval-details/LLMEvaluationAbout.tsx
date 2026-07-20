import React from "react";
import { AboutMetricsTable, type MetricDescription } from "./AboutMetricsTable";
import type {
  BenchmarkEvaluatorSummaryEntry,
  BenchmarkCombinedEvaluatorColumn,
} from "@/lib/benchmarkEvaluatorSummary";

// About-tab metric documentation shared by the LLM test-run summary and the
// benchmark leaderboard — both report the same built-in metrics. The point of
// the tab is to spell out what each number means and, critically, that latency
// is a median (p50), not an average, and that cost/tokens are means.

export const LLM_PASS_RATE_ABOUT_METRIC: MetricDescription = {
  key: "pass_rate",
  metric: "Test pass rate",
  description:
    "The percentage of scored tests the agent passed across the run (errored tests are excluded).",
  preference: "Higher is better",
  range: "0 - 100%",
};

export const LLM_TOOL_CALL_PASS_RATE_ABOUT_METRIC: MetricDescription = {
  key: "tool_call_pass_rate",
  metric: "Tool-call pass rate",
  description:
    "Pass rate across tool-call tests only, surfaced separately so tool-call results aren't hidden inside the overall pass rate.",
  preference: "Higher is better",
  range: "0 - 100%",
};

export const LLM_LATENCY_ABOUT_METRIC: MetricDescription = {
  key: "latency",
  metric: "Latency",
  description:
    "Agent response time per test. The reported value is the median (p50) across all tests, not the average; the p95 / p99 tail is shown beneath it.",
  preference: "Lower is better",
  range: "0 - ∞",
};

export const LLM_COST_ABOUT_METRIC: MetricDescription = {
  key: "cost",
  metric: "Average cost",
  description:
    "Mean cost per test in USD (input + output) across all tests. This is an average, not a median.",
  preference: "Lower is better",
  range: "0 - ∞",
};

export const LLM_TOKENS_ABOUT_METRIC: MetricDescription = {
  key: "tokens",
  metric: "Average tokens",
  description:
    "Mean total input + output tokens per test across all tests. This is an average, not a median.",
  preference: "Lower is better",
  range: "0 - ∞",
};

/** Normalised evaluator shape for the About rows — from either surface's data. */
export type AboutEvaluator = {
  key: string;
  label: string;
  description?: string | null;
  type: "binary" | "rating";
  scaleMin?: number | null;
  scaleMax?: number | null;
};

/** Map the test-run summary's evaluator entries into About rows. */
export function evaluatorSummaryToAbout(
  entries: BenchmarkEvaluatorSummaryEntry[] | null | undefined,
): AboutEvaluator[] {
  return (entries ?? []).map((e) => ({
    key: e.metric_key,
    label: e.name ?? e.metric_key,
    description: e.description,
    type: e.type,
    scaleMin: e.type === "rating" ? e.scale_min : undefined,
    scaleMax: e.type === "rating" ? e.scale_max : undefined,
  }));
}

/** Map the benchmark leaderboard's evaluator columns into About rows. */
export function evaluatorColumnsToAbout(
  cols: BenchmarkCombinedEvaluatorColumn[] | null | undefined,
): AboutEvaluator[] {
  return (cols ?? []).map((c) => ({
    key: c.metric_key,
    label: c.label,
    description: c.description,
    type: c.type,
    scaleMin: c.scale_min,
    scaleMax: c.scale_max,
  }));
}

function evaluatorAboutRow(e: AboutEvaluator): MetricDescription {
  const isBinary = e.type === "binary";
  const range = isBinary
    ? "Pass / Fail"
    : typeof e.scaleMin === "number" && typeof e.scaleMax === "number"
      ? `${e.scaleMin} - ${e.scaleMax}`
      : "-";
  return {
    key: e.key,
    metric: e.label,
    description: e.description || "",
    preference: isBinary ? "Pass is better" : "Higher is better",
    range,
  };
}

/**
 * About tab for LLM test runs and benchmarks. Documents the built-in metrics
 * that the run actually reported (each `show*` flag) plus a row per attached
 * evaluator. Pass rate is always shown.
 */
export function LLMEvaluationAbout({
  showToolCalls = false,
  showLatency = false,
  showCost = false,
  showTokens = false,
  evaluators = [],
}: {
  showToolCalls?: boolean;
  showLatency?: boolean;
  showCost?: boolean;
  showTokens?: boolean;
  evaluators?: AboutEvaluator[];
}) {
  return (
    <AboutMetricsTable
      metrics={[
        LLM_PASS_RATE_ABOUT_METRIC,
        ...(showToolCalls ? [LLM_TOOL_CALL_PASS_RATE_ABOUT_METRIC] : []),
        ...(showLatency ? [LLM_LATENCY_ABOUT_METRIC] : []),
        ...(showCost ? [LLM_COST_ABOUT_METRIC] : []),
        ...(showTokens ? [LLM_TOKENS_ABOUT_METRIC] : []),
        ...evaluators.map(evaluatorAboutRow),
      ]}
    />
  );
}
