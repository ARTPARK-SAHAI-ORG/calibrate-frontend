"use client";

import { EvaluatorVerdictCard } from "@/components/EvaluatorVerdictCard";
import { SpinnerIcon } from "@/components/icons";
import { CONTACT_LINK } from "@/constants/limits";
import {
  isTraceScoringInProgress,
  scoringRunErrorCopy,
} from "@/lib/traceScoring";
import type { TraceScoreResult, TraceScoringRun } from "@/lib/tracesApi";

type TraceScorePanelProps = {
  /** The newest scoring run for this trace. The parent leaves the whole
   *  column out when there is none, so this is only null beside an error. */
  run: TraceScoringRun | null;
  error?: string | null;
  /** What each evaluator is for, by evaluator id. */
  descriptions?: Record<string, string>;
};

/** The verdict card keeps binary and rating displays apart, so the stored
 *  numeric `value` is split back into the field its output type reads. */
function verdictFields(result: TraceScoreResult): {
  match?: boolean;
  score?: number;
} {
  if (result.output_type === "rating") {
    return { score: result.value };
  }
  return { match: result.passed };
}

function RunBody({
  run,
  descriptions,
}: {
  run: TraceScoringRun;
  descriptions?: Record<string, string>;
}) {
  if (isTraceScoringInProgress(run.status)) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <SpinnerIcon className="w-4 h-4 animate-spin text-amber-500" />
        Running the evaluators on this trace
      </p>
    );
  }

  // A trace that could not be scored is a warning whatever the reason, so
  // every reason gets the same amber box the Traces tab uses. Only the limit
  // has somewhere for the reader to go next, so only it carries the link.
  if (run.status === "failed" || run.status === "skipped") {
    return (
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
        <p className="text-sm text-amber-700 dark:text-amber-300">
          {/* The reason is hover text elsewhere, so it carries no full stop
              of its own. Here it is a sentence, and the limit one is followed
              by another, so this is where the stop belongs. */}
          {scoringRunErrorCopy(run.error)}.
          {run.error === "over_limit" && (
            <>
              {" "}
              <a
                href={CONTACT_LINK}
                target="_blank"
                rel="noopener noreferrer"
                className="font-bold"
              >
                Click here
              </a>{" "}
              to contact us to extend your limits.
            </>
          )}
        </p>
      </div>
    );
  }

  if (run.results.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        This run produced no scores.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {run.results.map((result) => (
        <EvaluatorVerdictCard
          key={`${run.run_uuid}-${result.evaluator_uuid}`}
          mode="read"
          name={result.name}
          description={descriptions?.[result.evaluator_uuid]}
          outputType={result.output_type}
          {...verdictFields(result)}
          reasoning={result.reasoning}
          scaleMin={result.scale_min ?? undefined}
          scaleMax={result.scale_max ?? undefined}
          evaluatorUuid={result.evaluator_uuid}
          enableLink
        />
      ))}
    </div>
  );
}

/**
 * The latest scoring run for one trace, laid out like the evaluators column
 * of the test results window: a heading, then one verdict card per evaluator.
 */
export function TraceScorePanel({
  run,
  error = null,
  descriptions,
}: TraceScorePanelProps) {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Scores</h3>
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : run ? (
        <RunBody run={run} descriptions={descriptions} />
      ) : null}
    </div>
  );
}
