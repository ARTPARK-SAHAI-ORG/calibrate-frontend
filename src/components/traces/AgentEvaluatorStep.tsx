"use client";

import React, { useEffect, useState } from "react";
import { TraceVariablesDialog } from "@/components/agent-tabs/TraceVariablesDialog";
import { CreateEvaluatorFlow } from "@/components/evaluators/CreateEvaluatorFlow";
import { EvaluatorPicker } from "@/components/evaluators/EvaluatorPicker";
import { Button, ErrorNote } from "@/components/ui";
import type { UseAgentLlmEvaluatorsResult } from "@/hooks/useAgentLlmEvaluators";
import {
  addEvaluatorsToAgent,
  saveEvaluatorTraceVariables,
  type EvaluatorData,
} from "@/lib/evaluatorApi";
import { reportError } from "@/lib/reportError";
import { agentTaskType, isMissingTraceValue } from "@/lib/traceScoring";
import {
  fetchTraceVariableValues,
  type TraceSummary,
  type TraceVariableValuesItem,
} from "@/lib/tracesApi";
import type { MissingValues } from "./MissingValuesDialog";
import {
  TraceVariableValues,
  type TraceVariableOutcome,
} from "./TraceVariableValues";

/** A blank label names the trace by what the user said in it, read with
 *  its values, else by its id. */
export type StepTrace = { uuid: string; label: string };

/** Shown when reading the values fails as the reader continues. */
export const READ_VALUES_ERROR =
  "Could not read the values from these traces. Please try again.";

type ValuesByTrace = Record<string, Record<string, Record<string, string | null>>>;

/** Each variable an evaluator declares, with the part of the trace saved for it. */
export function variablesOf(evaluator: EvaluatorData) {
  return (evaluator.live_version?.variables ?? []).map((v) => ({
    name: v.name,
    source: evaluator.trace_variables?.[v.name] ?? "",
  }));
}

export const hasVariables = (evaluator: EvaluatorData) =>
  !!evaluator.live_version?.variables?.length;

/**
 * Reads what each evaluator's variables hold in each trace. `filled` has a
 * blank where a trace holds nothing. `missing` is set when any of them holds
 * nothing, ready for MissingValuesDialog.
 */
export async function readTraceValues(
  accessToken: string,
  agentUuid: string,
  evaluators: EvaluatorData[],
  traces: StepTrace[],
): Promise<{
  filled: Record<string, Record<string, Record<string, string>>>;
  missing: MissingValues | null;
}> {
  const items = await fetchTraceVariableValues(
    accessToken,
    agentUuid,
    traces.map((t) => t.uuid),
    evaluators.map((e) => e.uuid),
  );
  const values: ValuesByTrace = {};
  const filled: Record<string, Record<string, Record<string, string>>> = {};
  const previews: Record<string, string> = {};
  let anyMissing = false;
  for (const item of items) {
    if (item.input_preview) previews[item.trace_id] = item.input_preview;
    const forTrace = (values[item.trace_id] ??= {});
    const forEvaluator = (forTrace[item.evaluator_id] ??= {});
    const filledForTrace = (filled[item.trace_id] ??= {});
    const filledForEvaluator = (filledForTrace[item.evaluator_id] ??= {});
    for (const v of item.values) {
      forEvaluator[v.variable] = v.value;
      filledForEvaluator[v.variable] = v.value ?? "";
      if (v.value === null) anyMissing = true;
    }
  }
  return {
    filled,
    missing: anyMissing
      ? {
          evaluators: evaluators.map((e) => ({
            uuid: e.uuid,
            name: e.name,
            variables: variablesOf(e),
          })),
          traces: traces.map((t) => ({
            traceId: t.uuid,
            label: t.label || previews[t.uuid] || t.uuid,
            values: values[t.uuid] ?? {},
          })),
        }
      : null,
  };
}

type AgentEvaluatorStepProps = {
  list: UseAgentLlmEvaluatorsResult;
  agentUuid: string;
  accessToken: string | null;
  agentNature: "conversation" | "general";
  /** Shown above the list, beside the Create evaluator button. */
  heading: React.ReactNode;
  /** Says what the evaluators are needed for, when there is none to pick. */
  emptyLead: string;
  /** What went wrong, shown under the list. */
  error?: string | null;
  /** Called once an evaluator's variables are set up from here, which links
   *  it to the agent if it was not already. */
  onSetUp?: () => void;
  /** The traces picked, for the values beside each variable. Empty when every
   *  trace the list matches was asked for, since there are no ids then. */
  traces: StepTrace[];
  /** The trace set-up is tried on first. */
  fromTrace?: TraceSummary;
  outcome: TraceVariableOutcome;
  selectedFirst?: boolean;
};

/**
 * Picking the evaluators that judge traces outside a test run, shared by Add
 * to tests and Submit for labelling. An evaluator with a variable that has no
 * part of the trace chosen is set up from here before it can be ticked.
 */
export function AgentEvaluatorStep({
  list,
  agentUuid,
  accessToken,
  agentNature,
  heading,
  emptyLead,
  error,
  onSetUp,
  traces,
  fromTrace,
  outcome,
  selectedFirst,
}: AgentEvaluatorStepProps) {
  const { evaluators, selectedUuids } = list;
  const [createFlowOpen, setCreateFlowOpen] = useState(false);
  // The evaluator made or set up from here, so it opens on the right.
  const [shownUuid, setShownUuid] = useState<string | null>(null);
  const [settingUp, setSettingUp] = useState<EvaluatorData | null>(null);

  // The values of every set-up evaluator with variables, read in one go.
  const evaluatorKey = evaluators
    .filter((e) => hasVariables(e) && !isMissingTraceValue(e))
    .map((e) => e.uuid)
    .join(",");
  const traceKey = traces.map((t) => t.uuid).join(",");
  const [attempt, setAttempt] = useState(0);
  const readKey = `${evaluatorKey}|${traceKey}|${attempt}`;
  // `items` is null when the read failed.
  const [read, setRead] = useState<{
    key: string;
    items: TraceVariableValuesItem[] | null;
  } | null>(null);

  useEffect(() => {
    if (!accessToken || !evaluatorKey || !traceKey) return;
    let cancelled = false;
    fetchTraceVariableValues(
      accessToken,
      agentUuid,
      traceKey.split(","),
      evaluatorKey.split(","),
    )
      .then((items) => {
        if (!cancelled) setRead({ key: readKey, items });
      })
      .catch((err) => {
        reportError("Error reading trace values:", err);
        if (!cancelled) setRead({ key: readKey, items: null });
      });
    return () => {
      cancelled = true;
    };
  }, [accessToken, agentUuid, evaluatorKey, traceKey, readKey]);

  const current = read?.key === readKey ? read : null;

  const renderVariablesPanel = (uuid: string) => {
    const evaluator = evaluators.find((e) => e.uuid === uuid);
    if (
      !evaluator ||
      !hasVariables(evaluator) ||
      isMissingTraceValue(evaluator)
    ) {
      return undefined;
    }
    if (current && current.items === null) {
      return (
        <ErrorNote className="flex items-center justify-between gap-3">
          Could not read the values from these traces
          <Button
            variant="secondary"
            size="sm"
            className="shrink-0"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Try again
          </Button>
        </ErrorNote>
      );
    }
    const items = current?.items?.filter((i) => i.evaluator_id === uuid);
    const loading = traces.length > 0 && !items;
    return (
      <TraceVariableValues
        outcome={outcome}
        agentNature={agentNature}
        loading={loading}
        rows={variablesOf(evaluator).map((v) => ({
          variable: v.name,
          source: v.source,
          perTrace: traces.map((t) => ({
            traceId: t.uuid,
            label: t.label,
            value:
              items
                ?.find((i) => i.trace_id === t.uuid)
                ?.values.find((x) => x.variable === v.name)?.value ?? null,
          })),
        }))}
      />
    );
  };

  const saveSetup = async (
    evaluatorUuid: string,
    traceVariables: Record<string, string>,
  ) => {
    // The dialog only opens with a token.
    const token = accessToken as string;
    // Trace values are saved on the agent's link to the evaluator, so an
    // evaluator from the library is linked to the agent first.
    if (!list.linkedUuids.has(evaluatorUuid)) {
      await addEvaluatorsToAgent(agentUuid, [evaluatorUuid], token);
    }
    await saveEvaluatorTraceVariables(
      agentUuid,
      evaluatorUuid,
      traceVariables,
      token,
    );
    list.updateTraceVariables(evaluatorUuid, traceVariables);
    onSetUp?.();
    setShownUuid(evaluatorUuid);
  };

  const createButton = (className: string) => (
    <button
      type="button"
      onClick={() => setCreateFlowOpen(true)}
      className={`${className} rounded-md font-medium border cursor-pointer transition-colors bg-emerald-500/12 border-emerald-500/45 text-emerald-950 dark:text-emerald-100 hover:bg-emerald-500/22 dark:hover:bg-emerald-500/18`}
    >
      Create evaluator
    </button>
  );

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-2">
      {evaluators.length > 0 && (
        <div className="flex items-center justify-between gap-3">
          {heading}
          {/* The same offer the empty picker makes, kept in reach once there
              is a list to read. */}
          {createButton("h-8 px-3 text-xs md:text-sm")}
        </div>
      )}
      <div className="flex-1 min-h-0">
        <EvaluatorPicker
          evaluators={evaluators}
          selectedIds={selectedUuids}
          onToggle={(uuid) => {
            const evaluator = evaluators.find((e) => e.uuid === uuid);
            // A ticked one always unticks; only ticking waits for set-up.
            if (evaluator && !selectedUuids.has(uuid) && isMissingTraceValue(evaluator)) {
              setSettingUp(evaluator);
            } else list.toggle(uuid);
          }}
          renderRowAction={(evaluator) =>
            isMissingTraceValue(evaluator) ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSettingUp(evaluator)}
              >
                Set up variables
              </Button>
            ) : undefined
          }
          renderVariablesPanel={renderVariablesPanel}
          emptyMessage={`${emptyLead} Your workspace has none that score ${
            agentNature === "general"
              ? "a single output"
              : "a reply in a conversation"
          }, so create one to continue.`}
          emptyAction={createButton("h-9 md:h-10 px-3 md:px-4 text-sm md:text-base")}
          previewUuid={shownUuid}
          fillHeight
          selectedFirst={selectedFirst}
        />
      </div>

      {error && <ErrorNote>{error}</ErrorNote>}

      <CreateEvaluatorFlow
        open={createFlowOpen}
        onClose={() => setCreateFlowOpen(false)}
        existingEvaluators={evaluators}
        onCreated={(created) => {
          list.addEvaluator(created);
          setShownUuid(created.uuid);
          setCreateFlowOpen(false);
        }}
        // Single type only, so the flow skips the "what is this for?" step.
        useCaseTypes={[agentTaskType(agentNature)]}
      />

      {settingUp && (
        <TraceVariablesDialog
          agentUuid={agentUuid}
          evaluators={[settingUp]}
          agentNature={agentNature}
          fromTrace={fromTrace}
          title="Set up the variables"
          onClose={() => setSettingUp(null)}
          onSave={saveSetup}
        />
      )}
    </div>
  );
}
