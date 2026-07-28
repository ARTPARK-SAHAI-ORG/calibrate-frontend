"use client";

import { useMemo, useState } from "react";
import { getColorMap } from "@/components/charts/LeaderboardBarChart";
import {
  buildBenchmarkCombinedLeaderboardPayload,
  type BenchmarkLeaderboardSummaryRow,
  type BenchmarkModelLike,
} from "@/lib/benchmarkEvaluatorSummary";
import {
  formatCostUsd,
  formatLatencyMs,
  formatPercent,
} from "@/lib/llmMetrics";
import {
  defaultWeights,
  rankModelsByWeights,
  rebalanceWeights,
  weightsFromTemplate,
  type RankingDimension,
  type RankingWeights,
} from "@/lib/benchmarkWeightedRanking";

type BenchmarkWeightedRankingProps = {
  leaderboardSummary?: BenchmarkLeaderboardSummaryRow[];
  modelResults: BenchmarkModelLike[];
  benchmarkScoreLabel?: string;
};

const DIMENSION_META: Record<
  RankingDimension,
  { label: string; hint: string }
> = {
  quality: { label: "Quality", hint: "Higher pass rate is better" },
  cost: { label: "Cost", hint: "Lower cost per run is better" },
  latency: { label: "Latency", hint: "Faster response is better" },
};

const PRESETS: {
  label: string;
  template: Record<RankingDimension, number>;
}[] = [
  { label: "Quality first", template: { quality: 0.7, cost: 0.2, latency: 0.1 } },
  { label: "Cheapest", template: { quality: 0.2, cost: 0.65, latency: 0.15 } },
  { label: "Fastest", template: { quality: 0.2, cost: 0.15, latency: 0.65 } },
  { label: "Balanced", template: { quality: 1, cost: 1, latency: 1 } },
];

const formatModelName = (name: string) => name.replace(/__/g, "/");

/**
 * Weight sliders (quality / cost / latency, always summing to 100%) over a
 * benchmark's models, with a leaderboard that re-orders live as the weights
 * move. Shown above the tradeoff scatter in the Model selection tab. Renders
 * nothing unless at least two of the three metrics are present across the run.
 */
export function BenchmarkWeightedRanking({
  leaderboardSummary,
  modelResults,
  benchmarkScoreLabel = "Test pass rate (%)",
}: BenchmarkWeightedRankingProps) {
  const payload = useMemo(
    () =>
      buildBenchmarkCombinedLeaderboardPayload(
        leaderboardSummary,
        modelResults,
        benchmarkScoreLabel,
      ),
    [leaderboardSummary, modelResults, benchmarkScoreLabel],
  );

  const dims = useMemo<RankingDimension[]>(() => {
    if (!payload) return [];
    const active: RankingDimension[] = [];
    if (payload.plan.showOverallPassRate) active.push("quality");
    if (payload.plan.showCost) active.push("cost");
    if (payload.plan.showLatency) active.push("latency");
    return active;
  }, [payload]);

  const dimKey = dims.join(",");
  const [weights, setWeights] = useState<RankingWeights>(() =>
    defaultWeights(dims),
  );
  // Reset to sensible defaults whenever the available metrics change (e.g. a
  // new run with a different metric set loads into the same open dialog). This
  // is the render-time "adjust state when a prop changes" pattern, not an effect.
  const [prevDimKey, setPrevDimKey] = useState(dimKey);
  if (dimKey !== prevDimKey) {
    setPrevDimKey(dimKey);
    setWeights(defaultWeights(dims));
  }

  const ranked = useMemo(
    () => rankModelsByWeights(payload?.rows ?? [], weights, dims),
    [payload, weights, dims],
  );

  const colorMap = useMemo(
    () => getColorMap(ranked.map((m) => m.model)),
    [ranked],
  );

  // Ranking only means something with at least two competing priorities and
  // more than one model to order.
  if (dims.length < 2 || ranked.length < 2) return null;

  const topScore = ranked[0]?.score || 1;

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-sm md:text-base font-medium text-foreground">
            Rank by your priorities
          </h3>
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            Weights always add up to 100%
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-1">
          Slide to weight what matters. The ranking below updates as you go.
        </p>
      </div>

      <div className="space-y-4 rounded-xl border border-border p-4">
        {dims.map((d) => (
          <div key={d}>
            <div className="flex items-center justify-between text-sm mb-1">
              <span className="font-medium text-foreground">
                {DIMENSION_META[d].label}
              </span>
              <span className="tabular-nums text-muted-foreground">
                {weights[d] ?? 0}%
              </span>
            </div>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={weights[d] ?? 0}
              aria-label={`${DIMENSION_META[d].label} weight`}
              onChange={(e) =>
                setWeights((prev) =>
                  rebalanceWeights(
                    { ...prev, [d]: Number(e.target.value) },
                    d,
                    dims,
                  ),
                )
              }
              className="w-full cursor-pointer accent-foreground"
            />
            <p className="text-xs text-muted-foreground mt-0.5">
              {DIMENSION_META[d].hint}
            </p>
          </div>
        ))}

        <div className="flex flex-wrap gap-2 pt-1">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => setWeights(weightsFromTemplate(p.template, dims))}
              className="text-xs md:text-sm px-3 py-1.5 rounded-md border border-border text-foreground hover:bg-muted/50 transition-colors cursor-pointer"
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <ol className="rounded-xl border border-border overflow-hidden">
        {ranked.map((m) => (
          <li
            key={m.model}
            className="flex items-center gap-3 px-4 py-3 border-b border-border last:border-b-0"
          >
            <span className="w-6 text-center tabular-nums text-sm font-medium text-muted-foreground">
              {m.rank}
            </span>
            <span
              className="h-2.5 w-2.5 rounded-full flex-shrink-0"
              style={{ backgroundColor: colorMap.get(m.model) }}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-foreground truncate">
                {formatModelName(m.model)}
              </div>
              <div className="text-xs text-muted-foreground tabular-nums">
                {formatPercent(m.quality)} pass · {formatCostUsd(m.cost)} ·{" "}
                {formatLatencyMs(m.latency)}
              </div>
            </div>
            <div className="hidden sm:block w-28">
              <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.round((m.score / topScore) * 100)}%`,
                    backgroundColor: colorMap.get(m.model),
                  }}
                />
              </div>
            </div>
            <span className="w-10 text-right text-base font-medium tabular-nums text-foreground">
              {Math.round(m.score)}
            </span>
          </li>
        ))}
      </ol>
    </div>
  );
}
