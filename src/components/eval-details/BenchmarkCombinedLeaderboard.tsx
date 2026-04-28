"use client";

import React, { useMemo } from "react";
import { LeaderboardTab, type LeaderboardColumn } from "./LeaderboardTab";
import {
  benchmarkRatingEvaluatorCaption,
  buildBenchmarkCombinedLeaderboardPayload,
  type BenchmarkCombinedLeaderboardPayload,
  type BenchmarkLeaderboardSummaryRow,
  type BenchmarkModelLike,
} from "@/lib/benchmarkEvaluatorSummary";

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
          `${v.toFixed(1)}%`
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
          ev.type === "binary" ? `${v.toFixed(1)}%` : v.toFixed(2)
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

  if (!payload || payload.rows.length === 0) {
    return (
      <div className="text-center py-12">
        <p className="text-sm text-muted-foreground">No leaderboard data available</p>
      </div>
    );
  }

  return (
    <LeaderboardTab
      className={className}
      columns={columns}
      data={payload.rows}
      charts={payload.chartRows}
      filename={filename}
      getLabel={(key) => formatModelName(key)}
      nameKey="model"
    />
  );
}
