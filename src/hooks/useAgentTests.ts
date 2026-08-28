"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { unwrapList } from "@/lib/api";
import { fetchAgentTestsPage, type AgentTest } from "@/lib/agentTestsApi";
import type { SearchMode } from "@/components/ui/SearchModeInput";
import type { TestTypeFilterValue } from "@/components/TestTypeFilter";
import { reportError } from "@/lib/reportError";

type UseAgentTestsArgs = {
  agentUuid: string;
  /** Backend JWT; the hook is idle until it is available. */
  accessToken: string | null;
  pageSize: number;
  /** Search text, already debounced by the caller. Blank searches everything. */
  q?: string;
  /** How the search text is matched against the name. */
  qMode?: SearchMode;
  /** Which kind of test to list. "all" lists every kind. */
  type?: TestTypeFilterValue;
};

/**
 * Server-paginated list of the tests linked to one agent.
 * `GET /agent-tests/agent/{uuid}/tests` takes `limit`/`offset`, the search and
 * the type filter, so only one page is ever held here and every filter counts
 * every matching test rather than only the page on screen.
 */
export function useAgentTests({
  agentUuid,
  accessToken,
  pageSize,
  q = "",
  qMode = "contains",
  type = "all",
}: UseAgentTestsArgs) {
  const [items, setItems] = useState<AgentTest[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The search text the rows on screen came from. It lags `q` while a new
  // search loads, and callers need it to tell "this agent has no tests" from
  // "this search found none".
  const [loadedQ, setLoadedQ] = useState("");
  // Monotonic id so a slow, superseded response cannot overwrite a newer one.
  const requestIdRef = useRef(0);

  useEffect(() => {
    setOffset(0);
  }, [agentUuid, pageSize, q, qMode, type]);

  const load = useCallback(
    async (targetOffset: number) => {
      if (!accessToken) return;
      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      setError(null);
      try {
        const page = await fetchAgentTestsPage(accessToken, {
          agentUuid,
          limit: pageSize,
          offset: targetOffset,
          q,
          qMode,
          type,
        });
        if (requestId !== requestIdRef.current) return;
        // A backend that has not been given paging yet answers with a bare
        // list; then everything it sent is the whole list.
        const rows = unwrapList<AgentTest>(page);
        setItems(rows);
        setTotal(typeof page?.total === "number" ? page.total : rows.length);
        setLoadedQ(q);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        reportError("Error fetching agent tests:", err);
        setItems([]);
        setTotal(0);
        setError("Failed to load agent tests");
      } finally {
        if (requestId === requestIdRef.current) setIsLoading(false);
      }
    },
    [accessToken, agentUuid, pageSize, q, qMode, type],
  );

  useEffect(() => {
    void load(offset);
  }, [load, offset]);

  const refetch = useCallback(() => load(offset), [load, offset]);

  /** Re-sync after `count` tests were removed, stepping back a page when the
   *  current one would now start past the end of the list. */
  const handleRemoved = useCallback(
    (count: number) => {
      const newTotal = Math.max(0, total - count);
      const lastPageOffset =
        Math.max(0, Math.ceil(newTotal / pageSize) - 1) * pageSize;
      if (offset > lastPageOffset) {
        setOffset(lastPageOffset);
      } else {
        void load(offset);
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
    offset,
    isLoading,
    error,
    refetch,
    handleRemoved,
    hasPrev,
    hasNext,
    prevPage,
    nextPage,
  };
}
