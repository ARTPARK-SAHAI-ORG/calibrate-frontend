"use client";

import { SpinnerIcon } from "@/components/icons";
import { PILL_CLASS } from "@/components/ui/PassFailCountPills";
import { getStatusBadgeClass } from "@/lib/status";
import { isTraceScoringInProgress } from "@/lib/traceScoring";
import type { TraceSummary } from "@/lib/tracesApi";

export type TraceScoreColumn = { evaluator_uuid: string; name: string };

const DASH = <span className="text-sm text-muted-foreground">—</span>;

type Props = {
  trace: Pick<TraceSummary, "latest_run_status" | "results">;
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
 * The evaluator cells of one trace row. A run still going, or one that failed
 * or was skipped, is one cell across every evaluator column; a finished run
 * is one cell per evaluator.
 */
export function TraceScoreCells({ trace, columns, layout }: Props) {
  if (columns.length === 0) return null;
  const status = trace.latest_run_status;

  // A run that has not finished says so once, across every evaluator column.
  if (status && status !== "completed") {
    const mark = isTraceScoringInProgress(status) ? (
      <span role="img" aria-label="Scoring" className="inline-flex">
        <SpinnerIcon className="w-4 h-4 animate-spin text-muted-foreground" />
      </span>
    ) : (
      <span
        className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${getStatusBadgeClass(status)}`}
      >
        {status === "failed" ? "Failed" : "Skipped"}
      </span>
    );
    return layout === "card" ? (
      <div className="mt-2">{mark}</div>
    ) : (
      <div
        className="min-w-0 flex items-center"
        style={{ gridColumn: `span ${columns.length}` }}
      >
        {mark}
      </div>
    );
  }

  // Finished, or never scored: one cell each. ScoreValue draws the dash when
  // there is nothing for that evaluator, which is every cell of an unscored row.
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
