"use client";

import React, { useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { LoadingState } from "@/components/ui";
import { useAgentLlmEvaluators } from "@/hooks/useAgentLlmEvaluators";
import { reportError } from "@/lib/reportError";
import type { TraceSummary } from "@/lib/tracesApi";
import {
  AgentEvaluatorStep,
  hasVariables,
  readTraceValues,
  type MissingValues,
  type StepTrace,
} from "./AgentEvaluatorStep";
import { MissingValuesDialog } from "./MissingValuesDialog";

/** Each trace's value for each variable, by trace, then evaluator. Blank
 *  where the trace had nothing. */
export type TraceEvaluatorVariables = Record<
  string,
  Record<string, Record<string, string>>
>;

type TraceLabellingEvaluatorsDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  /** The agent whose traces are being sent, used to seed the selection. */
  agentUuid: string;
  /** Decides which kind of evaluator can judge these traces. */
  agentNature?: "conversation" | "general";
  accessToken: string | null;
  /** The traces being sent, named the way the reader knows them. */
  traces: StepTrace[];
  /** The trace set-up is tried on first. */
  fromTrace?: TraceSummary;
  /** Called with the chosen evaluators, and what their variables read from
   *  each trace, when the reader continues. */
  onChosen: (
    evaluators: { uuid: string; name?: string }[],
    variables: TraceEvaluatorVariables,
  ) => void;
};

/**
 * The first step of sending traces for labelling: which evaluators annotators
 * should score each trace against. Kept separate from the add-to-task dialog
 * because that one needs its items ready before it opens.
 */
export function TraceLabellingEvaluatorsDialog({
  isOpen,
  onClose,
  agentUuid,
  agentNature = "conversation",
  accessToken,
  traces,
  fromTrace,
  onChosen,
}: TraceLabellingEvaluatorsDialogProps) {
  useHideFloatingButton(isOpen);

  const list = useAgentLlmEvaluators({
    agentUuid,
    accessToken,
    enabled: isOpen,
    agentNature,
  });
  const { evaluators, selectedUuids: selected, isLoading, error } = list;
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState<string | null>(null);
  const [missing, setMissing] = useState<{
    shown: MissingValues;
    finish: () => void;
  } | null>(null);

  if (!isOpen) return null;

  const canContinue = !isLoading && !reading && selected.size > 0;

  const handleContinue = async () => {
    const chosen = evaluators.filter((e) => selected.has(e.uuid));
    const refs = chosen.map((e) => ({ uuid: e.uuid, name: e.name }));
    const withVariables = chosen.filter(hasVariables);
    if (withVariables.length === 0 || !accessToken) {
      onChosen(refs, {});
      return;
    }
    setReading(true);
    setReadError(null);
    try {
      const { values, missing: gaps } = await readTraceValues(
        accessToken,
        agentUuid,
        withVariables,
        traces,
      );
      // A value the trace does not have is left blank for the annotator.
      const filled: TraceEvaluatorVariables = {};
      for (const [traceId, byEvaluator] of Object.entries(values)) {
        filled[traceId] = {};
        for (const [evaluatorId, byVariable] of Object.entries(byEvaluator)) {
          filled[traceId][evaluatorId] = Object.fromEntries(
            Object.entries(byVariable).map(([k, v]) => [k, v ?? ""]),
          );
        }
      }
      const finish = () => onChosen(refs, filled);
      if (gaps) setMissing({ shown: gaps, finish });
      else finish();
    } catch (err) {
      reportError("Error reading trace values:", err);
      setReadError("Could not read the values from the traces. Please try again.");
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
              <>
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
                  emptyMessage={
                    agentNature === "general"
                      ? "Annotators score each trace against at least one evaluator. Your workspace has none that score a single output, so create one to continue."
                      : "Annotators score each trace against at least one evaluator. Your workspace has none that score a reply in a conversation, so create one to continue."
                  }
                  traces={traces}
                  fromTrace={fromTrace}
                  outcome="labelling"
                />

                {(error ?? readError) && (
                  <p className="text-sm text-red-600 dark:text-red-400">
                    {error ?? readError}
                  </p>
                )}
              </>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 md:gap-3 p-5 md:p-6 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleContinue()}
              disabled={!canContinue}
              className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {reading ? "Loading..." : "Continue"}
            </button>
          </div>
        </div>
      </div>

      {missing && (
        <MissingValuesDialog
          evaluators={missing.shown.evaluators}
          traces={missing.shown.traces}
          totalTraces={traces.length}
          outcome="labelling"
          agentNature={agentNature}
          onBack={() => setMissing(null)}
          onConfirm={missing.finish}
        />
      )}
    </>
  );
}
