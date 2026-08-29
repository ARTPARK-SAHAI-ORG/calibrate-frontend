"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTraces, TraceOutputFilter, TraceSummary } from "@/lib/tracesApi";
import { reportError } from "@/lib/reportError";

/** Shared empty default, so a caller with no labels does not hand the hook a
 *  new array on every render. */
const EMPTY_LABELS: string[] = [];

type UseTracesArgs = {
  /** Backend JWT; the hook is idle until it's available. */
  accessToken: string | null;
  /** The agent whose traces to list. */
  agentId: string;
  pageSize?: number;
  /** Search text, already debounced by the caller. Blank searches everything. */
  q?: string;
  /** Keep only replies or only tool calls. "all" keeps everything. */
  outputType?: TraceOutputFilter;
  /** Keep only traces carrying any of these labels. Empty keeps everything. */
  labels?: string[];
};

/**
 * Server-paginated trace list. Every other list page fetches everything and
 * filters client-side; traces are machine-written and can be far larger than
 * the client should download, so paging and search both round-trip to
 * `GET /traces` and this hook only ever holds one page.
 */
export function useTraces({
  accessToken,
  agentId,
  pageSize = 50,
  q = "",
  outputType = "all",
  labels = EMPTY_LABELS,
}: UseTracesArgs) {
  // A new array on every render would restart the fetch forever, so the
  // effects and the fetch key on the labels' text rather than the array.
  const labelKey = labels.join("\u0000");
  const [items, setItems] = useState<TraceSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  // The offset `items` actually came from. `offset` itself changes the
  // instant a page turn is requested, before the fetch for it resolves, so a
  // caller stepping through items page by page (useItemPager) needs this one
  // instead: it only moves once the page it describes has actually loaded.
  const [loadedOffset, setLoadedOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The search text the rows on screen came from. It lags `q` while a new
  // search loads, and callers need it to tell "this agent has no traces" from
  // "this search found none".
  const [loadedQ, setLoadedQ] = useState("");
  // The output filter the rows on screen came from. Like `loadedQ`, it lags
  // `outputType` while a new filter loads, because the value in state changes
  // before the fetch for it resolves.
  const [loadedOutputType, setLoadedOutputType] =
    useState<TraceOutputFilter>("all");
  // The labels the rows on screen came from, lagging `labels` the same way.
  const [loadedLabels, setLoadedLabels] = useState<string[]>([]);
  // Monotonic id so a slow, superseded response can never clobber the state
  // written by a newer request (filters change mid-flight, rapid paging).
  const requestIdRef = useRef(0);

  useEffect(() => {
    setOffset(0);
  }, [agentId, pageSize, q, outputType, labelKey]);

  const load = useCallback(
    async (targetOffset: number): Promise<number> => {
      if (!accessToken) return 0;
      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      setError(null);
      try {
        const page = await fetchTraces(accessToken, {
          limit: pageSize,
          offset: targetOffset,
          agentId,
          q,
          outputType,
          labels,
        });
        if (requestId !== requestIdRef.current) return 0;
        const nextTotal = page.total ?? 0;
        setItems(page.items ?? []);
        setTotal(nextTotal);
        setLoadedQ(q);
        setLoadedOutputType(outputType);
        setLoadedLabels(labels);
        setLoadedOffset(targetOffset);
        return nextTotal;
      } catch (err) {
        if (requestId !== requestIdRef.current) return 0;
        reportError("Error fetching traces:", err);
        // Drop the last page too: leaving it on screen next to the message
        // would let the reader tick and delete rows from a failed load.
        setItems([]);
        setTotal(0);
        setError("Failed to load traces. Please try again.");
        return 0;
      } finally {
        if (requestId === requestIdRef.current) setIsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accessToken, pageSize, agentId, q, outputType, labelKey],
  );

  useEffect(() => {
    load(offset);
  }, [load, offset]);

  const refetch = useCallback(async () => {
    const nextTotal = await load(offset);
    return nextTotal === 0;
  }, [load, offset]);

  /** Re-sync after `count` rows were deleted, clamping the page back into
   *  range when the current offset would land past the new end. */
  const handleDeleted = useCallback(
    (count: number) => {
      const newTotal = Math.max(0, total - count);
      const lastPageOffset =
        Math.max(0, Math.ceil(newTotal / pageSize) - 1) * pageSize;
      if (offset > lastPageOffset) {
        setOffset(lastPageOffset);
      } else {
        load(offset);
      }
    },
    [total, pageSize, offset, load],
  );

  const hasPrev = offset > 0;
  const hasNext = offset + pageSize < total;

  const prevPage = useCallback(() => {
    setOffset((current) => Math.max(0, current - pageSize));
  }, [pageSize]);

  const nextPage = useCallback(() => {
    setOffset((current) =>
      current + pageSize < total ? current + pageSize : current,
    );
  }, [pageSize, total]);

  return {
    items,
    total,
    loadedQ,
    loadedOutputType,
    loadedLabels,
    offset,
    setOffset,
    loadedOffset,
    pageSize,
    isLoading,
    error,
    refetch,
    handleDeleted,
    hasPrev,
    hasNext,
    prevPage,
    nextPage,
  };
}
