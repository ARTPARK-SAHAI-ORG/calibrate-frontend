"use client";

import { useCallback, useEffect, useState } from "react";
import type {
  TraceOutputFilter,
  TraceScoreFilters,
  TraceSortOrder,
} from "@/lib/tracesApi";

/**
 * Keeps the Monitoring tab's filters and its sort in the address bar, so
 * reloading or sharing the link keeps the same view. Same approach the
 * evaluation run page takes for its item filters, in
 * `human-labelling/valueFilterUrl.ts`.
 *
 * Written with `replaceState`: these are view settings, not a place you
 * navigated to, so the Back button should leave the page rather than undo one
 * filter at a time. Other params on the address, `tab` and `traceId`, are left
 * alone.
 */

/** "response" or "tool_call"; absent means every kind. */
const OUTPUT_PARAM = "output";
/** One entry per picked label, repeated, since a label may contain a comma. */
const LABEL_PARAM = "label";
/** One `<evaluator id>:<condition>` per entry, the same spelling the backend
 *  reads, so what is in the address is what is asked for. */
const SCORE_PARAM = "score";
/** The evaluator the list is sorted by, and which way its scores run. */
const SORT_PARAM = "sort";
const DIRECTION_PARAM = "dir";

export type TraceView = {
  outputType: TraceOutputFilter;
  labels: string[];
  scores: TraceScoreFilters;
  sortByEvaluator: string | null;
  sortOrder: TraceSortOrder;
};

export const EMPTY_TRACE_VIEW: TraceView = {
  outputType: "all",
  labels: [],
  scores: {},
  sortByEvaluator: null,
  sortOrder: "asc",
};

export function readTraceView(): TraceView {
  if (typeof window === "undefined") return EMPTY_TRACE_VIEW;
  const params = new URLSearchParams(window.location.search);
  const output = params.get(OUTPUT_PARAM);
  const scores: TraceScoreFilters = {};
  for (const entry of params.getAll(SCORE_PARAM)) {
    const at = entry.indexOf(":");
    if (at <= 0) continue;
    const condition = entry.slice(at + 1);
    if (condition) scores[entry.slice(0, at)] = condition;
  }
  return {
    outputType:
      output === "response" || output === "tool_call" ? output : "all",
    labels: params.getAll(LABEL_PARAM).filter(Boolean),
    scores,
    sortByEvaluator: params.get(SORT_PARAM) || null,
    sortOrder: params.get(DIRECTION_PARAM) === "desc" ? "desc" : "asc",
  };
}

export function writeTraceView(view: TraceView): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  for (const name of [
    OUTPUT_PARAM,
    LABEL_PARAM,
    SCORE_PARAM,
    SORT_PARAM,
    DIRECTION_PARAM,
  ]) {
    params.delete(name);
  }
  if (view.outputType !== "all") params.set(OUTPUT_PARAM, view.outputType);
  for (const label of view.labels) params.append(LABEL_PARAM, label);
  for (const [uuid, condition] of Object.entries(view.scores)) {
    if (condition) params.append(SCORE_PARAM, `${uuid}:${condition}`);
  }
  if (view.sortByEvaluator) {
    params.set(SORT_PARAM, view.sortByEvaluator);
    params.set(DIRECTION_PARAM, view.sortOrder);
  }
  const query = params.toString();
  const { pathname, hash } = window.location;
  window.history.replaceState(
    null,
    "",
    `${pathname}${query ? `?${query}` : ""}${hash}`,
  );
}

/** The tab's filters and sort, kept in step with the address bar. */
export function useTraceView(): [
  TraceView,
  (next: Partial<TraceView>) => void,
] {
  const [view, setView] = useState<TraceView>(readTraceView);

  // The address is written after the render that changed the view, never
  // inside the state updater: React runs those while it is rendering, and
  // changing the address at that moment is not allowed.
  useEffect(() => {
    writeTraceView(view);
  }, [view]);

  // Opening a trace pushes a history entry, so Back can land on an older
  // address while this tab stays on screen. Read it again rather than leaving
  // the list and the address saying different things.
  useEffect(() => {
    const onPop = () => setView(readTraceView());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const update = useCallback(
    (next: Partial<TraceView>) =>
      setView((current) => ({ ...current, ...next })),
    [],
  );

  return [view, update];
}
