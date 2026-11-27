"use client";

import { useCallback, useEffect, useState } from "react";
import {
  DEFAULT_LLM_GENERAL_SLUG,
  DEFAULT_LLM_NEXT_REPLY_SLUG,
  defaultOriginSlug,
} from "@/lib/defaultEvaluators";
import {
  fetchAgentEvaluators,
  fetchAllEvaluators,
  EvaluatorData,
} from "@/lib/evaluatorApi";
import { reportError } from "@/lib/reportError";
import { agentTaskType, isMissingTraceValue } from "@/lib/traceScoring";

type UseAgentLlmEvaluatorsArgs = {
  /** The agent whose own evaluators seed the selection. */
  agentUuid: string;
  accessToken: string | null;
  /** Skip the fetch entirely (e.g. the dialog using this is closed). */
  enabled?: boolean;
  /** A general agent's output is judged on its own, so its evaluators are a
   * different kind from the ones that judge a reply in a conversation. */
  agentNature?: "conversation" | "general";
};

export type UseAgentLlmEvaluatorsResult = {
  /** Library evaluators that can judge a reply. Each carries the trace values
   *  saved for it on this agent, as `trace_variables`. */
  evaluators: EvaluatorData[];
  /** What is ticked now: the agent's own (else the reply default) until the
   *  reader ticks something. */
  selectedUuids: Set<string>;
  toggle: (uuid: string) => void;
  /** The evaluators already linked to the agent. */
  linkedUuids: Set<string>;
  /** Records trace values just saved for an evaluator, which links and
   *  ticks it too. */
  updateTraceVariables: (uuid: string, traceVariables: Record<string, string>) => void;
  isLoading: boolean;
  error: string | null;
  /** Put a just-created evaluator on the list and tick it, so a reader who
   * makes one from an empty picker does not have to reopen the dialog. One
   * with variables still to set up is left unticked. */
  addEvaluator: (evaluator: EvaluatorData) => void;
};

/**
 * The evaluators offered whenever what an agent produced has to be judged
 * outside a test run (adding traces to tests, sending traces for labelling):
 * the library evaluators of the kind this agent needs, with the agent's own
 * ones ticked and the matching built-in evaluator as the fallback.
 *
 * Evaluators with variables read each value from a part of the trace, chosen
 * per agent. One with a variable still unchosen is never ticked to start with.
 */
export function useAgentLlmEvaluators({
  agentUuid,
  accessToken,
  enabled = true,
  agentNature = "conversation",
}: UseAgentLlmEvaluatorsArgs): UseAgentLlmEvaluatorsResult {
  const [evaluators, setEvaluators] = useState<EvaluatorData[]>([]);
  const [preselectedUuids, setPreselectedUuids] = useState<Set<string>>(
    () => new Set(),
  );
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [linkedUuids, setLinkedUuids] = useState<Set<string>>(() => new Set());
  const [isLoading, setIsLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !accessToken) {
      // Sign-in has not landed yet, so there is nothing to show and nothing
      // has failed: that reads as still loading, not as a loaded empty list.
      // The effect runs again once the token arrives.
      setIsLoading(enabled && !accessToken);
      return;
    }
    const evaluatorType = agentTaskType(agentNature);
    const defaultSlug =
      agentNature === "general"
        ? DEFAULT_LLM_GENERAL_SLUG
        : DEFAULT_LLM_NEXT_REPLY_SLUG;
    let cancelled = false;
    // Each opening starts from the agent's own evaluators again.
    setPicked(null);
    const load = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const [evs, attached] = await Promise.all([
          fetchAllEvaluators(accessToken),
          // The agent's own evaluators are a nicety: if they fail to load we
          // still offer the library and fall back to the default below.
          fetchAgentEvaluators(agentUuid, accessToken).catch(
            () => [] as EvaluatorData[],
          ),
        ]);
        if (cancelled) return;
        // Which part of a trace fills each variable is saved per agent, so it
        // is only on the agent's own list.
        const saved = new Map(attached.map((e) => [e.uuid, e.trace_variables]));
        const llm = evs
          .filter((e) => e.evaluator_type === evaluatorType)
          .map((e) => ({ ...e, trace_variables: saved.get(e.uuid) ?? null }));
        setEvaluators(llm);
        setLinkedUuids(new Set(saved.keys()));
        // Start from the agent's own evaluators, limited to the ones on offer
        // and ready to use.
        const preselect = llm.filter(
          (e) => saved.has(e.uuid) && !isMissingTraceValue(e),
        );
        // Nothing attached: seed the built-in evaluator for this kind of agent,
        // matching how the tests UI seeds.
        // Left unticked when it still needs set-up, like the agent's own.
        const fallback = llm.find(
          (e) =>
            defaultOriginSlug(e) === defaultSlug && !isMissingTraceValue(e),
        );
        const seed =
          preselect.length > 0 ? preselect : fallback ? [fallback] : [];
        setPreselectedUuids(new Set(seed.map((e) => e.uuid)));
      } catch (err) {
        reportError("Error loading evaluators:", err);
        if (!cancelled) setError("Failed to load evaluators.");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    load();
    return () => {
      cancelled = true;
    };
  }, [enabled, accessToken, agentUuid, agentNature]);

  const addEvaluator = useCallback((evaluator: EvaluatorData) => {
    setEvaluators((prev) =>
      prev.some((e) => e.uuid === evaluator.uuid) ? prev : [...prev, evaluator],
    );
    if (isMissingTraceValue(evaluator)) return;
    setPreselectedUuids((prev) => new Set(prev).add(evaluator.uuid));
    // Ticking already started, so the new one has to join that set.
    setPicked((prev) => (prev ? new Set(prev).add(evaluator.uuid) : prev));
  }, []);

  const selectedUuids = picked ?? preselectedUuids;

  const toggle = (uuid: string) => {
    const next = new Set(selectedUuids);
    if (next.has(uuid)) next.delete(uuid);
    else next.add(uuid);
    setPicked(next);
  };

  const updateTraceVariables = (
    uuid: string,
    traceVariables: Record<string, string>,
  ) => {
    setEvaluators((prev) =>
      prev.map((e) =>
        e.uuid === uuid ? { ...e, trace_variables: traceVariables } : e,
      ),
    );
    setLinkedUuids((prev) => new Set(prev).add(uuid));
    setPicked(new Set(selectedUuids).add(uuid));
  };

  return {
    evaluators,
    selectedUuids,
    toggle,
    linkedUuids,
    updateTraceVariables,
    isLoading,
    error,
    addEvaluator,
  };
}
