"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  fetchTraceScoringEligibility,
  setAgentAutoScoreTraces,
  type TraceScoringEligibility,
} from "@/lib/tracesApi";
import { parseBackendErrorMessage } from "@/lib/parseBackendError";
import { reportError } from "@/lib/reportError";

type UseAgentTraceScoringArgs = {
  accessToken: string | null;
  agentUuid: string;
  /** Current flag from the agent record. The hook keeps a live copy after a toggle. */
  enabled: boolean;
  /** Required: the agent page saves the new value and feeds it back in as
   *  `enabled`, which is the only copy of the flag. */
  onEnabledChange: (enabled: boolean) => void;
  /**
   * A tab showing the switch or the banner is on screen. Eligibility is
   * fetched when this becomes true so linking an evaluator on another tab
   * unblocks the switch without a full reload.
   */
  isActive?: boolean;
};

export type TraceScoringControls = {
  enabled: boolean;
  saving: boolean;
  setEnabled: (enabled: boolean) => Promise<void>;
  /** null until the eligibility call answers */
  eligibility: TraceScoringEligibility | null;
  eligibilityError: string | null;
  saveError: string | null;
  /** true when scoring is off and no linked evaluator can score */
  enableBlocked: boolean;
};

/**
 * Eligibility + opt-in for automatic trace scoring. Enabling is blocked when
 * no linked evaluator can score this agent; disabling is always allowed.
 * Eligibility stays unknown until a GET succeeds. A missing or failed check
 * is not treated as "no eligible evaluators".
 */
export function useAgentTraceScoring({
  accessToken,
  agentUuid,
  enabled,
  onEnabledChange,
  isActive = true,
}: UseAgentTraceScoringArgs): TraceScoringControls {
  const [eligibility, setEligibility] = useState<TraceScoringEligibility | null>(
    null,
  );
  const [eligibilityError, setEligibilityError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const requestIdRef = useRef(0);

  const loadEligibility = useCallback(async () => {
    if (!accessToken) return;
    const requestId = ++requestIdRef.current;
    setEligibilityError(null);
    try {
      const next = await fetchTraceScoringEligibility(accessToken, agentUuid);
      if (requestId !== requestIdRef.current) return;
      setEligibility(next);
    } catch (err) {
      if (requestId !== requestIdRef.current) return;
      reportError("Error fetching trace scoring eligibility:", err);
      setEligibility(null);
      setEligibilityError(
        "Could not check which evaluators can score this agent's traces.",
      );
    }
  }, [accessToken, agentUuid]);

  // A new agent or token drops the old answer; a tab going off screen does not.
  useEffect(() => {
    requestIdRef.current += 1;
    setEligibility(null);
    setEligibilityError(null);
    setSaveError(null);
  }, [agentUuid, accessToken]);

  useEffect(() => {
    if (!isActive) return;
    // Coming back to the tab rechecks, and drops what the last refusal said.
    setSaveError(null);
    void loadEligibility();
  }, [isActive, loadEligibility]);

  const canEnable = (eligibility?.eligible.length ?? 0) > 0;
  const enableBlocked = !enabled && eligibility !== null && !canEnable;

  const setEnabled = useCallback(
    async (next: boolean) => {
      if (!accessToken) return;
      if (next === enabled) return;
      if (next && !canEnable) return;
      setSaving(true);
      setSaveError(null);
      try {
        const updated = await setAgentAutoScoreTraces(
          accessToken,
          agentUuid,
          next,
        );
        onEnabledChange(!!updated.auto_score_traces);
      } catch (err) {
        reportError("Error updating automatic trace scoring:", err);
        setSaveError(
          parseBackendErrorMessage(
            err,
            "Could not update automatic scoring. Please try again.",
          ),
        );
      } finally {
        setSaving(false);
      }
      // Turning on, or being refused, both mean the linked evaluators may
      // have changed since the last check.
      if (next) void loadEligibility();
    },
    [
      accessToken,
      agentUuid,
      canEnable,
      enabled,
      loadEligibility,
      onEnabledChange,
    ],
  );

  return {
    enabled,
    saving,
    setEnabled,
    eligibility,
    eligibilityError,
    saveError,
    enableBlocked,
  };
}
