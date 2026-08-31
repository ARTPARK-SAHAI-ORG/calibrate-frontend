"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchTraceLabels, fetchTraceMetadataKeys } from "@/lib/tracesApi";
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
  const { values, refetch } = useTraceFacet(
    fetchTraceLabels,
    accessToken,
    agentId,
  );
  return { labels: values, refetch };
}

/**
 * The metadata keys this agent's traces carry, for the filter to offer.
 * Same story as the labels: one page of rows is never the whole set.
 */
export function useTraceMetadataKeys(
  accessToken: string | null,
  agentId: string,
) {
  const { values, refetch } = useTraceFacet(
    fetchTraceMetadataKeys,
    accessToken,
    agentId,
  );
  return { keys: values, refetch };
}

/** The shared body of both: ask the backend for one agent's whole set of
 *  something, again on demand, and give an empty list when the call fails. */
function useTraceFacet(
  fetchValues: (accessToken: string, agentId: string) => Promise<string[]>,
  accessToken: string | null,
  agentId: string,
) {
  const [values, setValues] = useState<string[]>([]);
  // Bumped to ask again, for when new traces have landed since: a label the
  // agent has only just started sending is not in the answer already held.
  const [reloads, setReloads] = useState(0);

  useEffect(() => {
    if (!accessToken || !agentId) return;
    let current = true;
    (async () => {
      try {
        const found = await fetchValues(accessToken, agentId);
        if (current) setValues(found);
      } catch (err) {
        reportError("Error fetching trace filter values:", err);
        if (current) setValues([]);
      }
    })();
    // A slower answer for the agent just left must not land on the new one.
    return () => {
      current = false;
    };
  }, [fetchValues, accessToken, agentId, reloads]);

  const refetch = useCallback(() => setReloads((n) => n + 1), []);

  return { values, refetch };
}
