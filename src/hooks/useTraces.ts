"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTraces, TraceSummary } from "@/lib/tracesApi";
import { reportError } from "@/lib/reportError";

type UseTracesArgs = {
  /** Backend JWT; the hook is idle until it's available. */
  accessToken: string | null;
  /** The agent whose traces to list. */
  agentId: string;
  pageSize?: number;
};

/**
 * Server-paginated trace list. Every other list page fetches everything and
 * filters client-side; traces are machine-written and can be far larger than
 * the client should download, so paging round-trips to `GET /traces` and this
 * hook only ever holds one page. The endpoint takes no search term.
 */
export function useTraces({
  accessToken,
  agentId,
  pageSize = 50,
}: UseTracesArgs) {
  const [items, setItems] = useState<TraceSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Monotonic id so a slow, superseded response can never clobber the state
  // written by a newer request (filters change mid-flight, rapid paging).
  const requestIdRef = useRef(0);

  useEffect(() => {
    setOffset(0);
  }, [agentId, pageSize]);

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
        });
        if (requestId !== requestIdRef.current) return 0;
        const nextTotal = page.total ?? 0;
        setItems(page.items ?? []);
        setTotal(nextTotal);
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
    [accessToken, pageSize, agentId],
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
    offset,
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
