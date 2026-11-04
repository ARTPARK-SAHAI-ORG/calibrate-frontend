"use client";

import React, { useState } from "react";
import { toast } from "sonner";
import { TraceVariablesDialog } from "@/components/agent-tabs/TraceVariablesDialog";
import { Button } from "@/components/ui/Button";
import {
  fetchAgentEvaluators,
  saveEvaluatorTraceVariables,
  type EvaluatorData,
} from "@/lib/evaluatorApi";
import { reportError } from "@/lib/reportError";
import { isMissingTraceValue } from "@/lib/traceScoring";

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
  const [loading, setLoading] = useState(false);
  const [evaluators, setEvaluators] = useState<EvaluatorData[] | null>(null);

  const handleClick = async () => {
    if (!accessToken) return;
    try {
      setLoading(true);
      const missing = (await fetchAgentEvaluators(agentUuid, accessToken)).filter(
        isMissingTraceValue,
      );
      if (missing.length > 0) setEvaluators(missing);
      else onRefresh();
    } catch (err) {
      reportError("Error fetching agent evaluators:", err);
      toast.error("Could not load your evaluators");
    } finally {
      setLoading(false);
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
      // The dialog only opens after handleClick found a token.
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
        isLoading={loading}
        onClick={handleClick}
      >
        Configure now
      </Button>
    ),
    dialog: evaluators && (
      <TraceVariablesDialog
        evaluators={evaluators}
        agentNature={agentNature}
        onClose={() => setEvaluators(null)}
        onSave={handleSave}
      />
    ),
  };
}
