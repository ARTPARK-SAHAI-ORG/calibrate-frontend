"use client";

import React, { useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { Button, LoadingState } from "@/components/ui";
import { useAgentLlmEvaluators } from "@/hooks/useAgentLlmEvaluators";
import { reportError } from "@/lib/reportError";
import { declaresVariables } from "@/lib/traceScoring";
import type { TraceSummary } from "@/lib/tracesApi";
import {
  AgentEvaluatorStep,
  readTraceValues,
  READ_VALUES_ERROR,
  type StepTrace,
} from "./AgentEvaluatorStep";
import { MissingValuesDialog, type MissingValues } from "./MissingValuesDialog";

/** Each trace's value for each variable, by trace, then evaluator. Blank
 *  where the trace had nothing. */
export type TraceEvaluatorVariables = Record<
  string,
  Record<string, Record<string, string>>
>;

type TraceLabellingEvaluatorsDialogProps = {
  onClose: () => void;
  /** The agent whose traces are being sent, used to seed the selection. */
  agentUuid: string;
  /** Decides which kind of evaluator can judge these traces. */
  agentNature?: "conversation" | "general";
  accessToken: string | null;
  /** The traces whose items carry evaluator values, named the way the
   *  reader knows them. */
  traces: StepTrace[];
  /** The trace set-up is tried on first. */
  fromTrace?: TraceSummary;
  /** Called with the chosen evaluators, and what their variables read from
   *  each trace, when the reader continues. */
  onChosen: (
    evaluators: { uuid: string; name?: string }[],
    variables: TraceEvaluatorVariables,
  ) => void;
  /** Called once an evaluator's variables are set up from here. */
  onEvaluatorSetUp?: () => void;
};

/**
 * The first step of sending traces for labelling: which evaluators annotators
 * should score each trace against. Kept separate from the add-to-task dialog
 * because that one needs its items ready before it opens.
 */
export function TraceLabellingEvaluatorsDialog({
  onClose,
  agentUuid,
  agentNature = "conversation",
  accessToken,
  traces,
  fromTrace,
  onChosen,
  onEvaluatorSetUp,
}: TraceLabellingEvaluatorsDialogProps) {
  useHideFloatingButton(true);

  const list = useAgentLlmEvaluators({ agentUuid, accessToken, agentNature });
  const { evaluators, selectedUuids: selected, isLoading, error } = list;
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [missing, setMissing] = useState<{
    shown: MissingValues;
    filled: TraceEvaluatorVariables;
  } | null>(null);

  const canContinue = !isLoading && !reading && selected.size > 0;
  const chosen = evaluators.filter((e) => selected.has(e.uuid));
  const refs = chosen.map((e) => ({ uuid: e.uuid, name: e.name }));

  const handleContinue = async () => {
    const withVariables = chosen.filter(declaresVariables);
    if (withVariables.length === 0 || !accessToken) {
      onChosen(refs, {});
      return;
    }
    setReading(true);
    setReadError(null);
    try {
      // A value the trace does not have is left blank for the annotator.
      const { filled, missing: gaps } = await readTraceValues(
        accessToken,
        agentUuid,
        withVariables,
        traces,
      );
      if (gaps) setMissing({ shown: gaps, filled });
      else onChosen(refs, filled);
    } catch (err) {
      reportError("Error reading trace values:", err);
      setReadError(READ_VALUES_ERROR);
    } finally {
      setReading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
        <div className="bg-background rounded-xl w-full max-w-6xl max-h-[90vh] md:h-[85vh] flex flex-col shadow-2xl">
          <div className="p-5 md:p-6 border-b border-border">
            <h2 className="text-base md:text-lg font-semibold text-foreground">
              Submit traces for labelling
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Pick at least one evaluator. Annotators score the agent&apos;s{" "}
              {agentNature === "general" ? "output" : "reply"} against these.
            </p>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden p-5 md:p-6 flex flex-col gap-2">
            {isLoading ? (
              <LoadingState />
            ) : (
              <AgentEvaluatorStep
                list={list}
                agentUuid={agentUuid}
                accessToken={accessToken}
                agentNature={agentNature}
                heading={
                  <div className="text-sm font-semibold text-foreground">
                    Evaluators
                  </div>
                }
                emptyLead="Annotators score each trace against at least one evaluator."
                error={error ?? readError}
                onSetUp={onEvaluatorSetUp}
                traces={traces}
                fromTrace={fromTrace}
                outcome="labelling"
              />
            )}
          </div>

          <div className="flex items-center justify-end gap-2 md:gap-3 p-5 md:p-6 border-t border-border">
            {/* Held while the values are read, so the next window cannot
                open after the reader has left this one. */}
            <Button
              variant="secondary"
              size="md"
              onClick={onClose}
              disabled={reading}
            >
              Cancel
            </Button>
            <Button
              size="md"
              onClick={() => void handleContinue()}
              disabled={!canContinue}
            >
              {reading ? "Loading..." : "Continue"}
            </Button>
          </div>
        </div>
      </div>

      {missing && (
        <MissingValuesDialog
          missing={missing.shown}
          totalTraces={traces.length}
          outcome="labelling"
          agentNature={agentNature}
          onBack={() => setMissing(null)}
          onConfirm={() => onChosen(refs, missing.filled)}
        />
      )}
    </>
  );
}
