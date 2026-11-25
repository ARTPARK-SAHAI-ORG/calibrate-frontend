"use client";

import type React from "react";
import { EvaluatorVerdictCard } from "@/components/EvaluatorVerdictCard";
import { SpinnerIcon } from "@/components/icons";
import { CONTACT_LINK } from "@/constants/limits";
import { useUsesOwnProviderKeys } from "@/hooks";
import {
  ineligibleReasonCopy,
  isTraceScoringInProgress,
  scoringRunErrorCopy,
} from "@/lib/traceScoring";
import type {
  TraceScoreResult,
  TraceScoringIneligibleEvaluator,
  TraceScoringRun,
} from "@/lib/tracesApi";

type TraceScorePanelProps = {
  /** The newest scoring run for this trace. The parent leaves the whole
   *  column out when there is none, so this is only null beside an error. */
  run: TraceScoringRun | null;
  error?: string | null;
  /** What each evaluator is for, by evaluator id. */
  descriptions?: Record<string, string>;
  /** The agent's evaluators that cannot score traces, and why. Named under
   *  "No evaluator on this agent fits this trace" so the reader knows what to fix. */
  ineligible?: TraceScoringIneligibleEvaluator[];
  /** The button that adds a tool call evaluator, shown when the run was
   *  skipped because the agent has none. */
  addToolCallEvaluator?: React.ReactNode;
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
  ineligible = [],
  addToolCallEvaluator,
}: {
  run: TraceScoringRun;
  descriptions?: Record<string, string>;
  ineligible?: TraceScoringIneligibleEvaluator[];
  addToolCallEvaluator?: React.ReactNode;
}) {
  const usesOwnProviderKeys = useUsesOwnProviderKeys();
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
  // and a missing tool call evaluator have somewhere for the reader to go
  // next, so only they carry a link.
  if (run.status === "failed" || run.status === "skipped") {
    return (
      <div className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2">
        <p className="text-sm text-amber-700 dark:text-amber-300">
          {/* A lone reason takes no full stop. One followed by more words or
              a button takes one. */}
          {run.error === "over_limit" && usesOwnProviderKeys
            ? "This trace was not scored because the workspace had reached its scoring limit at the time"
            : `${scoringRunErrorCopy(run.error)}${run.error === "over_limit" ? "." : ""}`}
          {run.error === "no_tool_call_evaluator" && addToolCallEvaluator && (
            <>. {addToolCallEvaluator}</>
          )}
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
        {run.error === "no_usable_evaluators" && ineligible.length > 0 && (
          <ul className="mt-1 list-disc pl-5 text-sm text-amber-700 dark:text-amber-300">
            {ineligible.map((item) => (
              <li key={item.evaluator_uuid}>
                <span className="font-medium">{item.name}</span>:{" "}
                {ineligibleReasonCopy(item.reason).toLowerCase()}
              </li>
            ))}
          </ul>
        )}
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
  ineligible,
  addToolCallEvaluator,
}: TraceScorePanelProps) {
  return (
    <div className="p-4 md:p-6 space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Scores</h3>
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : run ? (
        <RunBody
          run={run}
          descriptions={descriptions}
          ineligible={ineligible}
          addToolCallEvaluator={addToolCallEvaluator}
        />
      ) : null}
    </div>
  );
}
