"use client";

import {
  evaluatorCardSurfaceClass,
  EvaluatorVerdictCard,
} from "@/components/EvaluatorVerdictCard";
import { SpinnerIcon } from "@/components/icons";
import { CONTACT_LINK } from "@/constants/limits";
import { useUsesOwnProviderKeys } from "@/hooks";
import {
  isTraceScoringInProgress,
  missingSourcePhrase,
  scoringRunErrorCopy,
} from "@/lib/traceScoring";
import type {
  TraceMissingValue,
  TraceScoreResult,
  TraceScoringRun,
} from "@/lib/tracesApi";

const WARNING_BOX =
  "rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2";

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

/** One block per evaluator, whichever variables of its could not be filled. */
function MissingValueBlocks({ values }: { values: TraceMissingValue[] }) {
  const byEvaluator = new Map<string, TraceMissingValue[]>();
  for (const value of values) {
    byEvaluator.set(value.evaluator_uuid, [
      ...(byEvaluator.get(value.evaluator_uuid) ?? []),
      value,
    ]);
  }
  return (
    <>
      {[...byEvaluator].map(([uuid, missing]) => (
        <div
          key={uuid}
          className={`${evaluatorCardSurfaceClass("neutral")} p-3 space-y-3`}
        >
          <p className="text-sm font-medium text-foreground break-words">
            {missing[0].name}
          </p>
          <div className={`${WARNING_BOX} space-y-1`}>
            {missing.map(({ variable, source }) => (
              <p
                key={variable}
                className="text-sm text-amber-700 dark:text-amber-300"
              >
                Could not run.{" "}
                <span className="font-mono break-all">{`{{${variable}}}`}</span>{" "}
                reads from {missingSourcePhrase(source)}, and this trace does
                not have it.
              </p>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function RunBody({
  run,
  descriptions,
}: {
  run: TraceScoringRun;
  descriptions?: Record<string, string>;
}) {
  const usesOwnProviderKeys = useUsesOwnProviderKeys();
  const missingValues = run.missing_values ?? [];
  if (isTraceScoringInProgress(run.status)) {
    return (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <SpinnerIcon className="w-4 h-4 animate-spin text-amber-500" />
        Running the evaluators on this trace
      </p>
    );
  }

  if (
    run.status === "skipped" &&
    run.error === "missing_trace_values" &&
    missingValues.length > 0
  ) {
    return (
      <div className="space-y-3">
        <MissingValueBlocks values={missingValues} />
      </div>
    );
  }

  // A trace that could not be scored is a warning whatever the reason, so
  // every reason gets the same amber box the Traces tab uses. Only the limit
  // has somewhere for the reader to go next, so only it carries the link.
  if (run.status === "failed" || run.status === "skipped") {
    return (
      <div className={WARNING_BOX}>
        <p className="text-sm text-amber-700 dark:text-amber-300">
          {/* A lone reason takes no full stop. Only the limit one is followed
              by a second sentence, so only it needs one. */}
          {run.error === "over_limit" && usesOwnProviderKeys
            ? "This trace was not scored because the workspace had reached its scoring limit at the time"
            : `${scoringRunErrorCopy(run.error)}${run.error === "over_limit" ? "." : ""}`}
          {run.error === "over_limit" && !usesOwnProviderKeys && (
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

  if (run.results.length === 0 && missingValues.length === 0) {
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
      <MissingValueBlocks values={missingValues} />
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
