"use client";

import { useEffect, useState } from "react";
import { fetchTraceLabels } from "@/lib/tracesApi";
import { reportError } from "@/lib/reportError";

/**
 * The labels this agent's traces carry, for the filter to offer. The trace
 * list is server-paginated and holds one page, so the labels on screen are
 * never the whole set and this asks the backend for all of them.
 *
 * A failure gives an empty list rather than an error: the filter is an extra,
 * and the traces themselves are still readable without it.
 */
export function useTraceLabels(accessToken: string | null, agentId: string) {
  const [labels, setLabels] = useState<string[]>([]);

  useEffect(() => {
    if (!accessToken || !agentId) return;
    let current = true;
    (async () => {
      try {
        const found = await fetchTraceLabels(accessToken, agentId);
        if (current) setLabels(found);
      } catch (err) {
        reportError("Error fetching trace labels:", err);
        if (current) setLabels([]);
      }
    })();
    // A slower answer for the agent just left must not land on the new one.
    return () => {
      current = false;
    };
  }, [accessToken, agentId]);

  return { labels };
}
