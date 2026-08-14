"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { fetchTraces, TraceSummary } from "@/lib/tracesApi";
import { reportError } from "@/lib/reportError";

type UseTracesArgs = {
  /** Backend JWT; the hook is idle until it's available. */
  accessToken: string | null;
  /** The agent whose traces to list. */
  agentId: string;
  /** Server-side search query. Pass the debounced value, not each keystroke. */
  q: string;
  pageSize?: number;
};

/**
 * Server-paginated trace list. Every other list page fetches everything and
 * filters client-side; traces are machine-written and can be far larger than
 * the client should download, so paging and search round-trip to `GET /traces`
 * and this hook only ever holds one page.
 */
export function useTraces({
  accessToken,
  agentId,
  q,
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
  }, [agentId, q, pageSize]);

  const load = useCallback(
    async (targetOffset: number) => {
      if (!accessToken) return;
      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      setError(null);
      try {
        const page = await fetchTraces(accessToken, {
          limit: pageSize,
          offset: targetOffset,
          agentId,
          q: q || undefined,
        });
        if (requestId !== requestIdRef.current) return;
        setItems(page.items ?? []);
        setTotal(page.total ?? 0);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        reportError("Error fetching traces:", err);
        setError("Failed to load traces. Please try again.");
      } finally {
        if (requestId === requestIdRef.current) setIsLoading(false);
      }
    },
    [accessToken, pageSize, agentId, q],
  );

  useEffect(() => {
    load(offset);
  }, [load, offset]);

  const refetch = useCallback(() => load(offset), [load, offset]);

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
