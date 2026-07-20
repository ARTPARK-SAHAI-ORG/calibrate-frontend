"use client";

import { useMemo } from "react";
import {
  ParetoFrontierChart,
  type ParetoModelPoint,
} from "@/components/charts/ParetoFrontierChart";
import { getColorMap } from "@/components/charts/LeaderboardBarChart";
import {
  buildBenchmarkCombinedLeaderboardPayload,
  type BenchmarkLeaderboardSummaryRow,
  type BenchmarkModelLike,
} from "@/lib/benchmarkEvaluatorSummary";

type BenchmarkTopPicksProps = {
  leaderboardSummary?: BenchmarkLeaderboardSummaryRow[];
  modelResults: BenchmarkModelLike[];
  filename: string;
  benchmarkScoreLabel?: string;
};

/**
 * Cost / quality / speed tradeoff view for a benchmark's models — the Pareto
 * scatter lifted out of BenchmarkCombinedLeaderboard so it can stand on its own.
 */
export function BenchmarkTopPicks({
  leaderboardSummary,
  modelResults,
  filename,
  benchmarkScoreLabel = "Test pass rate (%)",
}: BenchmarkTopPicksProps) {
  const payload = useMemo(
    () =>
      buildBenchmarkCombinedLeaderboardPayload(
        leaderboardSummary,
        modelResults,
        benchmarkScoreLabel,
      ),
    [leaderboardSummary, modelResults, benchmarkScoreLabel],
  );

  const paretoPoints = useMemo<ParetoModelPoint[]>(
    () =>
      (payload?.rows ?? []).map((row) => ({
        model: String(row.model),
        label: String(row.model),
        cost: row.avg_cost as number,
        passRate: row.pass_rate as number,
        latency: row.avg_latency_ms as number | undefined,
      })),
    [payload],
  );

  const paretoColorMap = useMemo(
    () => getColorMap(paretoPoints.map((p) => p.model)),
    [paretoPoints],
  );

  // Nothing to plot without both a cost and an overall pass rate. The parent
  // gates the Top picks tab on the same check (hasBenchmarkTopPicks), so this is
  // a safety net rather than a visible empty state.
  const showPareto =
    !!payload &&
    payload.rows.length > 0 &&
    payload.plan.showCost &&
    payload.plan.showOverallPassRate;
  if (!showPareto) return null;

  return (
    <ParetoFrontierChart
      points={paretoPoints}
      colorMap={paretoColorMap}
      passRateLabel={benchmarkScoreLabel.replace(/\s*\(%\)\s*$/, "")}
      filename={`${filename}-pareto`}
    />
  );
}
