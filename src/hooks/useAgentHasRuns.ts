"use client";

import { useCallback, useEffect, useState } from "react";
import { getDefaultHeaders, unwrapList } from "@/lib/api";
import { reportError } from "@/lib/reportError";

/**
 * Whether this agent has any past runs, so the Evaluations tab can stay
 * hidden until there is something to show there. `null` while unknown, and
 * `true` if the check fails, so a hiccup never hides a tab with runs behind
 * it. Call `markHasRuns` when a run is started from another tab.
 */
export function useAgentHasRuns(
  agentUuid: string,
  accessToken: string | null,
) {
  const [hasRuns, setHasRuns] = useState<boolean | null>(null);

  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!accessToken || !backendUrl) return;
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(
          `${backendUrl}/agent-tests/agent/${agentUuid}/runs?limit=1&offset=0`,
          { method: "GET", headers: getDefaultHeaders(accessToken) },
        );
        if (!response.ok) throw new Error("Failed to fetch runs");
        const data = await response.json();
        const count =
          typeof data?.total === "number"
            ? data.total
            : unwrapList(data).length;
        if (!cancelled) setHasRuns(count > 0);
      } catch (error) {
        reportError("Failed to check whether the agent has runs", error);
        if (!cancelled) setHasRuns(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [agentUuid, accessToken]);

  return {
    hasRuns,
    markHasRuns: useCallback(() => setHasRuns(true), []),
  };
}
