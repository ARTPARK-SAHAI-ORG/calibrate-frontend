"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getDefaultHeaders, unwrapList } from "@/lib/api";
import { reportError } from "@/lib/reportError";
import { isRunInProgress, type UnitTestResultLike } from "@/lib/testTypes";
import { POLLING_INTERVAL_MS } from "@/constants/polling";

/**
 * One past run of an agent's tests. A run either tries the tests once against
 * the agent's own model ("llm-unit-test") or against several models at once
 * ("llm-benchmark").
 */
export type AgentRun = {
  uuid: string;
  name: string;
  status: string;
  type: "llm-unit-test" | "llm-benchmark";
  updated_at: string;
  total_tests: number | null;
  passed: number | null;
  failed: number | null;
  error?: boolean;
  results?: UnitTestResultLike[] | null;
  model_results?: { model: string; test_results?: unknown[] }[] | null;
};

/** Which runs to ask for. The backend does the filtering, not the browser. */
export type RunResultFilter = "all" | "passed" | "failed" | "error";

/** The query the backend needs for each choice of result. */
function filterParams(filter: RunResultFilter): Record<string, string> {
  switch (filter) {
    case "passed":
      return { has_failures: "false" };
    case "failed":
      return { has_failures: "true" };
    case "error":
      return { status: "failed" };
    default:
      return {};
  }
}

type UseAgentRunsArgs = {
  agentUuid: string;
  /** Backend JWT; the hook is idle until it is available. */
  accessToken: string | null;
  pageSize: number;
  filter: RunResultFilter;
};

/**
 * Server-paginated list of one agent's past runs. `GET
 * /agent-tests/agent/{uuid}/runs` takes `limit`/`offset` and the result
 * filters, so only one page is ever held here, and unfinished runs on that
 * page are re-asked for until they settle.
 */
export function useAgentRuns({
  agentUuid,
  accessToken,
  pageSize,
  filter,
}: UseAgentRunsArgs) {
  const [items, setItems] = useState<AgentRun[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Monotonic id so a slow, superseded response cannot overwrite a newer one.
  const requestIdRef = useRef(0);

  useEffect(() => {
    setOffset(0);
  }, [agentUuid, pageSize, filter]);

  const load = useCallback(
    async (targetOffset: number) => {
      if (!accessToken) return;
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) return;
      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          limit: String(pageSize),
          offset: String(targetOffset),
          ...filterParams(filter),
        });
        const response = await fetch(
          `${backendUrl}/agent-tests/agent/${agentUuid}/runs?${params}`,
          { method: "GET", headers: getDefaultHeaders(accessToken) },
        );
        if (requestId !== requestIdRef.current) return;
        if (!response.ok) throw new Error("Failed to fetch runs");
        const data = await response.json();
        setItems(unwrapList<AgentRun>(data));
        setTotal(typeof data?.total === "number" ? data.total : 0);
      } catch (err) {
        if (requestId !== requestIdRef.current) return;
        reportError("Error fetching agent runs:", err);
        setItems([]);
        setTotal(0);
        setError("Failed to load runs. Please try again.");
      } finally {
        if (requestId === requestIdRef.current) setIsLoading(false);
      }
    },
    [accessToken, agentUuid, pageSize, filter],
  );

  useEffect(() => {
    void load(offset);
  }, [load, offset]);

  const refetch = useCallback(() => load(offset), [load, offset]);

  // Keep unfinished runs on this page up to date. `skipUuid` is the run
  // already open in a window, which asks for itself.
  const skipUuidRef = useRef<string | null>(null);
  const itemsRef = useRef<AgentRun[]>([]);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const setPollSkip = useCallback((uuid: string | null) => {
    skipUuidRef.current = uuid;
  }, []);

  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl || !accessToken) return;

    const pollUnfinished = async () => {
      const unfinished = itemsRef.current.filter(
        (run) => isRunInProgress(run) && run.uuid !== skipUuidRef.current,
      );
      if (unfinished.length === 0) return;

      for (const run of unfinished) {
        try {
          const endpoint =
            run.type === "llm-unit-test"
              ? `${backendUrl}/agent-tests/run/${run.uuid}`
              : `${backendUrl}/agent-tests/benchmark/${run.uuid}`;
          const response = await fetch(endpoint, {
            method: "GET",
            headers: getDefaultHeaders(accessToken),
          });
          if (!response.ok) continue;
          const result = await response.json();
          setItems((prev) =>
            prev.map((r) =>
              r.uuid !== run.uuid
                ? r
                : run.type === "llm-unit-test"
                  ? {
                      ...r,
                      status: result.status,
                      total_tests: result.total_tests ?? r.total_tests,
                      passed: result.passed ?? r.passed,
                      failed: result.failed ?? r.failed,
                      results: result.results ?? r.results,
                      updated_at: new Date().toISOString(),
                    }
                  : {
                      ...r,
                      status: result.status,
                      model_results: result.model_results ?? r.model_results,
                      updated_at: new Date().toISOString(),
                    },
            ),
          );
        } catch (err) {
          reportError(`Error polling run ${run.uuid}:`, err);
          setItems((prev) =>
            prev.map((r) =>
              r.uuid === run.uuid
                ? {
                    ...r,
                    status: "failed",
                    updated_at: new Date().toISOString(),
                  }
                : r,
            ),
          );
        }
      }
    };

    void pollUnfinished();
    const timer = setInterval(pollUnfinished, POLLING_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [accessToken]);

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
    isLoading,
    error,
    refetch,
    setPollSkip,
    hasPrev,
    hasNext,
    prevPage,
    nextPage,
  };
}
