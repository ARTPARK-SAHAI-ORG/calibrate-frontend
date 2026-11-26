"use client";

import type React from "react";
import { EvaluatorVerdictCard } from "@/components/EvaluatorVerdictCard";
import { EVALUATOR_PILL_CLASSES } from "@/components/EvaluatorPillList";
import { RunFailureBox } from "@/components/RunFailureBox";
import { SpinnerIcon } from "@/components/icons";
import { ExtendLimitsLink } from "@/constants/limits";
import { useUsesOwnProviderKeys } from "@/hooks";
import { EvaluatorsTabLink } from "./NothingCanScoreMessage";
import { WarningBox } from "./WarningBox";
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
   *  "No evaluator on this agent could score this trace" so the reader knows what to fix. */
  ineligible?: TraceScoringIneligibleEvaluator[];
  /** The button that adds a tool call evaluator, shown when the run was
   *  skipped because the agent has none. */
  addToolCallEvaluator?: React.ReactNode;
  /** Opens the agent's Evaluators tab, for a trace no evaluator fits. */
  onGoToEvaluators?: () => void;
  /** The button that scores the trace again, shown when it was skipped for
   *  having no evaluator that fits and the agent now has one. */
  scoreTrace?: React.ReactNode;
  /** The agent's evaluators that can score this trace now, named beside it. */
  scoringEvaluatorNames?: string[];
  /** Scores the trace again after its scoring failed. */
  onTryAgain?: () => void;
};

const listNames = new Intl.ListFormat("en-GB", { type: "conjunction" });

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
  onGoToEvaluators,
  scoreTrace,
  scoringEvaluatorNames = [],
  onTryAgain,
}: {
  run: TraceScoringRun;
  descriptions?: Record<string, string>;
  ineligible?: TraceScoringIneligibleEvaluator[];
  addToolCallEvaluator?: React.ReactNode;
  onGoToEvaluators?: () => void;
  scoreTrace?: React.ReactNode;
  scoringEvaluatorNames?: string[];
  onTryAgain?: () => void;
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

  if (run.status === "failed") {
    return (
      <RunFailureBox
        details={run.error ?? null}
        sentence="The evaluators could not score this trace."
        className="w-full"
        onTryAgain={onTryAgain}
      />
    );
  }

  // A skipped trace is a warning whatever the reason, so every reason gets
  // the same amber box the Traces tab uses. Only the limit, a missing tool
  // call evaluator and an agent with no evaluator that fits have somewhere
  // for the reader to go next, so only they carry a link.
  if (run.status === "skipped") {
    const canScore =
      !!scoreTrace &&
      (run.error === "no_tool_call_evaluator" ||
        run.error === "no_usable_evaluators");
    return (
      <WarningBox
        after={
          canScore ? (
            <div className="mt-2">{scoreTrace}</div>
          ) : run.error === "no_tool_call_evaluator" && addToolCallEvaluator ? (
            <div className="mt-2">{addToolCallEvaluator}</div>
          ) : (
            run.error === "no_usable_evaluators" &&
            ineligible.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-sm text-amber-700 dark:text-amber-300">
                {ineligible.map((item) => (
                  <li key={item.evaluator_uuid}>
                    <span className="font-medium">{item.name}</span>:{" "}
                    {ineligibleReasonCopy(item.reason).toLowerCase()}
                  </li>
                ))}
              </ul>
            )
          )
        }
      >
        {/* A lone reason takes no full stop. One followed by more words or
            a button takes one. */}
        {canScore ? (
          <>
            {run.error === "no_usable_evaluators"
              ? "This trace was not scored because none of the agent's evaluators could score it then."
              : `${scoringRunErrorCopy(run.error)}.`}{" "}
            {listNames.formatToParts(scoringEvaluatorNames).map((part, i) =>
              part.type === "element" ? (
                <span key={i} className={EVALUATOR_PILL_CLASSES}>
                  {part.value}
                </span>
              ) : (
                part.value
              ),
            )}{" "}
            can score it now.
          </>
        ) : run.error === "over_limit" && usesOwnProviderKeys ? (
          "This trace was not scored because the workspace had reached its scoring limit at the time"
        ) : (
          `${scoringRunErrorCopy(run.error)}${run.error === "over_limit" ? "." : ""}`
        )}
        {run.error === "no_usable_evaluators" &&
          onGoToEvaluators &&
          !canScore && (
            <>
              . Add one that can in the{" "}
              <EvaluatorsTabLink onGoToEvaluators={onGoToEvaluators} />.
            </>
          )}
        {run.error === "no_tool_call_evaluator" &&
          addToolCallEvaluator &&
          !canScore &&
          "."}
        {run.error === "over_limit" && !usesOwnProviderKeys && (
          <>
            {" "}
            <ExtendLimitsLink />
          </>
        )}
      </WarningBox>
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
  onGoToEvaluators,
  scoreTrace,
  scoringEvaluatorNames,
  onTryAgain,
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
          onGoToEvaluators={onGoToEvaluators}
          scoreTrace={scoreTrace}
          scoringEvaluatorNames={scoringEvaluatorNames}
          onTryAgain={onTryAgain}
        />
      ) : null}
    </div>
  );
}
