"use client";

import React, { useEffect, useRef, useState } from "react";
import { TraceVariablesDialog } from "@/components/agent-tabs/TraceVariablesDialog";
import { CreateEvaluatorFlow } from "@/components/evaluators/CreateEvaluatorFlow";
import { EvaluatorPicker } from "@/components/evaluators/EvaluatorPicker";
import { Button } from "@/components/ui/Button";
import type { UseAgentLlmEvaluatorsResult } from "@/hooks/useAgentLlmEvaluators";
import {
  addEvaluatorsToAgent,
  saveEvaluatorTraceVariables,
  type EvaluatorData,
} from "@/lib/evaluatorApi";
import { reportError } from "@/lib/reportError";
import { agentTaskType } from "@/lib/traceScoring";
import {
  fetchTraceVariableValues,
  type TraceSummary,
  type TraceVariableValuesItem,
} from "@/lib/tracesApi";
import {
  TraceVariableValues,
  type TraceVariableOutcome,
} from "./TraceVariableValues";

export type StepTrace = { uuid: string; label: string };

type ValuesByTrace = Record<string, Record<string, Record<string, string | null>>>;

export type MissingValues = {
  evaluators: {
    uuid: string;
    name: string;
    variables: { name: string; source: string }[];
  }[];
  traces: {
    traceId: string;
    label: string;
    values: Record<string, Record<string, string | null>>;
  }[];
};

/** Each variable an evaluator declares, with the part of the trace saved for it. */
export function variablesOf(evaluator: EvaluatorData) {
  return (evaluator.live_version?.variables ?? []).map((v) => ({
    name: v.name,
    source: evaluator.trace_variables?.[v.name] ?? "",
  }));
}

export const hasVariables = (evaluator: EvaluatorData) =>
  variablesOf(evaluator).length > 0;

/**
 * Reads what each evaluator's variables hold in each trace. `missing` is set
 * when any of them holds nothing, ready for MissingValuesDialog.
 */
export async function readTraceValues(
  accessToken: string,
  agentUuid: string,
  evaluators: EvaluatorData[],
  traces: StepTrace[],
): Promise<{ values: ValuesByTrace; missing: MissingValues | null }> {
  const items = await fetchTraceVariableValues(
    accessToken,
    agentUuid,
    traces.map((t) => t.uuid),
    evaluators.map((e) => e.uuid),
  );
  const values: ValuesByTrace = {};
  let anyMissing = false;
  for (const item of items) {
    const forTrace = (values[item.trace_id] ??= {});
    const forEvaluator = (forTrace[item.evaluator_id] ??= {});
    for (const v of item.values) {
      forEvaluator[v.variable] = v.value;
      if (v.value === null) anyMissing = true;
    }
  }
  return {
    values,
    missing: anyMissing
      ? {
          evaluators: evaluators.map((e) => ({
            uuid: e.uuid,
            name: e.name,
            variables: variablesOf(e),
          })),
          traces: traces.map((t) => ({
            traceId: t.uuid,
            label: t.label,
            values: values[t.uuid] ?? {},
          })),
        }
      : null,
  };
}

/** Asks for one evaluator's values once it is on show, and only once. */
function LoadOnShow({ onShow }: { onShow: () => void }) {
  useEffect(onShow, [onShow]);
  return null;
}

type AgentEvaluatorStepProps = {
  list: UseAgentLlmEvaluatorsResult;
  agentUuid: string;
  accessToken: string | null;
  agentNature: "conversation" | "general";
  /** Shown above the list, beside the Create evaluator button. */
  heading: React.ReactNode;
  /** Shown when there is no evaluator to pick. */
  emptyMessage: string;
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
  emptyMessage,
  traces,
  fromTrace,
  outcome,
  selectedFirst,
}: AgentEvaluatorStepProps) {
  const { evaluators, selectedUuids, needsSetup } = list;
  const [createFlowOpen, setCreateFlowOpen] = useState(false);
  // The evaluator made or set up from here, so it opens on the right.
  const [shownUuid, setShownUuid] = useState<string | null>(null);
  const [settingUp, setSettingUp] = useState<EvaluatorData | null>(null);
  const [values, setValues] = useState<
    Record<string, TraceVariableValuesItem[] | undefined>
  >({});
  const requested = useRef(new Set<string>());
  // One stable function per evaluator, so showing it again asks nothing.
  const loaders = useRef(new Map<string, () => void>());

  const loaderFor = (uuid: string) => {
    let load = loaders.current.get(uuid);
    if (!load) {
      load = () => {
        if (!accessToken || requested.current.has(uuid)) return;
        requested.current.add(uuid);
        fetchTraceVariableValues(
          accessToken,
          agentUuid,
          traces.map((t) => t.uuid),
          [uuid],
        )
          .then((items) => setValues((prev) => ({ ...prev, [uuid]: items })))
          .catch((err) => {
            reportError("Error reading trace values:", err);
            setValues((prev) => ({ ...prev, [uuid]: [] }));
          });
      };
      loaders.current.set(uuid, load);
    }
    return load;
  };

  const renderPreviewExtra = (uuid: string) => {
    const evaluator = evaluators.find((e) => e.uuid === uuid);
    if (!evaluator || !hasVariables(evaluator) || needsSetup.has(uuid)) {
      return undefined;
    }
    const items = values[uuid];
    const loading = traces.length > 0 && !items;
    return (
      <>
        {loading && <LoadOnShow onShow={loaderFor(uuid)} />}
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
      </>
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
    list.tick(evaluatorUuid);
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
            if (evaluator && needsSetup.has(uuid)) setSettingUp(evaluator);
            else list.toggle(uuid);
          }}
          renderRowAction={(evaluator) =>
            needsSetup.has(evaluator.uuid) ? (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setSettingUp(evaluator)}
              >
                Set up variables
              </Button>
            ) : undefined
          }
          renderPreviewExtra={renderPreviewExtra}
          emptyMessage={emptyMessage}
          emptyAction={createButton("h-9 md:h-10 px-3 md:px-4 text-sm md:text-base")}
          previewUuid={shownUuid}
          fillHeight
          selectedFirst={selectedFirst}
        />
      </div>

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
