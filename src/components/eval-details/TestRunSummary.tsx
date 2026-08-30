import React, { useState } from "react";
import { Tooltip } from "@/components/Tooltip";
import { WarningTriangleIcon } from "@/components/icons";
import { RESULT_TAB_LABELS } from "@/components/ui";
import { EvaluatorPreviewModal } from "@/components/evaluators/EvaluatorPreviewModal";
import {
  formatLatencyMs,
  formatCostUsd,
  formatTokens,
  formatPercent,
  formatRating,
  latencyP50,
  latencySubtitle,
  METRIC_LABELS,
  type AggStat,
  type LatencyStat,
} from "@/lib/llmMetrics";
import {
  benchmarkRatingEvaluatorCaption,
  type BenchmarkEvaluatorSummaryEntry,
} from "@/lib/benchmarkEvaluatorSummary";

type TestRunSummaryProps = {
  /** Tests that passed evaluation. */
  passed: number;
  /** Total tests scored (excludes tests that produced no answer; the
   * pass-rate denominator). */
  total: number;
  /** How many tests produced no answer. Above zero, a note says the pass rate
   * does not cover them. */
  unanswered?: number;
  /** True when the run gave up before it started every test. */
  stoppedEarly?: boolean;
  /** True when someone stopped the run before it finished. */
  stopped?: boolean;
  /** Opens the tab listing every test, so the ones that could not be run can
   * be read. Without it the note names the tab but does not link to it. */
  onReviewUnanswered?: () => void;
  /** What that tab is called here: the run window says Results, the shared
   * page says Outputs. */
  /** Aggregate per-test latency block (`{p50,p95,p99,count}`; legacy runs
   * carry `{mean,min,max,count}`). Null for eval-only runs or before metrics
   * land. */
  latency?: LatencyStat;
  /** Aggregate per-test cost block. Null for eval-only runs and for the
   * `openai` provider (no cost reported). */
  cost?: AggStat;
  /** Aggregate per-test total-token block. Null for eval-only runs. */
  tokens?: AggStat;
  /** Pass/total restricted to tool-call tests. When present with a non-zero
   * total, a dedicated "Tool calls" pass-rate card is shown alongside the
   * overall pass rate so tool-call results aren't hidden inside the total. */
  toolCall?: { passed: number; total: number };
  /** The Tool call correctness evaluator in this run, when it has one. Its
   * card already reports the tool-call pass rate, so the dedicated "Tool
   * calls" card is dropped rather than showing the same number twice. Older
   * runs have no such evaluator and keep the card. */
  toolCallEvaluatorUuid?: string | null;
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

// Card footer: a thin pass-rate progress bar with the count beside it
// (`progress` set), or a plain caption line (latency/cost range, rating
// count). Renders nothing when there's neither.
function CardFooter({
  progress,
  subtitle,
}: {
  /** Fill percentage (0–100) for the progress bar. Omit to skip the bar. */
  progress?: number;
  subtitle?: string;
}) {
  if (progress == null && !subtitle) return null;
  if (progress == null) {
    return (
      <div className="text-[11px] text-muted-foreground mt-1.5">{subtitle}</div>
    );
  }
  const pct = Math.max(0, Math.min(100, progress));
  return (
    <div className="flex items-center gap-2 mt-2">
      <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-green-500"
          style={{ width: `${pct}%` }}
        />
      </div>
      {subtitle && (
        <span className="text-[11px] text-muted-foreground tabular-nums shrink-0">
          {subtitle}
        </span>
      )}
    </div>
  );
}

// One metric card (matches the SimulationMetricsGrid card style). `progress`
// adds a pass-rate bar; `subtitle` is the small caption below the value;
// `info` adds a hover tooltip (ⓘ) next to the label.
function MetricCard({
  label,
  value,
  subtitle,
  progress,
  info,
}: {
  label: string;
  value: string;
  subtitle?: string;
  progress?: number;
  info?: string;
}) {
  return (
    <div className="border border-border rounded-xl p-4 bg-muted/10">
      <div className="text-[12px] text-muted-foreground mb-1 flex items-center gap-1.5">
        <span>{label}</span>
        {info && <Tooltip content={info}>{descriptionIcon}</Tooltip>}
      </div>
      <div className="text-[18px] font-semibold text-foreground">{value}</div>
      <CardFooter progress={progress} subtitle={subtitle} />
    </div>
  );
}

// Headline value + caption (+ optional pass-rate bar) for one evaluator
// aggregate. Binary evaluators get the bar; rating evaluators just show the
// mean and the case count.
function evaluatorCardContent(entry: BenchmarkEvaluatorSummaryEntry): {
  label: string;
  value: string;
  subtitle?: string;
  progress?: number;
} {
  const name = entry.name ?? entry.metric_key;
  if (entry.type === "binary") {
    return {
      label: name,
      value: formatPercent(entry.pass_rate),
      subtitle: `${entry.passed}/${entry.total}`,
      progress: entry.pass_rate,
    };
  }
  return {
    label: benchmarkRatingEvaluatorCaption(
      name,
      entry.scale_min,
      entry.scale_max,
    ),
    value: Number.isFinite(entry.scale_max)
      ? `${formatRating(entry.mean)}/${entry.scale_max}`
      : formatRating(entry.mean),
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
  unanswered = 0,
  stoppedEarly = false,
  stopped = false,
  onReviewUnanswered,
  latency,
  cost,
  tokens,
  toolCall,
  toolCallEvaluatorUuid = null,
  evaluatorSummary,
  enableEvaluatorLinks = true,
}: TestRunSummaryProps) {
  // The evaluator whose prompt is on show, opened from a metric card's name.
  // Null until a card is clicked.
  const [previewEvaluator, setPreviewEvaluator] = useState<{
    uuid: string;
    name: string;
  } | null>(null);

  const rate = total > 0 ? (passed / total) * 100 : null;
  const toolCallRate =
    toolCall && toolCall.total > 0
      ? (toolCall.passed / toolCall.total) * 100
      : null;

  const evaluators = evaluatorSummary ?? [];
  const toolCallEvaluatorCharted =
    !!toolCallEvaluatorUuid &&
    evaluators.some((e) => e.evaluator_uuid === toolCallEvaluatorUuid);

  // Caption under each aggregate card. Latency shows its p95/p99 tail (or the
  // legacy min–max range for historical runs); cost/tokens show their min–max
  // range. Skipped for a single sample / identical values / null blocks (which
  // render a plain "—" value).
  const latencyCaption = latencySubtitle(latency);
  const costSubtitle =
    cost && cost.count > 1 && cost.min !== cost.max
      ? `${formatCostUsd(cost.min)} – ${formatCostUsd(cost.max)}`
      : undefined;
  const tokensSubtitle =
    tokens && tokens.count > 1 && tokens.min !== tokens.max
      ? `${formatTokens(tokens.min)} – ${formatTokens(tokens.max)}`
      : undefined;

  return (
    <div className="p-4 md:p-6 space-y-6 overflow-y-auto h-full">
      <div>
        {(unanswered > 0 || stoppedEarly || stopped) && (
          <div className="mb-4 flex gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-foreground">
            <WarningTriangleIcon className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p>
              {unanswered > 0 &&
                (total === 0
                  ? "None of the tests could be run. "
                  : `${unanswered} of ${unanswered + total} tests could not be run and were ignored for calculating the metrics. `)}
              {stopped && "This run was stopped before it finished. "}
              {stoppedEarly &&
                !stopped &&
                "The run stopped before it started every test. "}
              {unanswered > 0 && (
                <>
                  Review the tests that could not be run in the{" "}
                  {onReviewUnanswered ? (
                    <button
                      type="button"
                      onClick={onReviewUnanswered}
                      className="font-medium text-amber-700 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300 cursor-pointer"
                    >
                      {RESULT_TAB_LABELS.outputs} tab
                    </button>
                  ) : (
                    <span className="font-medium">{RESULT_TAB_LABELS.outputs} tab</span>
                  )}
                  .
                </>
              )}
            </p>
          </div>
        )}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            label="Pass rate"
            value={formatPercent(rate)}
            subtitle={`${passed}/${total}`}
            progress={rate ?? undefined}
          />
          <MetricCard
            label={METRIC_LABELS.latency}
            value={formatLatencyMs(latencyP50(latency))}
            subtitle={latencyCaption}
            info="Median (p50) agent response time across all tests"
          />
          <MetricCard
            label={METRIC_LABELS.cost}
            value={formatCostUsd(cost?.mean)}
            subtitle={costSubtitle}
            info="Average cost per test across all tests"
          />
          <MetricCard
            label={METRIC_LABELS.tokens}
            value={formatTokens(tokens?.mean)}
            subtitle={tokensSubtitle}
            info="Average total input + output tokens per test across all tests"
          />
        </div>
      </div>

      {(evaluators.length > 0 ||
        (toolCallRate !== null && !toolCallEvaluatorCharted)) && (
        <div>
          <h2 className="text-base md:text-lg font-semibold mb-3">
            Evaluators
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {/* Tool-call tests are judged by the expected tool calls on the
                test itself, not by an evaluator, so their pass rate sits
                beside the evaluator cards rather than in the run totals. */}
            {toolCallRate !== null && toolCall && !toolCallEvaluatorCharted && (
              <MetricCard
                label="Tool calls"
                value={formatPercent(toolCallRate)}
                subtitle={`${toolCall.passed}/${toolCall.total}`}
                progress={toolCallRate}
                info="Pass rate across tool-call tests only"
              />
            )}
            {evaluators.map((entry) => {
              const { label, value, subtitle, progress } =
                evaluatorCardContent(entry);
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
                  <CardFooter progress={progress} subtitle={subtitle} />
                </>
              );
              if (uuid && enableEvaluatorLinks) {
                const evaluatorName = entry.name ?? entry.metric_key;
                return (
                  <button
                    key={entry.metric_key}
                    type="button"
                    onClick={() =>
                      setPreviewEvaluator({ uuid, name: evaluatorName })
                    }
                    className="group block w-full text-left border border-border rounded-xl p-4 bg-muted/10 hover:border-foreground/40 hover:bg-muted/30 transition-colors cursor-pointer"
                  >
                    {cardInner}
                  </button>
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

      <EvaluatorPreviewModal
        evaluatorUuid={previewEvaluator?.uuid ?? null}
        evaluatorName={previewEvaluator?.name}
        onClose={() => setPreviewEvaluator(null)}
      />
    </div>
  );
}
