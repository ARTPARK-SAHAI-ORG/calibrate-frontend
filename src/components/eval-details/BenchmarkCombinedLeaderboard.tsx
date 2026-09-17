"use client";

import React, { useMemo } from "react";
import { LeaderboardTab, type LeaderboardColumn } from "./LeaderboardTab";
import { RunNote } from "./RunNote";
import { stoppedRunSentence } from "@/lib/testTypes";
import {
  benchmarkAnsweredPassFail,
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
import { RESULT_TAB_LABELS } from "@/components/ui";
import { displayModelName } from "@/lib/modelName";

type BenchmarkCombinedLeaderboardProps = {
  leaderboardSummary?: BenchmarkLeaderboardSummaryRow[];
  modelResults: BenchmarkModelLike[];
  /** Table/chart labels for `model`; defaults to the model without its company. */
  formatModelName?: (model: string) => string;
  filename: string;
  benchmarkScoreLabel?: string;
  className?: string;
  /** Opens the tab listing every test, so the ones that could not be run can
   * be read. Without it the note names the tab but does not link to it. */
  onReviewUnanswered?: () => void;
  /** True when someone stopped the run before it finished. */
  runStopped?: boolean;
};

/**
 * The note above the table when some tests produced no answer. Says how many
 * were left out, since the pass rate covers only the tests each model
 * answered. When the models did not all lose the same tests, it says so
 * without a count rather than picking one model's number.
 */
function UnansweredNote({
  modelResults,
  onReviewUnanswered,
}: {
  modelResults: BenchmarkModelLike[];
  onReviewUnanswered?: () => void;
}) {
  const perModel = modelResults
    .map((m) => benchmarkAnsweredPassFail(m))
    .filter((c) => c !== null);
  if (perModel.length === 0) return null;
  const totalUnanswered = perModel.reduce((n, c) => n + c.unanswered, 0);
  if (totalUnanswered === 0) return null;

  const sameForEveryModel = perModel.every(
    (c) =>
      c.unanswered === perModel[0].unanswered &&
      c.answered === perModel[0].answered,
  );
  const { unanswered, answered } = perModel[0];

  const tab = onReviewUnanswered ? (
    <button
      type="button"
      onClick={onReviewUnanswered}
      className="font-medium text-amber-700 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300 cursor-pointer"
    >
      {RESULT_TAB_LABELS.tests} tab
    </button>
  ) : (
    <span className="font-medium">{RESULT_TAB_LABELS.tests} tab</span>
  );

  return (
    <RunNote>
      {!sameForEveryModel
          ? "Some tests could not be run and were ignored for calculating the metrics. "
          : answered === 0
            ? "None of the tests could be run. "
            : `${unanswered} of ${unanswered + answered} tests could not be run and were ignored for calculating the metrics. `}
      Review the tests that could not be run in the {tab}.
    </RunNote>
  );
}

/**
 * The note above the table when someone stopped the run. Says how far it got,
 * counted across every model, the same way the run window's summary says it.
 */
function StoppedNote({
  modelResults,
  onReviewUnanswered,
}: {
  modelResults: BenchmarkModelLike[];
  onReviewUnanswered?: () => void;
}) {
  let ran = 0;
  let total = 0;
  for (const model of modelResults) {
    const counts = benchmarkAnsweredPassFail(model);
    if (counts) ran += counts.answered + counts.unanswered;
    total += model.total_tests ?? model.test_results?.length ?? 0;
  }

  const tab = onReviewUnanswered ? (
    <button
      type="button"
      onClick={onReviewUnanswered}
      className="font-medium text-amber-700 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300 cursor-pointer"
    >
      {RESULT_TAB_LABELS.tests} tab
    </button>
  ) : (
    <span className="font-medium">{RESULT_TAB_LABELS.tests} tab</span>
  );

  // The same sentence the run window's summary says, counted across every
  // model rather than over one run's tests.
  return (
    <RunNote>
      {stoppedRunSentence(ran, total)}
      {ran > 0 ? <>. The tests that did run are in the {tab}.</> : null}
    </RunNote>
  );
}

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
  formatModelName = displayModelName,
  filename,
  benchmarkScoreLabel = "Test pass rate (%)",
  className,
  onReviewUnanswered,
  runStopped = false,
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
    if (runStopped) {
      return (
        <div className={className}>
          <StoppedNote
            modelResults={modelResults}
            onReviewUnanswered={onReviewUnanswered}
          />
        </div>
      );
    }
    return (
      <div className="text-center py-12">
        <p className="text-sm text-muted-foreground">No leaderboard data available</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {runStopped && (
        <StoppedNote
          modelResults={modelResults}
          onReviewUnanswered={onReviewUnanswered}
        />
      )}
      <UnansweredNote
        modelResults={modelResults}
        onReviewUnanswered={onReviewUnanswered}
      />
      <LeaderboardTab
        className={className}
        columns={columns}
        data={payload.rows}
        charts={payload.chartRows}
        filename={filename}
        getLabel={(key) => formatModelName(key)}
        nameKey="model"
      />
    </div>
  );
}
