"use client";

import { useCallback, useState } from "react";
import {
  addEvaluatorsToAgent,
  fetchAgentEvaluators,
  fetchAllEvaluators,
  type EvaluatorData,
} from "@/lib/evaluatorApi";
import { reportError } from "@/lib/reportError";

export type AgentDefaultsPromptItem = { uuid: string; name: string };

type UseAgentDefaultsPromptArgs = {
  agentUuid: string;
  accessToken: string | null;
  /** The agent's evaluators, freshly read while working out what is missing. */
  onEvaluatorsRefreshed?: (evaluators: EvaluatorData[]) => void;
  /** Ran after the evaluators are attached, before the prompt closes. */
  onAttached?: () => void | Promise<void>;
  /** Ran once the prompt is done with, whether it was answered or skipped. */
  onSettled?: () => void;
};

/**
 * The "attach these to the agent?" prompt shared by every place that uses
 * evaluators the agent does not have yet: saving a test, adding traces to
 * tests, sending traces for labelling.
 *
 * Attaching is add-only, so an evaluator the reader took off a single test is
 * never taken off the agent here.
 */
export function useAgentDefaultsPrompt({
  agentUuid,
  accessToken,
  onEvaluatorsRefreshed,
  onAttached,
  onSettled,
}: UseAgentDefaultsPromptArgs) {
  const [prompt, setPrompt] = useState<AgentDefaultsPromptItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  /**
   * Show the prompt for whichever of these evaluators the agent does not have.
   * Returns true when it is on screen, so the caller can hold off on closing
   * whatever is behind it.
   */
  const promptFor = useCallback(
    async (
      evaluatorUuids: string[],
      opts?: {
        /** Names the caller has, so an evaluator made moments ago reads well. */
        knownNames?: Map<string, string>;
        /** The agent's evaluators as the caller last saw them, used when the
         *  fresh read fails. Without one, a failed read asks nothing. */
        fallbackAttached?: Set<string>;
      },
    ): Promise<boolean> => {
      if (!accessToken || evaluatorUuids.length === 0) return false;
      const knownNames = opts?.knownNames;
      let attached = opts?.fallbackAttached;
      try {
        const fresh = await fetchAgentEvaluators(agentUuid, accessToken);
        attached = new Set(fresh.map((e) => e.uuid));
        onEvaluatorsRefreshed?.(fresh);
      } catch (err) {
        reportError("Error reading the agent's evaluators:", err);
      }
      // The agent's list is what decides whether anything is missing, so
      // without it there is no honest question to ask.
      if (!attached) return false;
      const missing = Array.from(new Set(evaluatorUuids)).filter(
        (uuid) => !attached.has(uuid),
      );
      if (missing.length === 0) return false;
      // Names are best-effort: the library covers evaluators made moments ago
      // that the caller has no name for.
      let library: EvaluatorData[] = [];
      if (missing.some((uuid) => !knownNames?.get(uuid))) {
        try {
          library = await fetchAllEvaluators(accessToken);
        } catch {
          // Fall back to the generic label below.
        }
      }
      const nameByUuid = new Map(library.map((e) => [e.uuid, e.name]));
      setPrompt(
        missing.map((uuid) => ({
          uuid,
          name: knownNames?.get(uuid) ?? nameByUuid.get(uuid) ?? "Evaluator",
        })),
      );
      setError(null);
      return true;
    },
    [accessToken, agentUuid, onEvaluatorsRefreshed],
  );

  const dismiss = useCallback(() => {
    if (isSaving) return;
    setPrompt(null);
    setError(null);
    onSettled?.();
  }, [isSaving, onSettled]);

  const confirm = useCallback(async () => {
    if (!prompt || !accessToken) return;
    try {
      setIsSaving(true);
      setError(null);
      // Add-only, one call: the prompt holds just the missing ones, so the
      // links the agent already has are left alone.
      await addEvaluatorsToAgent(
        agentUuid,
        prompt.map((ev) => ev.uuid),
        accessToken,
      );
      await onAttached?.();
      setPrompt(null);
      setError(null);
      onSettled?.();
    } catch (err) {
      reportError("Error adding evaluators to agent defaults:", err);
      setError(
        err instanceof Error
          ? err.message
          : prompt.length === 1
            ? "Failed to attach the evaluator"
            : "Failed to attach the evaluators",
      );
    } finally {
      setIsSaving(false);
    }
  }, [prompt, accessToken, agentUuid, onAttached, onSettled]);

  return { prompt, error, isSaving, promptFor, dismiss, confirm };
}
