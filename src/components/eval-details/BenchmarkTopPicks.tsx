"use client";

import { useMemo } from "react";
import { displayModelName } from "@/lib/modelName";
import {
  ParetoFrontierChart,
  type ParetoModelPoint,
} from "@/components/charts/ParetoFrontierChart";
import { getColorMap } from "@/components/charts/LeaderboardBarChart";
import type { BenchmarkCombinedLeaderboardPayload } from "@/lib/benchmarkEvaluatorSummary";

type BenchmarkTopPicksProps = {
  /** The leaderboard rows, built once by the caller from the run. */
  payload: BenchmarkCombinedLeaderboardPayload | null;
  filename: string;
  benchmarkScoreLabel?: string;
};

/**
 * Cost / quality / speed tradeoff view for a benchmark's models — the Pareto
 * scatter lifted out of BenchmarkCombinedLeaderboard so it can stand on its own.
 */
export function BenchmarkTopPicks({
  payload,
  filename,
  benchmarkScoreLabel = "Test pass rate (%)",
}: BenchmarkTopPicksProps) {
  const paretoPoints = useMemo<ParetoModelPoint[]>(
    () =>
      (payload?.rows ?? []).map((row) => ({
        model: String(row.model),
        label: displayModelName(String(row.model)),
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

  return (
    <ParetoFrontierChart
      points={paretoPoints}
      colorMap={paretoColorMap}
      title="Quality vs cost vs latency tradeoff"
      passRateLabel={benchmarkScoreLabel.replace(/\s*\(%\)\s*$/, "")}
      filename={`${filename}-pareto`}
    />
  );
}
