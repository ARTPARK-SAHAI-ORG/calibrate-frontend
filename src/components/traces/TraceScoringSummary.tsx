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

export type TraceScoreColumn = { evaluator_uuid: string; name: string };

const DASH = <span className="text-sm text-muted-foreground">—</span>;

type Props = {
  trace: Pick<
    TraceSummary,
    "latest_run_status" | "latest_run_error" | "results"
  >;
  columns: TraceScoreColumn[];
  /** "row" is one grid cell per evaluator; "card" is a labelled block each. */
  layout: "row" | "card";
};

/**
 * One evaluator's result on the latest completed run: a Success or Fail pill
 * for a binary evaluator, the number for a rating one.
 */
function ScoreValue({
  trace,
  evaluatorUuid,
}: {
  trace: Props["trace"];
  evaluatorUuid: string;
}) {
  const score = trace.results?.find((s) => s.evaluator_uuid === evaluatorUuid);
  if (!score) return DASH;
  if (score.output_type === "rating") {
    return <span className="text-sm text-foreground">{score.value}</span>;
  }
  return score.passed ? (
    <span
      className={`${PILL_CLASS} bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-500`}
    >
      Success
    </span>
  ) : (
    <span
      className={`${PILL_CLASS} bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-500`}
    >
      Fail
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
    const words =
      status === "pending" ? "Waiting to be scored" : "Being scored";
    return (
      <Tooltip content={words} position="top">
        <span role="img" aria-label={words} className="inline-flex">
          <SpinnerIcon className="w-4 h-4 animate-spin text-muted-foreground" />
        </span>
      </Tooltip>
    );
  }
  if (status === "completed") {
    return <RunStateMark state="finished" tooltip="Scored" />;
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
