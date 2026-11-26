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
  everyEvaluatorNeedsValues,
  ineligibleReasonCopy,
  isMetadataSource,
  lowerFirst,
  isTraceScoringInProgress,
  metadataKey,
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

function DidNotRunCard({
  uuid,
  name,
  onConfigure,
  configuringUuid,
  children,
}: {
  uuid: string;
  name: string;
  onConfigure?: (evaluatorUuid: string) => void;
  configuringUuid?: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className={`${DID_NOT_RUN_CARD} space-y-4`}>
      <div className="flex items-center justify-between gap-3">
        <DidNotRunName name={name} />
        {onConfigure && (
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            isLoading={configuringUuid === uuid}
            onClick={() => onConfigure(uuid)}
          >
            Configure for traces
          </Button>
        )}
      </div>
      {children}
    </div>
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
  /** The button that scores a completed trace again, shown when evaluators
   *  it left out for not being set up are set up now. */
  scoreAgain?: React.ReactNode;
  /** The agent's evaluators that can score this trace now, named beside it. */
  scoringEvaluatorNames?: string[];
  /** Scores the trace again after its scoring failed. */
  onTryAgain?: () => void;
  /** Picks the agent's own name for the trace's input. */
  agentNature?: AgentNature;
  /** Evaluators on the agent that still need configuring for traces. A
   *  "did not run" card is shown only for these. */
  unconfigured?: TraceUnconfiguredEvaluator[];
  onConfigure?: (evaluatorUuid: string) => void;
  /** The evaluator whose Configure button is loading. */
  configuringUuid?: string | null;
};

const listNames = new Intl.ListFormat("en-GB", { type: "conjunction" });

/** Evaluator names as pills, joined with commas and "and". */
function pills(names: string[]) {
  return listNames.formatToParts(names).map((part, i) =>
    part.type === "element" ? (
      <span key={i} className={EVALUATOR_PILL_CLASSES}>
        {part.value}
      </span>
    ) : (
      part.value
    ),
  );
}

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
  onConfigure,
  configuringUuid,
}: {
  values: TraceMissingValue[];
  agentNature?: AgentNature;
  onConfigure?: (evaluatorUuid: string) => void;
  configuringUuid?: string | null;
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
        <DidNotRunCard
          key={uuid}
          uuid={uuid}
          name={missing[0].name}
          onConfigure={onConfigure}
          configuringUuid={configuringUuid}
        >
          <div className="space-y-1">
            {missing.map(({ variable, source }) => (
              <p key={variable} className={DID_NOT_RUN_TEXT}>
                Could not run. The variable{" "}
                <code className="inline-flex px-1.5 rounded-md text-xs font-mono font-semibold bg-blue-500/10 text-blue-700 dark:text-blue-300 break-all">{`{{${variable}}}`}</code>{" "}
                is mapped to{" "}
                {isMetadataSource(source) ? (
                  <>
                    the metadata key{" "}
                    <code className="font-mono text-xs px-1 rounded bg-amber-700/10 dark:bg-amber-300/15 break-all">
                      {metadataKey(source)}
                    </code>
                  </>
                ) : (
                  missingSourcePhrase(source, agentNature)
                )}
                , and this trace has no value for it.
              </p>
            ))}
          </div>
        </DidNotRunCard>
      ))}
    </>
  );
}

function VerdictCards({
  run,
  descriptions,
}: {
  run: TraceScoringRun;
  descriptions?: Record<string, string>;
}) {
  return (
    <>
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
    </>
  );
}

/** Evaluators a completed run left out for not being set up for traces,
 *  that are set up now and so can score the trace if it is scored again. */
export function evaluatorsSetUpSince(
  run: TraceScoringRun | null,
  unconfigured: TraceUnconfiguredEvaluator[] = [],
): TraceUnconfiguredEvaluator[] {
  if (run?.status !== "completed") return [];
  const stillUnconfigured = new Set(unconfigured.map((e) => e.evaluator_uuid));
  return (run.unconfigured_evaluators ?? []).filter(
    (e) => !stillUnconfigured.has(e.evaluator_uuid),
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
  onlyNeedValues = false,
  onConfigure,
  configuringUuid,
  configureNames = [],
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
  /** Every evaluator that cannot score is only waiting for trace values,
   *  and each has its own card below. */
  onlyNeedValues?: boolean;
  onConfigure?: (evaluatorUuid: string) => void;
  configuringUuid?: string | null;
  /** Evaluators with a card below this box, still to be configured for traces. */
  configureNames?: string[];
}) {
  const usesOwnProviderKeys = useUsesOwnProviderKeys();
  const missingValues = run.missing_values ?? [];
  if (isTraceScoringInProgress(run.status)) {
    const limitedTo = run.limited_to_evaluators ?? [];
    const running = (
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <SpinnerIcon className="w-4 h-4 animate-spin text-amber-500" />
        {limitedTo.length > 0
          ? `Running ${limitedTo.map((e) => e.name).join(", ")} on this trace`
          : "Running the evaluators on this trace"}
      </p>
    );
    if (limitedTo.length === 0) return running;
    return (
      <div className="space-y-3">
        <VerdictCards run={run} descriptions={descriptions} />
        {running}
      </div>
    );
  }

  if (
    run.status === "skipped" &&
    run.error === "missing_trace_values" &&
    missingValues.length > 0
  ) {
    return (
      <div className="space-y-3">
        <MissingValueBlocks
          values={missingValues}
          agentNature={agentNature}
          onConfigure={onConfigure}
          configuringUuid={configuringUuid}
        />
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
  // for the reader to go next, so only they carry a link or a button.
  if (run.status === "skipped") {
    const canScore =
      !!scoreTrace &&
      (run.error === "no_tool_call_evaluator" ||
        run.error === "no_usable_evaluators");
    const needValuesOnly =
      !canScore && run.error === "no_usable_evaluators" && onlyNeedValues;
    const reason = scoringRunErrorCopy(run.error);
    const toConfigure =
      run.error === "no_tool_call_evaluator" ? configureNames : [];
    const one = toConfigure.length === 1;
    const configureSentence = toConfigure.length > 0 && (
      <>
        {" "}
        {pills(toConfigure)} {one ? "has" : "have"} been added since, but{" "}
        {one ? "has" : "have"} not been configured for traces. Configure{" "}
        {one ? "it" : "them"} below
        {canScore ? "." : ", then score this trace."}
      </>
    );
    const button = canScore
      ? scoreTrace
      : run.error === "no_tool_call_evaluator" && addToolCallEvaluator;
    return (
      <>
        <WarningBox
          after={
            run.error === "no_usable_evaluators" &&
            !canScore &&
            !needValuesOnly &&
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
          }
        >
          {/* A lone reason takes no full stop. One followed by more words or
              a button takes one. */}
          {canScore ? (
            <>
              {run.error === "no_usable_evaluators"
                ? "This trace was not scored because none of the agent's evaluators could score it then."
                : `${reason}.`}{" "}
              {pills(scoringEvaluatorNames)} can score it now.
              {configureSentence}
            </>
          ) : needValuesOnly ? (
            <>
              This trace was not scored. None of the evaluators added to this
              agent have been configured for traces: each one has variables
              that need to be mapped to a value from the trace. Configure them
              below, then score this trace again, or add an evaluator without
              variables in the{" "}
              {onGoToEvaluators ? (
                <EvaluatorsTabLink onGoToEvaluators={onGoToEvaluators} />
              ) : (
                "Evaluators tab"
              )}
              .
            </>
          ) : toConfigure.length > 0 ? (
            <>
              {reason}.{configureSentence}
            </>
          ) : run.error === "over_limit" && usesOwnProviderKeys ? (
            "This trace was not scored because the workspace had reached its scoring limit at the time"
          ) : (
            `${scoringRunErrorCopy(run.error)}${run.error === "over_limit" ? "." : ""}`
          )}
          {(run.error === "no_usable_evaluators" ||
            (run.error === "no_tool_call_evaluator" &&
              !addToolCallEvaluator &&
              toConfigure.length === 0)) &&
            onGoToEvaluators &&
            !canScore &&
            !needValuesOnly && (
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
        {button && <div className="flex">{button}</div>}
      </>
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
      <VerdictCards run={run} descriptions={descriptions} />
      <MissingValueBlocks
        values={missingValues}
        agentNature={agentNature}
        onConfigure={onConfigure}
        configuringUuid={configuringUuid}
      />
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
  scoreAgain,
  scoringEvaluatorNames,
  onTryAgain,
  agentNature,
  unconfigured = [],
  onConfigure,
  configuringUuid = null,
}: TraceScorePanelProps) {
  // An evaluator this trace already names as missing a value has its own block.
  const named = new Set(run?.missing_values?.map((v) => v.evaluator_uuid));
  const stillUnconfigured = new Set(unconfigured.map((e) => e.evaluator_uuid));
  const cards =
    run &&
    !error &&
    (run.status === "completed" ||
      (run.status === "skipped" &&
        (run.error === "no_usable_evaluators" ||
          run.error === "missing_trace_values")))
      ? (run.unconfigured_evaluators ?? []).filter(
          (e) =>
            !named.has(e.evaluator_uuid) &&
            stillUnconfigured.has(e.evaluator_uuid),
        )
      : run?.status === "skipped" && run.error === "no_tool_call_evaluator"
        ? (ineligible ?? []).filter(
            (item) =>
              item.reason === "declares_variables" &&
              stillUnconfigured.has(item.evaluator_uuid),
          )
        : [];
  const setUpSince = error ? [] : evaluatorsSetUpSince(run, unconfigured);
  const hasCard = (uuid: string) =>
    cards.some((e) => e.evaluator_uuid === uuid);
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
            (item) => !hasCard(item.evaluator_uuid),
          )}
          onlyNeedValues={
            everyEvaluatorNeedsValues(ineligible ?? []) &&
            (ineligible ?? []).every((item) => hasCard(item.evaluator_uuid))
          }
          onConfigure={onConfigure}
          configuringUuid={configuringUuid}
          configureNames={cards.map((e) => e.name)}
          addToolCallEvaluator={addToolCallEvaluator}
          onGoToEvaluators={onGoToEvaluators}
          scoreTrace={scoreTrace}
          scoringEvaluatorNames={scoringEvaluatorNames}
          onTryAgain={onTryAgain}
        />
      ) : null}
      {setUpSince.length > 0 && (
        <>
          <WarningBox>
            These evaluators were not set up when this trace was scored, and
            can score it now:{" "}
            {setUpSince.map(({ evaluator_uuid, name }, i) => (
              <span key={evaluator_uuid}>
                {i > 0 && " "}
                <span className={EVALUATOR_PILL_CLASSES}>{name}</span>
              </span>
            ))}
          </WarningBox>
          {scoreAgain && <div className="flex">{scoreAgain}</div>}
        </>
      )}
      {cards.map(({ evaluator_uuid, name }) => (
        <DidNotRunCard
          key={evaluator_uuid}
          uuid={evaluator_uuid}
          name={name}
          onConfigure={onConfigure}
          configuringUuid={configuringUuid}
        >
          <p className={DID_NOT_RUN_TEXT}>
            Did not run as it has not been configured for traces
          </p>
        </DidNotRunCard>
      ))}
    </div>
  );
}
