"use client";

import { useEffect, useState } from "react";
import {
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
};

export type UseAgentLlmEvaluatorsResult = {
  /** Library evaluators that can judge a reply, minus any needing variables. */
  evaluators: EvaluatorData[];
  /** What to start with ticked: the agent's own, else the reply default. */
  preselectedUuids: Set<string>;
  isLoading: boolean;
  error: string | null;
};

/**
 * The evaluators offered whenever a reply has to be judged outside a test run
 * (adding traces to tests, sending traces for labelling): the LLM evaluators in
 * the library, with the agent's own ones ticked and the built-in reply
 * evaluator as the fallback.
 *
 * Evaluators with variables need a value per variable, and these dialogs have
 * nowhere to ask for those, so they are left out.
 */
export function useAgentLlmEvaluators({
  agentUuid,
  accessToken,
  enabled = true,
}: UseAgentLlmEvaluatorsArgs): UseAgentLlmEvaluatorsResult {
  const [evaluators, setEvaluators] = useState<EvaluatorData[]>([]);
  const [preselectedUuids, setPreselectedUuids] = useState<Set<string>>(
    () => new Set(),
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled || !accessToken) return;
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
            e.evaluator_type === "llm" &&
            (e.live_version?.variables?.length ?? 0) === 0,
        );
        setEvaluators(llm);
        // Start from the agent's own evaluators, limited to the ones on offer.
        const attachedUuids = new Set(attached.map((e) => e.uuid));
        const preselect = llm.filter((e) => attachedUuids.has(e.uuid));
        // Nothing attached: seed the default LLM-reply evaluator, matching how
        // the tests UI seeds.
        const fallback = llm.find(
          (e) => defaultOriginSlug(e) === DEFAULT_LLM_NEXT_REPLY_SLUG,
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
  }, [enabled, accessToken, agentUuid]);

  return { evaluators, preselectedUuids, isLoading, error };
}
