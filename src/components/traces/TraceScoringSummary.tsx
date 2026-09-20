"use client";

import { Tooltip } from "@/components/Tooltip";
import { RunStateMark } from "@/components/ui";
import { SpinnerIcon } from "@/components/icons";
import { PILL_CLASS } from "@/components/ui/PassFailCountPills";
import {
  isTraceScoringInProgress,
  scoringRunErrorCopy,
} from "@/lib/traceScoring";
import type { TraceSummary } from "@/lib/tracesApi";
import { defaultBinaryLabel } from "@/lib/binaryLabels";

export type TraceScoreColumn = { evaluator_uuid: string; name: string };

// The same weight the Evaluations tab gives an empty cell, e.g. "Default"
// under Models on a run that used the agent's own model.
const NOT_SCORED = (
  <span className="text-sm text-muted-foreground/70">Not scored yet</span>
);

type Props = {
  trace: Pick<
    TraceSummary,
    "latest_run_status" | "latest_run_error" | "results"
  >;
  columns: TraceScoreColumn[];
  /** "row" is one grid cell per evaluator; "card" is a labelled block each. */
  layout: "row" | "card";
};

/** The info icon beside a value, with the judge's words on hover. Drawn the
 *  way the speech result tables draw it, so the two read the same. */
function ReasoningInfo({
  reasoning,
  evaluatorName,
}: {
  reasoning: string;
  evaluatorName: string;
}) {
  return (
    <Tooltip content={reasoning} position="top">
      <button
        type="button"
        className="p-0.5 rounded hover:bg-muted transition-colors cursor-pointer"
        aria-label={`View ${evaluatorName} reasoning`}
      >
        <svg
          className="w-3.5 h-3.5 text-muted-foreground"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
      </button>
    </Tooltip>
  );
}

/**
 * One evaluator's cell: the words it gave this trace. Binary reads the way the
 * verdict card reads it, and a rating shows its label, or the score out of the
 * scale when the run recorded no label.
 */
function ScoreValue({
  trace,
  evaluatorUuid,
}: {
  trace: Props["trace"];
  evaluatorUuid: string;
}) {
  // A run still going says so in every column, rather than looking unscored.
  if (isTraceScoringInProgress(trace.latest_run_status)) {
    return (
      <span
        className={`${PILL_CLASS} bg-amber-100 text-amber-700 dark:bg-amber-500/20 dark:text-amber-400`}
      >
        In progress
      </span>
    );
  }
  const score = trace.results?.find((s) => s.evaluator_uuid === evaluatorUuid);
  // A run that failed or was skipped says so once, in the mark beside the
  // input. "Not scored yet" here would promise a score that is not coming.
  if (!score) {
    const done = trace.latest_run_status;
    return done && done !== "completed" ? null : NOT_SCORED;
  }
  const verdict =
    score.output_type === "rating" ? (
      <span className={`${PILL_CLASS} bg-muted text-foreground`}>
        {score.scale_max != null
          ? `${score.value} / ${score.scale_max}`
          : `Score: ${score.value}`}
      </span>
    ) : (
      <span
        className={`${PILL_CLASS} ${
          score.passed
            ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-500"
            : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-500"
        }`}
      >
        {defaultBinaryLabel(score.passed)}
      </span>
    );
  const reasoning = score.reasoning?.trim();
  if (!reasoning) return verdict;
  return (
    <span className="inline-flex items-center gap-1 min-w-0">
      {verdict}
      <ReasoningInfo reasoning={reasoning} evaluatorName={score.name} />
    </span>
  );
}

/**
 * How the scoring of one trace went, beside its input, the way a run's mark
 * sits beside its name. A trace nothing has tried to score carries no mark.
 */
export function TraceScoreMark({
  trace,
}: {
  trace: Pick<TraceSummary, "latest_run_status" | "latest_run_error">;
}) {
  const status = trace.latest_run_status;
  if (!status) return null;
  if (isTraceScoringInProgress(status)) {
    const words = status === "pending" ? "Waiting to be scored" : "In progress";
    return (
      <Tooltip content={words} position="top">
        <span role="img" aria-label={words} className="inline-flex">
          <SpinnerIcon className="w-4 h-4 animate-spin text-muted-foreground" />
        </span>
      </Tooltip>
    );
  }
  if (status === "completed") {
    return <RunStateMark state="finished" tooltip="Completed" />;
  }
  return (
    <RunStateMark
      state={status === "failed" ? "error" : "none_run"}
      tooltip={scoringRunErrorCopy(trace.latest_run_error)}
    />
  );
}

/**
 * The evaluator cells of one trace row: one per column, holding that
 * evaluator's result. How the run itself went is the mark beside the input,
 * so a run with no results leaves these cells empty rather than explaining
 * itself once per column.
 */
export function TraceScoreCells({ trace, columns, layout }: Props) {
  if (columns.length === 0) return null;
  if (layout === "card") {
    return (
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        {columns.map((column) => (
          <div key={column.evaluator_uuid}>
            <div className="text-xs font-medium text-muted-foreground">
              {column.name}
            </div>
            <ScoreValue trace={trace} evaluatorUuid={column.evaluator_uuid} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <>
      {columns.map((column) => (
        <div key={column.evaluator_uuid} className="min-w-0">
          <ScoreValue trace={trace} evaluatorUuid={column.evaluator_uuid} />
        </div>
      ))}
    </>
  );
}
