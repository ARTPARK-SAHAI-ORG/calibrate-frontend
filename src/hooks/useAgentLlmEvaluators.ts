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
  /** Library evaluators that can judge a reply, minus any needing variables. */
  evaluators: EvaluatorData[];
  /** What to start with ticked: the agent's own, else the reply default. */
  preselectedUuids: Set<string>;
  isLoading: boolean;
  error: string | null;
  /** Put a just-created evaluator on the list and tick it, so a reader who
   * makes one from an empty picker does not have to reopen the dialog. */
  addEvaluator: (evaluator: EvaluatorData) => void;
};

/**
 * The evaluators offered whenever what an agent produced has to be judged
 * outside a test run (adding traces to tests, sending traces for labelling):
 * the library evaluators of the kind this agent needs, with the agent's own
 * ones ticked and the matching built-in evaluator as the fallback.
 *
 * Evaluators with variables need a value per variable, and these dialogs have
 * nowhere to ask for those, so they are left out.
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
    const evaluatorType = agentNature === "general" ? "llm-general" : "llm";
    const defaultSlug =
      agentNature === "general"
        ? DEFAULT_LLM_GENERAL_SLUG
        : DEFAULT_LLM_NEXT_REPLY_SLUG;
    let cancelled = false;
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
        const llm = evs.filter(
          // An evaluator whose prompt expects variables needs a value per
          // variable when it is attached to a test. Neither trace request
          // carries those values and neither dialog can ask for them, so such
          // an evaluator is left out rather than attached half-filled.
          (e) =>
            e.evaluator_type === evaluatorType &&
            (e.live_version?.variables?.length ?? 0) === 0,
        );
        setEvaluators(llm);
        // Start from the agent's own evaluators, limited to the ones on offer.
        const attachedUuids = new Set(attached.map((e) => e.uuid));
        const preselect = llm.filter((e) => attachedUuids.has(e.uuid));
        // Nothing attached: seed the built-in evaluator for this kind of agent,
        // matching how the tests UI seeds.
        const fallback = llm.find((e) => defaultOriginSlug(e) === defaultSlug);
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
    setPreselectedUuids((prev) => new Set(prev).add(evaluator.uuid));
  }, []);

  return { evaluators, preselectedUuids, isLoading, error, addEvaluator };
}
