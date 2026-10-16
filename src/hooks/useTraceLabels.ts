"use client";

import { useCallback, useEffect, useState } from "react";
import {
  fetchTraceConversationIds,
  fetchTraceLabels,
} from "@/lib/tracesApi";
import { reportError } from "@/lib/reportError";

/**
 * One list a trace filter offers, read whole from the backend: the trace list
 * is server-paginated and holds one page, so what is on screen is never the
 * whole set.
 *
 * A failure gives an empty list rather than an error: the filter is an extra,
 * and the traces themselves are still readable without it.
 */
function useTraceFilterOptions(
  accessToken: string | null,
  agentId: string,
  fetchOptions: (accessToken: string, agentId: string) => Promise<string[]>,
  what: string,
) {
  const [options, setOptions] = useState<string[]>([]);
  // Bumped to ask again, for when new traces have landed since.
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    if (!accessToken || !agentId) return;
    let current = true;
    (async () => {
      try {
        const found = await fetchOptions(accessToken, agentId);
        if (current) setOptions(found);
      } catch (err) {
        reportError(`Error fetching trace ${what}:`, err);
        if (current) setOptions([]);
      }
    })();
    // A slower answer for the agent just left must not land on the new one.
    return () => {
      current = false;
    };
  }, [accessToken, agentId, reloads, fetchOptions, what]);

  const refetch = useCallback(() => setReloads((n) => n + 1), []);

  return { options, refetch };
}

/** The labels this agent's traces carry, for the filter to offer. */
export function useTraceLabels(accessToken: string | null, agentId: string) {
  const { options, refetch } = useTraceFilterOptions(
    accessToken,
    agentId,
    fetchTraceLabels,
    "labels",
  );
  return { labels: options, refetch };
}

/** The conversation IDs on this agent's traces, for the filter to offer. */
export function useTraceConversationIds(
  accessToken: string | null,
  agentId: string,
) {
  const { options, refetch } = useTraceFilterOptions(
    accessToken,
    agentId,
    fetchTraceConversationIds,
    "conversation IDs",
  );
  return { conversationIds: options, refetch };
}
