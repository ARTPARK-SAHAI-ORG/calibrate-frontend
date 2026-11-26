"use client";

import type { TraceSummary } from "@/lib/tracesApi";
import React, { useRef, useState } from "react";
import { toast } from "sonner";
import { TraceVariablesDialog } from "@/components/agent-tabs/TraceVariablesDialog";
import { Button } from "@/components/ui/Button";
import {
  fetchAgentEvaluators,
  saveEvaluatorTraceVariables,
  type EvaluatorData,
} from "@/lib/evaluatorApi";
import { reportError } from "@/lib/reportError";
import { needsTraceValues } from "@/lib/traceScoring";

/**
 * The Configure now button and the dialog it opens, handed back separately so
 * the dialog can outlive the warning the button is drawn in.
 */
export function useConfigureTraceValues({
  agentUuid,
  agentNature,
  accessToken,
  onRefresh,
}: {
  agentUuid: string;
  agentNature: "conversation" | "general";
  accessToken: string | null;
  /** Called whenever which evaluators can score may have changed. */
  onRefresh: () => void;
}) {
  // The evaluator being loaded for, or "" while loading for all of them.
  const [loadingFor, setLoadingFor] = useState<string | null>(null);
  const [evaluators, setEvaluators] = useState<EvaluatorData[] | null>(null);
  const [fromTrace, setFromTrace] = useState<TraceSummary | undefined>();

  // Only the latest click's answer counts.
  const latestRequest = useRef(0);

  const configure = async (onlyUuid?: string, trace?: TraceSummary) => {
    if (!accessToken) return;
    const request = ++latestRequest.current;
    const isLatest = () => request === latestRequest.current;
    try {
      setLoadingFor(onlyUuid ?? "");
      const missing = (await fetchAgentEvaluators(agentUuid, accessToken)).filter(
        (e) =>
          onlyUuid ? e.uuid === onlyUuid : needsTraceValues(e, agentNature),
      );
      if (!isLatest()) return;
      if (missing.length > 0) {
        setFromTrace(trace);
        setEvaluators(missing);
      }
      else onRefresh();
    } catch (err) {
      if (!isLatest()) return;
      reportError("Error fetching agent evaluators:", err);
      toast.error("Could not load your evaluators");
    } finally {
      if (isLatest()) setLoadingFor(null);
    }
  };

  const handleSave = async (
    evaluatorUuid: string,
    traceVariables: Record<string, string>,
  ) => {
    await saveEvaluatorTraceVariables(
      agentUuid,
      evaluatorUuid,
      traceVariables,
      // The dialog only opens after configure found a token.
      accessToken as string,
    );
    onRefresh();
  };

  return {
    button: (
      <Button
        variant="secondary"
        size="sm"
        className="shrink-0"
        isLoading={loadingFor === ""}
        onClick={() => void configure()}
      >
        Configure now
      </Button>
    ),
    /** Opens the dialog for one evaluator only. */
    configure,
    /** Opens the dialog for these evaluators, as they are. */
    open: (list: EvaluatorData[] | null) => {
      setFromTrace(undefined);
      setEvaluators(list);
    },
    loadingFor,
    isOpen: evaluators !== null,
    dialog: evaluators && (
      <TraceVariablesDialog
        agentUuid={agentUuid}
        evaluators={evaluators}
        agentNature={agentNature}
        fromTrace={fromTrace}
        onClose={() => setEvaluators(null)}
        onSave={handleSave}
      />
    ),
  };
}
