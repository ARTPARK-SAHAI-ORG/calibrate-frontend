import React from "react";
import Link from "next/link";
import { Tooltip } from "@/components/Tooltip";
import { formatLatencyMs, formatCostUsd, type AggStat } from "@/lib/llmMetrics";
import {
  benchmarkRatingEvaluatorCaption,
  type BenchmarkEvaluatorSummaryEntry,
} from "@/lib/benchmarkEvaluatorSummary";

type TestRunSummaryProps = {
  /** Tests that passed evaluation. */
  passed: number;
  /** Total tests scored (excludes errored tests; the pass-rate denominator). */
  total: number;
  /** Aggregate per-test latency block (`{mean,min,max,count}`). Null for
   * eval-only runs or before metrics land. */
  latency?: AggStat;
  /** Aggregate per-test cost block. Null for eval-only runs and for the
   * `openai` provider (no cost reported). */
  cost?: AggStat;
  /** Per-evaluator aggregates (same shape benchmark uses), single model. */
  evaluatorSummary?: BenchmarkEvaluatorSummaryEntry[] | null;
  /** Disable evaluator detail links for public share pages. */
  enableEvaluatorLinks?: boolean;
};

const descriptionIcon = (
  <svg
    className="w-3.5 h-3.5 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
    />
  </svg>
);

const linkIcon = (
  <svg
    className="ml-auto w-3.5 h-3.5 text-muted-foreground group-hover:text-foreground transition-colors"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
    aria-hidden="true"
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25"
    />
  </svg>
);

// One metric card (matches the SimulationMetricsGrid card style). `subtitle`
// is the small caption under the headline value (e.g. "12/15").
function MetricCard({
  label,
  value,
  subtitle,
}: {
  label: string;
  value: string;
  subtitle?: string;
}) {
  return (
    <div className="border border-border rounded-xl p-4 bg-muted/10">
      <div className="text-[12px] text-muted-foreground mb-1">{label}</div>
      <div className="text-[18px] font-semibold text-foreground">{value}</div>
      {subtitle && (
        <div className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</div>
      )}
    </div>
  );
}

// Headline value + subtitle for one evaluator aggregate.
function evaluatorCardContent(entry: BenchmarkEvaluatorSummaryEntry): {
  label: string;
  value: string;
  subtitle?: string;
} {
  const name = entry.name ?? entry.metric_key;
  if (entry.type === "binary") {
    return {
      label: name,
      value: `${parseFloat(entry.pass_rate.toFixed(1))}%`,
      subtitle: `${entry.passed}/${entry.total} passed`,
    };
  }
  return {
    label: benchmarkRatingEvaluatorCaption(name, entry.scale_min, entry.scale_max),
    value: Number.isFinite(entry.scale_max)
      ? `${parseFloat(entry.mean.toFixed(2))}/${entry.scale_max}`
      : `${parseFloat(entry.mean.toFixed(2))}`,
    subtitle: `mean of ${entry.count}`,
  };
}

/**
 * High-level summary for a single-model LLM test run: overall pass rate,
 * average latency, average cost, and one card per evaluator. Mirrors the
 * benchmark leaderboard's per-evaluator + pass-rate view, minus the
 * cross-model comparison.
 */
export function TestRunSummary({
  passed,
  total,
  latency,
  cost,
  evaluatorSummary,
  enableEvaluatorLinks = true,
}: TestRunSummaryProps) {
  const rate = total > 0 ? (passed / total) * 100 : null;

  const evaluators = evaluatorSummary ?? [];

  // Range subtitle (min–max) for an aggregate, or a "n cases" hint. Only shown
  // when the block is present; null blocks fall through to a plain "—" value.
  const latencySubtitle = latency
    ? `${formatLatencyMs(latency.min)} – ${formatLatencyMs(latency.max)}`
    : undefined;
  const costSubtitle = cost
    ? `${formatCostUsd(cost.min)} – ${formatCostUsd(cost.max)}`
    : undefined;

  return (
    <div className="p-4 md:p-6 space-y-6 overflow-y-auto h-full">
      <div>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
          <MetricCard
            label="Pass rate"
            value={rate !== null ? `${parseFloat(rate.toFixed(1))}%` : "—"}
            subtitle={`${passed}/${total} passed`}
          />
          <MetricCard
            label="Avg latency"
            value={formatLatencyMs(latency?.mean)}
            subtitle={latencySubtitle}
          />
          <MetricCard
            label="Avg cost"
            value={formatCostUsd(cost?.mean)}
            subtitle={costSubtitle}
          />
        </div>
      </div>

      {evaluators.length > 0 && (
        <div>
          <h2 className="text-base md:text-lg font-semibold mb-3">Evaluators</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {evaluators.map((entry) => {
              const { label, value, subtitle } = evaluatorCardContent(entry);
              const uuid = entry.evaluator_uuid;
              const cardInner = (
                <>
                  <div className="text-[12px] text-muted-foreground mb-1 flex items-center gap-1.5">
                    <span>{label}</span>
                    {entry.description && (
                      <Tooltip content={entry.description}>
                        {descriptionIcon}
                      </Tooltip>
                    )}
                    {uuid && enableEvaluatorLinks && linkIcon}
                  </div>
                  <div className="text-[18px] font-semibold text-foreground">
                    {value}
                  </div>
                  {subtitle && (
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {subtitle}
                    </div>
                  )}
                </>
              );
              if (uuid && enableEvaluatorLinks) {
                return (
                  <Link
                    key={entry.metric_key}
                    href={`/evaluators/${uuid}`}
                    className="group block border border-border rounded-xl p-4 bg-muted/10 hover:border-foreground/40 hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    {cardInner}
                  </Link>
                );
              }
              return (
                <div
                  key={entry.metric_key}
                  className="border border-border rounded-xl p-4 bg-muted/10"
                >
                  {cardInner}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
