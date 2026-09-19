"use client";

import React, { useMemo } from "react";
import { LeaderboardTab, type LeaderboardColumn } from "./LeaderboardTab";
import { RunNote } from "./RunNote";
import { STOPPED_EARLY_SENTENCE } from "@/lib/testTypes";
import { RunFailureBox, runFailureSentence } from "@/components/RunFailureBox";
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

/**
 * A model as this table reads it: the shared shape, plus whether the run could
 * be carried out for it at all. A model that could not be run has no rows, so
 * nothing counted off its rows says anything about it.
 */
type LeaderboardModel = BenchmarkModelLike & { success?: boolean | null };

/** How many of the models could not be run at all. */
function couldNotRunCount(modelResults: LeaderboardModel[]): number {
  return modelResults.filter((m) => m.success === false).length;
}

type BenchmarkCombinedLeaderboardProps = {
  leaderboardSummary?: BenchmarkLeaderboardSummaryRow[];
  modelResults: LeaderboardModel[];
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
  /** True when the run gave up before it started every test. */
  stoppedEarly?: boolean;
  /** Why the run failed after finishing some tests. */
  failureReason?: string | null;
  /** True once the run has ended, whichever way it ended. */
  runOver?: boolean;
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
  stoppedEarly = false,
  failureReason = null,
  runOver = false,
  runStopped = false,
}: {
  modelResults: LeaderboardModel[];
  onReviewUnanswered?: () => void;
  stoppedEarly?: boolean;
  failureReason?: string | null;
  /** True once the run has ended: a row with no verdict then never ran. */
  runOver?: boolean;
  /** True when someone stopped the run: the note about that says it already. */
  runStopped?: boolean;
}) {
  const perModel = modelResults
    .map((m) => benchmarkAnsweredPassFail(m, runOver))
    .filter((c) => c !== null);
  const failed = failureReason !== null;
  const couldNotRun = couldNotRunCount(modelResults);
  if (perModel.length === 0 && !failed && couldNotRun === 0) return null;
  const totalUnanswered = perModel.reduce((n, c) => n + c.unanswered, 0);
  if (totalUnanswered === 0 && !failed && couldNotRun === 0) return null;
  const answeredAny = perModel.some((c) => c.answered > 0);
  // Someone stopped the run and it answered nothing: the note about being
  // stopped says that, so a second box saying none of the tests could be run
  // only repeats it.
  if (runStopped && !answeredAny && !failed) return null;

  const tab = onReviewUnanswered ? (
    <button
      type="button"
      onClick={onReviewUnanswered}
      className={
        failed
          ? "font-medium text-red-500 hover:text-red-600 cursor-pointer"
          : "font-medium text-amber-700 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300 cursor-pointer"
      }
    >
      {RESULT_TAB_LABELS.tests} tab
    </button>
  ) : (
    <span className="font-medium">{RESULT_TAB_LABELS.tests} tab</span>
  );

  const sameForEveryModel = perModel.every(
    (c) =>
      c.unanswered === perModel[0].unanswered &&
      c.answered === perModel[0].answered,
  );

  // How far the models got. They can differ, so the sentence gives a count
  // only when every model reached the same point.
  const ranPerModel = Math.max(
    0,
    ...perModel.map((c) => c.answered + c.unanswered),
  );

  // "" is a failure the backend recorded nothing about, so it still shows.
  const failureBox = failed ? (
    <RunFailureBox
      className="w-full"
      sentence={runFailureSentence(
        ranPerModel === 0 || sameForEveryModel ? ranPerModel : null,
        Math.max(
          ranPerModel,
          ...modelResults.map(
            (m) => m.total_tests ?? m.test_results?.length ?? 0,
          ),
        ),
        tab,
      )}
      details={failureReason.trim() || null}
    />
  ) : null;
  // A broken run still says how many tests could not be run, under the box.
  if (failed && totalUnanswered === 0 && couldNotRun === 0) return failureBox;

  return (
    <>
      {failureBox}
      <RunNote>
        {couldNotRun > 0 &&
          (couldNotRun === modelResults.length
            ? "None of the models could be run. "
            : `${couldNotRun} of ${modelResults.length} models could not be run. `)}
        {totalUnanswered > 0 &&
          (!sameForEveryModel
            ? "Some tests could not be run and were ignored for calculating the metrics. "
            : perModel[0].answered === 0
              ? "None of the tests could be run. "
              : `${perModel[0].unanswered} of ${perModel[0].unanswered + perModel[0].answered} tests could not be run and were ignored for calculating the metrics. `)}
        {stoppedEarly && STOPPED_EARLY_SENTENCE}
        Review the tests that could not be run in the {tab}.
      </RunNote>
    </>
  );
}

/**
 * The note above the table when someone stopped the run. It gives no counts:
 * every test is run once per model, so adding the models up would report 30
 * tests for a comparison of 10 tests across three models, while the run's own
 * Tests column says 10.
 */
function StoppedNote({
  modelResults,
  onReviewUnanswered,
}: {
  modelResults: LeaderboardModel[];
  onReviewUnanswered?: () => void;
}) {
  // Only the tests the run actually tried: one it answered, or one it tried
  // and got no answer from. A row it never reached does not count as a test
  // that ran, which is the whole point of this sentence.
  const ranAnyTest = modelResults.some((model) => {
    const counts = benchmarkAnsweredPassFail(model);
    return !!counts && counts.answered + counts.unanswered > 0;
  });

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
      {ranAnyTest ? (
        <>
          This run was stopped before it finished. The tests that did run are in
          the {tab}.
        </>
      ) : (
        "This run was stopped before any test ran."
      )}
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
    cols.push(
      { key: "passed", header: "Passed" },
      { key: "total", header: "Total" },
    );
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
          ev.type === "binary" ? (
            formatPercent(v)
          ) : (
            formatRating(v)
          )
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
  stoppedEarly = false,
  failureReason = null,
  runOver = false,
}: BenchmarkCombinedLeaderboardProps) {
  const payload = useMemo(
    () =>
      buildBenchmarkCombinedLeaderboardPayload(
        leaderboardSummary,
        modelResults,
        benchmarkScoreLabel,
        // A failed run has no summary from the backend; count what finished.
        failureReason !== null,
      ),
    [leaderboardSummary, modelResults, benchmarkScoreLabel, failureReason],
  );

  const columns = useMemo(
    () =>
      payload
        ? columnsFromPayload(payload, formatModelName, benchmarkScoreLabel)
        : [],
    [payload, formatModelName, benchmarkScoreLabel],
  );

  // What the notes above already say. Worked out once, because it decides two
  // things: whether the bare "no data" line is the only thing left to show,
  // and whether the table can be left out.
  const counted = modelResults.map((m) => benchmarkAnsweredPassFail(m, runOver));
  const noteExplainsIt =
    runStopped ||
    failureReason !== null ||
    couldNotRunCount(modelResults) > 0 ||
    counted.some((c) => (c?.unanswered ?? 0) > 0);

  // No table to draw, so the notes are the whole story. A run can have been
  // stopped and have broken, so both are said, and the note about the tests
  // that could not be run is said whenever it applies.
  if (!payload || payload.rows.length === 0) {
    return (
      <div className={className}>
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
            stoppedEarly={stoppedEarly && !runStopped}
            failureReason={failureReason}
            runOver={runOver}
            runStopped={runStopped}
          />
        </div>
        {!noteExplainsIt && (
          <div className="text-center py-12">
            <p className="text-sm text-muted-foreground">
              No leaderboard data available
            </p>
          </div>
        )}
      </div>
    );
  }

  // No model answered a single test, so the table would be rows of zeroes and
  // the chart a blank box. Left out only when a note above says why there is
  // nothing to show, since otherwise the tab would be empty.
  const hideTable =
    counted.length > 0 &&
    counted.every((c) => c !== null && c.answered === 0) &&
    noteExplainsIt;

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
        stoppedEarly={stoppedEarly && !runStopped}
        failureReason={failureReason}
        runOver={runOver}
        runStopped={runStopped}
      />
      {hideTable ? null : (
        <LeaderboardTab
          className={className}
          columns={columns}
          data={payload.rows}
          charts={payload.chartRows}
          filename={filename}
          getLabel={(key) => formatModelName(key)}
          nameKey="model"
        />
      )}
    </div>
  );
}
