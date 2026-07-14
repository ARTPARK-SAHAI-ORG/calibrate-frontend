"use client";

import React, { useMemo } from "react";
import { LeaderboardTab, type LeaderboardColumn } from "./LeaderboardTab";
import { getColorMap } from "@/components/charts/LeaderboardBarChart";
import {
  ParetoFrontierChart,
  type ParetoModelPoint,
} from "@/components/charts/ParetoFrontierChart";
import {
  benchmarkRatingEvaluatorCaption,
  buildBenchmarkCombinedLeaderboardPayload,
  type BenchmarkCombinedLeaderboardPayload,
  type BenchmarkLeaderboardSummaryRow,
  type BenchmarkModelLike,
} from "@/lib/benchmarkEvaluatorSummary";
import {
  formatLatencyMs,
  formatCostUsd,
  formatTokens,
  formatPercent,
  formatRating,
  METRIC_LABELS,
} from "@/lib/llmMetrics";

type BenchmarkCombinedLeaderboardProps = {
  leaderboardSummary?: BenchmarkLeaderboardSummaryRow[];
  modelResults: BenchmarkModelLike[];
  /** Table/chart labels for `model`; default shows the API string unchanged. */
  formatModelName?: (model: string) => string;
  filename: string;
  benchmarkScoreLabel?: string;
  className?: string;
};

function columnsFromPayload(
  payload: BenchmarkCombinedLeaderboardPayload,
  formatModelName: (model: string) => string,
  benchmarkScoreLabel: string,
): LeaderboardColumn[] {
  const cols: LeaderboardColumn[] = [
    {
      key: "model",
      header: "Model",
      render: (v) => formatModelName(String(v)),
    },
  ];

  if (payload.plan.showPassedTotal) {
    cols.push({ key: "passed", header: "Passed" }, { key: "total", header: "Total" });
  }

  if (payload.plan.showOverallPassRate) {
    cols.push({
      key: "pass_rate",
      header: benchmarkScoreLabel,
      render: (v) =>
        typeof v === "number" && Number.isFinite(v) ? (
          formatPercent(v)
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    });
  }

  if (payload.plan.showLatency) {
    cols.push({
      key: "avg_latency_ms",
      header: METRIC_LABELS.latency,
      render: (v) =>
        typeof v === "number" && Number.isFinite(v) ? (
          formatLatencyMs(v)
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    });
  }

  if (payload.plan.showCost) {
    cols.push({
      key: "avg_cost",
      header: METRIC_LABELS.cost,
      render: (v) =>
        typeof v === "number" && Number.isFinite(v) ? (
          formatCostUsd(v)
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    });
  }

  if (payload.plan.showTokens) {
    cols.push({
      key: "avg_tokens",
      header: METRIC_LABELS.tokens,
      render: (v) =>
        typeof v === "number" && Number.isFinite(v) ? (
          formatTokens(v)
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    });
  }

  // Tool-call pass rate sits after the cost/token metrics, just before the
  // per-evaluator columns.
  if (payload.plan.showToolCallPassRate) {
    cols.push({
      key: "tool_call_pass_rate",
      header: "Tool-call pass rate (%)",
      render: (v) =>
        typeof v === "number" && Number.isFinite(v) ? (
          formatPercent(v)
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    });
  }

  for (const ev of payload.plan.evaluators) {
    const header =
      ev.type === "rating"
        ? benchmarkRatingEvaluatorCaption(ev.label, ev.scale_min, ev.scale_max)
        : ev.label;
    cols.push({
      key: ev.dataKey,
      header,
      render: (v) =>
        typeof v === "number" && Number.isFinite(v) ? (
          ev.type === "binary" ? formatPercent(v) : formatRating(v)
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    });
  }

  return cols;
}

/**
 * Benchmark leaderboard: one table (overall pass rate + per-evaluator columns) and
 * one chart grid (two charts per row), aligned with STT/TTS `LeaderboardTab`.
 */
export function BenchmarkCombinedLeaderboard({
  leaderboardSummary,
  modelResults,
  formatModelName = (m: string) => m,
  filename,
  benchmarkScoreLabel = "Test pass rate (%)",
  className,
}: BenchmarkCombinedLeaderboardProps) {
  const payload = useMemo(
    () =>
      buildBenchmarkCombinedLeaderboardPayload(
        leaderboardSummary,
        modelResults,
        benchmarkScoreLabel,
      ),
    [leaderboardSummary, modelResults, benchmarkScoreLabel],
  );

  const columns = useMemo(
    () =>
      payload
        ? columnsFromPayload(payload, formatModelName, benchmarkScoreLabel)
        : [],
    [payload, formatModelName, benchmarkScoreLabel],
  );

  // Pareto points (cost vs accuracy, latency as bubble size). Only meaningful
  // when both a cost and an overall pass rate are available for the run.
  const paretoPoints = useMemo<ParetoModelPoint[]>(() => {
    if (!payload) return [];
    return payload.rows.map((row) => ({
      model: String(row.model),
      label: formatModelName(String(row.model)),
      cost: row.avg_cost as number,
      passRate: row.pass_rate as number,
      latency: row.avg_latency_ms as number | undefined,
    }));
  }, [payload, formatModelName]);

  const paretoColorMap = useMemo(
    () => getColorMap(paretoPoints.map((p) => p.model)),
    [paretoPoints],
  );

  if (!payload || payload.rows.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-muted-foreground">No leaderboard data available</p>
      </div>
    );
  }

  const showPareto = payload.plan.showCost && payload.plan.showOverallPassRate;

  return (
    <LeaderboardTab
      className={className}
      columns={columns}
      data={payload.rows}
      charts={payload.chartRows}
      filename={filename}
      getLabel={(key) => formatModelName(key)}
      nameKey="model"
      afterTable={
        showPareto ? (
          <ParetoFrontierChart
            points={paretoPoints}
            colorMap={paretoColorMap}
            passRateLabel={benchmarkScoreLabel.replace(/\s*\(%\)\s*$/, "")}
            filename={`${filename}-pareto`}
          />
        ) : undefined
      }
    />
  );
}
