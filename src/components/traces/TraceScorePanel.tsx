"use client";

import type React from "react";
import { EvaluatorVerdictCard } from "@/components/EvaluatorVerdictCard";
import { EVALUATOR_PILL_CLASSES } from "@/components/EvaluatorPillList";
import { RunFailureBox } from "@/components/RunFailureBox";
import type { AgentNature } from "@/components/traces/ingestSnippets";
import { SpinnerIcon, WarningTriangleIcon } from "@/components/icons";
import { Button } from "@/components/ui/Button";
import { ExtendLimitsLink } from "@/constants/limits";
import { useUsesOwnProviderKeys } from "@/hooks";
import { EvaluatorsTabLink } from "./NothingCanScoreMessage";
import { WarningBox } from "./WarningBox";
import {
  ineligibleReasonCopy,
  lowerFirst,
  isTraceScoringInProgress,
  missingSourcePhrase,
  scoringRunErrorCopy,
} from "@/lib/traceScoring";
import type {
  TraceMissingValue,
  TraceScoreResult,
  TraceScoringIneligibleEvaluator,
  TraceScoringRun,
  TraceUnconfiguredEvaluator,
} from "@/lib/tracesApi";

// Orange, not the amber a rating between pass and fail is drawn in.
const DID_NOT_RUN_CARD =
  "rounded-lg border shadow-md dark:shadow-lg transition-colors border-orange-500/45 bg-orange-500/[0.12] dark:border-orange-500/50 dark:bg-orange-500/[0.14] dark:shadow-orange-950/30 p-3";
const DID_NOT_RUN_TEXT = "text-sm text-orange-700 dark:text-orange-300";

function DidNotRunName({ name }: { name: string }) {
  return (
    <p className="flex items-center gap-1.5 text-sm font-medium text-foreground break-words min-w-0">
      <WarningTriangleIcon className="w-4 h-4 flex-shrink-0 text-orange-600 dark:text-orange-400" />
      {name}
    </p>
  );
}

export type TraceScorePanelProps = {
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
  /** Picks the agent's own name for the trace's input. */
  agentNature?: AgentNature;
  /** Evaluators on the agent that still need configuring for traces. Only
   *  decides which "did not run" cards carry a Configure button. */
  unconfigured?: TraceUnconfiguredEvaluator[];
  onConfigure?: (evaluatorUuid: string) => void;
  /** The evaluator whose Configure button is loading. */
  configuringUuid?: string | null;
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

/** One block per evaluator, whichever variables of its could not be filled. */
function MissingValueBlocks({
  values,
  agentNature,
}: {
  values: TraceMissingValue[];
  agentNature?: AgentNature;
}) {
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
        <div key={uuid} className={`${DID_NOT_RUN_CARD} space-y-2`}>
          <DidNotRunName name={missing[0].name} />
          <div className="space-y-1">
            {missing.map(({ variable, source }) => (
              <p key={variable} className={DID_NOT_RUN_TEXT}>
                Could not run.{" "}
                <span className="font-mono break-all">{`{{${variable}}}`}</span>{" "}
                reads from {missingSourcePhrase(source, agentNature)}, and this trace has
                none.
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
  ineligible = [],
  addToolCallEvaluator,
  onGoToEvaluators,
  scoreTrace,
  scoringEvaluatorNames = [],
  onTryAgain,
  agentNature,
}: {
  run: TraceScoringRun;
  descriptions?: Record<string, string>;
  ineligible?: TraceScoringIneligibleEvaluator[];
  addToolCallEvaluator?: React.ReactNode;
  onGoToEvaluators?: () => void;
  scoreTrace?: React.ReactNode;
  scoringEvaluatorNames?: string[];
  onTryAgain?: () => void;
  agentNature?: AgentNature;
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
        <MissingValueBlocks values={missingValues} agentNature={agentNature} />
      </div>
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
            <div className="mt-3">{scoreTrace}</div>
          ) : run.error === "no_tool_call_evaluator" && addToolCallEvaluator ? (
            <div className="mt-3">{addToolCallEvaluator}</div>
          ) : (
            run.error === "no_usable_evaluators" &&
            ineligible.length > 0 && (
              <ul className="mt-1 list-disc pl-5 text-sm text-amber-700 dark:text-amber-300">
                {ineligible.map((item) => (
                  <li key={item.evaluator_uuid}>
                    <span className="font-medium">{item.name}</span>:{" "}
                    {lowerFirst(ineligibleReasonCopy(item.reason))}
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
        {(run.error === "no_usable_evaluators" ||
          (run.error === "no_tool_call_evaluator" && !addToolCallEvaluator)) &&
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
      <MissingValueBlocks values={missingValues} agentNature={agentNature} />
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
  agentNature,
  unconfigured = [],
  onConfigure,
  configuringUuid = null,
}: TraceScorePanelProps) {
  // An evaluator this trace already names as missing a value has its own block.
  const named = new Set(run?.missing_values?.map((v) => v.evaluator_uuid));
  const recorded = run?.unconfigured_evaluators ?? [];
  const stillUnconfigured = new Set(unconfigured.map((e) => e.evaluator_uuid));
  const cards =
    run &&
    !error &&
    (run.status === "completed" ||
      (run.status === "skipped" &&
        (run.error === "no_usable_evaluators" ||
          run.error === "missing_trace_values")))
      ? recorded.filter((e) => !named.has(e.evaluator_uuid))
      : [];
  return (
    <div className="p-4 md:p-6 space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Scores</h3>
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : run ? (
        <RunBody
          run={run}
          descriptions={descriptions}
          agentNature={agentNature}
          ineligible={ineligible?.filter(
            (item) =>
              !recorded.some((e) => e.evaluator_uuid === item.evaluator_uuid),
          )}
          addToolCallEvaluator={addToolCallEvaluator}
          onGoToEvaluators={onGoToEvaluators}
          scoreTrace={scoreTrace}
          scoringEvaluatorNames={scoringEvaluatorNames}
          onTryAgain={onTryAgain}
        />
      ) : null}
      {cards.map(({ evaluator_uuid, name }) => (
        <div key={evaluator_uuid} className={`${DID_NOT_RUN_CARD} space-y-2`}>
          <div className="flex items-center justify-between gap-3">
            <DidNotRunName name={name} />
            {stillUnconfigured.has(evaluator_uuid) && (
              <Button
                variant="secondary"
                size="sm"
                className="shrink-0"
                isLoading={configuringUuid === evaluator_uuid}
                onClick={() => onConfigure?.(evaluator_uuid)}
              >
                Configure
              </Button>
            )}
          </div>
          <p className={DID_NOT_RUN_TEXT}>
            Did not run as it has not been configured for traces
          </p>
        </div>
      ))}
    </div>
  );
}
