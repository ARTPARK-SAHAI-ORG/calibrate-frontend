"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  TraceScoreAverage,
  TraceScoreFilters,
  TraceSortOrder,
} from "@/lib/tracesApi";
import {
  fetchTraces,
  traceScoreParams,
  TraceOutputFilter,
  TraceSummary,
} from "@/lib/tracesApi";
import { isTraceScoringInProgress } from "@/lib/traceScoring";
import { POLLING_INTERVAL_MS } from "@/constants/polling";
import { reportError } from "@/lib/reportError";

/** Shared empty default, so a caller with no labels does not hand the hook a
 *  new array on every render. */
const EMPTY_LABELS: string[] = [];

/** Same reason as EMPTY_LABELS: a caller filtering by no score must not hand
 *  the hook a new object on every render. */
const EMPTY_SCORES: TraceScoreFilters = {};

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
  /** One condition per evaluator, all of which must hold. Empty keeps
   *  everything. */
  scores?: TraceScoreFilters;
  /** Order by this evaluator's score instead of newest first. */
  sortByEvaluator?: string | null;
  /** Which way that order runs. Ignored without `sortByEvaluator`. */
  sortOrder?: TraceSortOrder;
  /** When false, skip polling open scoring runs (tab is off screen). */
  poll?: boolean;
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
  scores = EMPTY_SCORES,
  sortByEvaluator = null,
  sortOrder = "desc",
  poll = true,
}: UseTracesArgs) {
  // A new array on every render would restart the fetch forever, so the
  // effects and the fetch key on the labels' text rather than the array.
  const labelKey = labels.join("\u0000");
  // Same trick for the score conditions: an object literal from the caller is
  // new on every render, so the effects key on its text instead. Sorted, so
  // the same set written in another order is the same key.
  const scoreKey = traceScoreParams(scores).sort().join("\u0000");
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
  // The score conditions the rows on screen came from, lagging `scores` the
  // same way, so a caller can tell "this agent has no traces" from "no trace
  // scored like that".
  const [loadedScores, setLoadedScores] = useState<TraceScoreFilters>({});
  // Monotonic id so a slow, superseded response can never clobber the state
  // written by a newer request (filters change mid-flight, rapid paging).
  // Running averages over every matching trace, kept while paging through the
  // result and asked for again only when the filters change.
  const [scoreAverages, setScoreAverages] = useState<TraceScoreAverage[]>([]);
  const averagesKeyRef = useRef<string | null>(null);
  const requestIdRef = useRef(0);
  // The normal load whose spinner is on screen. A silent re-read must not
  // stop it from clearing that spinner when it answers.
  const loadingIdRef = useRef(0);

  useEffect(() => {
    setOffset(0);
  }, [
    agentId,
    pageSize,
    q,
    outputType,
    labelKey,
    scoreKey,
    sortByEvaluator,
    sortOrder,
  ]);

  const load = useCallback(
    async (
      targetOffset: number,
      {
        silent = false,
        withAverages = false,
      }: { silent?: boolean; withAverages?: boolean } = {},
    ): Promise<number> => {
      if (!accessToken) return 0;
      // Silent polls get their own id too: two overlapping 3s refreshes
      // must not let the slower one write an older status back onto the page.
      const requestId = ++requestIdRef.current;
      if (!silent) {
        loadingIdRef.current = requestId;
        setIsLoading(true);
        setError(null);
      }
      try {
        // The filters these rows come from. A new combination is worth the
        // extra pass over every matching trace; a new page of the same one
        // is not.
        const filterKey = JSON.stringify([
          agentId,
          q,
          outputType,
          labelKey,
          scoreKey,
        ]);
        const wantAverages =
          withAverages || averagesKeyRef.current !== filterKey;
        const page = await fetchTraces(accessToken, {
          limit: pageSize,
          offset: targetOffset,
          agentId,
          q,
          outputType,
          labels,
          scores,
          sortByEvaluator,
          sortOrder,
          includeScoreAverages: wantAverages,
        });
        if (requestId !== requestIdRef.current) return 0;
        const nextTotal = page.total ?? 0;
        setItems(page.items ?? []);
        if (wantAverages) {
          averagesKeyRef.current = filterKey;
          setScoreAverages(page.score_averages ?? []);
        }
        setTotal(nextTotal);
        setLoadedQ(q);
        setLoadedOutputType(outputType);
        setLoadedLabels(labels);
        setLoadedScores(scores);
        setLoadedOffset(targetOffset);
        return nextTotal;
      } catch (err) {
        if (requestId !== requestIdRef.current) return 0;
        reportError("Error fetching traces:", err);
        if (silent) return 0;
        // Drop the last page too: leaving it on screen next to the message
        // would let the reader tick and delete rows from a failed load.
        setItems([]);
        setTotal(0);
        // No "Please try again": the screen puts a Try again button beside
        // this, which is the thing to press rather than a sentence to read.
        setError("Failed to load traces");
        return 0;
      } finally {
        if (!silent && requestId === loadingIdRef.current) setIsLoading(false);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      accessToken,
      pageSize,
      agentId,
      q,
      outputType,
      labelKey,
      scoreKey,
      sortByEvaluator,
      sortOrder,
    ],
  );

  useEffect(() => {
    load(offset);
  }, [load, offset]);

  const refetch = useCallback(async () => {
    // Refresh is the reader asking for current numbers, so the averages come
    // with it even though they cost a pass over every matching trace.
    const nextTotal = await load(offset, { withAverages: true });
    return nextTotal === 0;
  }, [load, offset]);

  /** Re-ask for this page while any visible row is still waiting to be scored.
   *  One list request, never one per row. */
  const hasOpenScoring = items.some((t) =>
    isTraceScoringInProgress(t.latest_run_status),
  );
  useEffect(() => {
    if (!poll || !accessToken || isLoading || !hasOpenScoring) return;
    const timer = window.setInterval(() => {
      void load(offset, { silent: true });
    }, POLLING_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [poll, accessToken, isLoading, hasOpenScoring, offset, load]);

  /** Re-sync after `count` rows were deleted, clamping the page back into
   *  range when the current offset would land past the new end. */
  const handleDeleted = useCallback(
    async (count: number) => {
      const newTotal = Math.max(0, total - count);
      const lastPageOffset =
        Math.max(0, Math.ceil(newTotal / pageSize) - 1) * pageSize;
      if (offset > lastPageOffset) {
        setOffset(lastPageOffset);
        return;
      }
      await load(offset);
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
    scoreAverages,
    total,
    loadedQ,
    loadedOutputType,
    loadedLabels,
    loadedScores,
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
