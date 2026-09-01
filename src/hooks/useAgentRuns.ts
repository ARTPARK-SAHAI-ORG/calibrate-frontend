"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getDefaultHeaders, unwrapList } from "@/lib/api";
import { reportError } from "@/lib/reportError";
import { isRunInProgress } from "@/lib/testTypes";
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
  /** How many of the run's tests produced no answer. */
  unanswered_tests?: number | null;
  /** True when someone stopped the run before it finished. */
  aborted?: boolean | null;
  /**
   * The evaluators that judged this run, no duplicates. "Tool call" is added
   * last when the run included a tool-call test, and carries no id because it
   * is not an evaluator in the library. Absent on older backends, empty when
   * the run had no evaluators. Older backends send bare names instead of
   * `{uuid, name}`, so both shapes are read.
   */
  evaluators?: (string | { uuid?: string | null; name?: string | null })[] | null;
  model_results?:
    | {
        model: string;
        /**
         * How many tests this model was tried on. The runs list carries this
         * count but not the per-case `test_results` behind it, which only the
         * run-detail endpoints return.
         */
        total_tests?: number | null;
        test_results?: unknown[];
      }[]
    | null;
  created_at?: string;
};

/** Which runs to ask for. The backend does the filtering, not the browser. */
export type RunResultFilter = "all" | "passed" | "failed" | "error";

/**
 * Which kind of run to ask for: every run, or only the ones that tried the
 * tests against several models at once.
 */
export type RunTypeFilter = "all" | "llm-benchmark";

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
  /** Defaults to every kind of run. */
  typeFilter?: RunTypeFilter;
  /**
   * A run to land the list on directly, wherever its page actually is,
   * instead of always starting at page one — for opening a run from a link.
   * Read once per value: after that first fetch resolves (found or not), the
   * hook stops sending it, so ordinary paging afterwards is unaffected.
   */
  aroundRunId?: string | null;
  /**
   * Which row to start the list on — e.g. the page a reload should reopen
   * on. Only read for the very first fetch; ordinary paging afterwards is
   * unaffected. Superseded entirely by `aroundRunId` whenever both are set,
   * since a linked run's own page is more specific than a remembered one.
   */
  initialOffset?: number;
};

/**
 * Server-paginated list of one agent's past runs. `GET
 * /agent-tests/agent/{uuid}/runs` takes `limit`/`offset` and the result
 * filters, so only one page is ever held here, and unfinished runs on that
 * page are re-asked for until they settle. Passing `aroundRunId` swaps
 * `offset` for `around=<uuid>` on the first fetch, which the backend answers
 * with whichever page that run is actually on.
 */
export function useAgentRuns({
  agentUuid,
  accessToken,
  pageSize,
  filter,
  typeFilter = "all",
  aroundRunId,
  initialOffset = 0,
}: UseAgentRunsArgs) {
  const [items, setItems] = useState<AgentRun[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(initialOffset);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // The run was not among the current results (wrong filter, or it doesn't
  // exist) — the hook already fell back to page one on its own.
  const [aroundNotFound, setAroundNotFound] = useState(false);
  // Monotonic id so a slow, superseded response cannot overwrite a newer one.
  const requestIdRef = useRef(0);
  // Which `aroundRunId` value has already been asked for (or is being asked
  // for right now), so it's sent once. Set the moment a request for it goes
  // out, not when the response comes back — otherwise clearing `aroundRunId`
  // back to null once it's resolved would still look "new" to `load` and
  // trigger a pointless extra plain fetch for the page already in hand.
  const consumedAroundIdRef = useRef<string | null>(null);
  // Mirrors `aroundRunId` so `load` can read the latest value without it
  // being a dependency — see above: `load`'s identity reacting to every
  // `aroundRunId` transition (including the routine "done, back to null")
  // is exactly what caused the extra fetch.
  const aroundRunIdRef = useRef(aroundRunId);
  aroundRunIdRef.current = aroundRunId;
  // Set right before landing `offset` on the page an `around` lookup just
  // answered with — that page's rows are already in hand, so the fetch
  // effect below should skip the request it would otherwise send for the
  // `offset` change it's about to see.
  const skipNextFetchRef = useRef(false);

  // Which agent / page size / filter the current page of rows belongs to.
  // Changing any of them makes the page number meaningless, so the list goes
  // back to page one — but only on a real change. Comparing the values,
  // rather than counting mounts, is what keeps `initialOffset` alive: in
  // development React mounts every component twice, and a "have I run
  // before" flag would see its second run as a change and reset the page the
  // reader asked for.
  const listKey = `${agentUuid}|${pageSize}|${filter}|${typeFilter}`;
  const listKeyRef = useRef(listKey);

  useEffect(() => {
    if (listKeyRef.current === listKey) return;
    listKeyRef.current = listKey;
    setOffset(0);
  }, [listKey]);

  const load = useCallback(
    async (targetOffset: number) => {
      if (!accessToken) return;
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) return;
      const requestedAroundId = aroundRunIdRef.current ?? null;
      const useAround =
        !!requestedAroundId && consumedAroundIdRef.current !== requestedAroundId;
      if (useAround) consumedAroundIdRef.current = requestedAroundId;
      const requestId = ++requestIdRef.current;
      setIsLoading(true);
      setError(null);
      if (useAround) setAroundNotFound(false);
      try {
        const params = new URLSearchParams({
          limit: String(pageSize),
          ...(useAround
            ? { around: requestedAroundId as string }
            : { offset: String(targetOffset) }),
          ...filterParams(filter),
          ...(typeFilter === "all" ? {} : { type: typeFilter }),
        });
        const response = await fetch(
          `${backendUrl}/agent-tests/agent/${agentUuid}/runs?${params}`,
          { method: "GET", headers: getDefaultHeaders(accessToken) },
        );
        if (requestId !== requestIdRef.current) return;
        if (useAround && response.status === 404) {
          // Not in the current results — fall back to the normal first page.
          // `offset` may already be 0, which wouldn't retrigger the fetch
          // effect, so ask for page one directly instead of just setting it.
          setAroundNotFound(true);
          if (targetOffset === 0) {
            void load(0);
          } else {
            setOffset(0);
          }
          return;
        }
        if (!response.ok) throw new Error("Failed to fetch runs");
        const data = await response.json();
        setItems(unwrapList<AgentRun>(data));
        setTotal(typeof data?.total === "number" ? data.total : 0);
        if (useAround) {
          const landedOffset =
            typeof data?.offset === "number" ? data.offset : 0;
          // Already have this page's rows right here — only bother the
          // fetch effect if landing actually moves `offset` off of what it
          // was, and tell it to skip the request that move would trigger.
          if (landedOffset !== targetOffset) {
            skipNextFetchRef.current = true;
            setOffset(landedOffset);
          }
        }
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
    // `aroundRunId` deliberately left out — see `aroundRunIdRef` above.
    [accessToken, agentUuid, pageSize, filter, typeFilter],
  );

  useEffect(() => {
    if (skipNextFetchRef.current) {
      skipNextFetchRef.current = false;
      return;
    }
    void load(offset);
  }, [load, offset]);

  // A run link arriving after the first render — e.g. Back/Forward to a
  // different `?runId=` while this tab stays mounted — needs its own nudge,
  // since `load` no longer reacts to `aroundRunId` on its own (that's what
  // stopped the "done, back to null" case from firing a pointless fetch).
  useEffect(() => {
    if (aroundRunId && consumedAroundIdRef.current !== aroundRunId) {
      void load(offset);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aroundRunId]);

  const refetch = useCallback(() => load(offset), [load, offset]);

  /** Re-read the list after one run was deleted, stepping back a page when
   *  the deleted row was the only one left on this one. Await it before
   *  closing whatever asked for the delete, so the row is already gone by the
   *  time the reader is looking at the list again. */
  const handleDeleted = useCallback(async () => {
    const newTotal = Math.max(0, total - 1);
    const lastPageOffset =
      Math.max(0, Math.ceil(newTotal / pageSize) - 1) * pageSize;
    if (offset > lastPageOffset) {
      // The rows for the page being landed on are read right here, so the
      // effect watching `offset` must not ask for them a second time.
      skipNextFetchRef.current = true;
      setOffset(lastPageOffset);
      await load(lastPageOffset);
      return;
    }
    await load(offset);
  }, [total, pageSize, offset, load]);

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
                      unanswered_tests:
                        result.unanswered_tests ?? r.unanswered_tests,
                      updated_at: result.updated_at ?? r.updated_at,
                    }
                  : {
                      ...r,
                      status: result.status,
                      model_results: result.model_results ?? r.model_results,
                      updated_at: result.updated_at ?? r.updated_at,
                    },
            ),
          );
        } catch (err) {
          // A failed ask says nothing about the run: it is still going as far
          // as anyone here knows. Marking it failed would strand it, since a
          // run that is no longer in progress is never asked about again.
          reportError(`Error polling run ${run.uuid}:`, err);
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
    aroundNotFound,
    refetch,
    handleDeleted,
    setPollSkip,
    hasPrev,
    hasNext,
    prevPage,
    nextPage,
  };
}
