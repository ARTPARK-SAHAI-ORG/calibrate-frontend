"use client";

import { useCallback, useState } from "react";
import type { ValueFilter } from "./ItemValueFilter";

/**
 * Keeps the item filters of the evaluation run page and the labelling job
 * page in the address bar, so reloading or sharing the link keeps the same
 * filters on.
 *
 * The filters are written with `replaceState`: they are a view setting, not
 * a place you navigated to, so the Back button should leave the page rather
 * than undo one filter at a time.
 *
 * Both pages read the address bar once, as their first state. That is safe
 * here because both fetch their data in the browser, so the page the server
 * sends is a loading state with no filters in it.
 */

/** The query name for the "show only items scored X" filters. */
export const VALUE_FILTERS_PARAM = "scores";
/** The query name for the run page's disagreements-only toggle. */
export const DISAGREEMENTS_PARAM = "disagreements";
/** The query name for the item currently open in an annotation job, so a
 * reload or a shared link lands back on the same item. */
export const ITEM_PARAM = "item";

export function readUrlParam(param: string): string | null {
  if (typeof window === "undefined") return null;
  return new URLSearchParams(window.location.search).get(param);
}

export function writeUrlParam(param: string, value: string | null): void {
  if (typeof window === "undefined") return;
  const params = new URLSearchParams(window.location.search);
  if (value) {
    params.set(param, value);
  } else {
    params.delete(param);
  }
  const qs = params.toString();
  window.history.replaceState(
    null,
    "",
    qs ? `${window.location.pathname}?${qs}` : window.location.pathname,
  );
}

/**
 * `evaluatorId:value.value,evaluatorId:value`. A score is a number or the
 * words true / false, matching the two shapes `ValueFilter.values` holds.
 */
export function encodeValueFilters(filters: readonly ValueFilter[]): string {
  return filters
    .filter((f) => f.values.length > 0)
    .map((f) => `${f.evaluatorId}:${f.values.map(String).join(".")}`)
    .join(",");
}

export function decodeValueFilters(raw: string | null): ValueFilter[] {
  if (!raw) return [];
  const filters: ValueFilter[] = [];
  for (const part of raw.split(",")) {
    const at = part.indexOf(":");
    if (at <= 0) continue;
    const evaluatorId = part.slice(0, at);
    const values = part
      .slice(at + 1)
      .split(".")
      .map((v): boolean | number | null => {
        if (v === "true") return true;
        if (v === "false") return false;
        const n = Number(v);
        return v.trim() !== "" && Number.isFinite(n) ? n : null;
      })
      .filter((v): v is boolean | number => v !== null);
    if (values.length > 0) filters.push({ evaluatorId, values });
  }
  return filters;
}

/** The value filters, kept in step with the address bar. */
export function useUrlValueFilters(): [
  ValueFilter[],
  (next: ValueFilter[]) => void,
] {
  const [filters, setFilters] = useState<ValueFilter[]>(() =>
    decodeValueFilters(readUrlParam(VALUE_FILTERS_PARAM)),
  );

  const set = useCallback((next: ValueFilter[]) => {
    setFilters(next);
    writeUrlParam(VALUE_FILTERS_PARAM, encodeValueFilters(next) || null);
  }, []);

  return [filters, set];
}
