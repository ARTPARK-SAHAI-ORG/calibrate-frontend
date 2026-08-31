"use client";

import React, { useState } from "react";

// Click-to-sort column headers, shared by the STT and TTS per-row results
// tables so the two can't drift. Clicking a header sorts smallest first,
// clicking again sorts largest first, and a third click puts the rows back in
// the order the run produced them.

export type SortDirection = "asc" | "desc";
export type SortState = { key: string; dir: SortDirection } | null;

/**
 * Order two cells. Cells that both read as numbers are compared as numbers,
 * everything else as text (case-insensitive). A blank cell always sinks to the
 * bottom, whichever way the column is sorted, so "no value" never reads as the
 * best or the worst score.
 */
export function compareCells(
  a: unknown,
  b: unknown,
  dir: SortDirection,
): number {
  const blank = (v: unknown) =>
    v == null || (typeof v === "string" && v.trim() === "");
  if (blank(a) && blank(b)) return 0;
  if (blank(a)) return 1;
  if (blank(b)) return -1;

  const na = typeof a === "number" ? a : parseFloat(String(a));
  const nb = typeof b === "number" ? b : parseFloat(String(b));
  const bothNumeric = Number.isFinite(na) && Number.isFinite(nb);
  const diff = bothNumeric
    ? na - nb
    : String(a).localeCompare(String(b), undefined, { sensitivity: "base" });
  return dir === "asc" ? diff : -diff;
}

export type SortedRow<T> = { row: T; index: number };

export function useTableSort() {
  const [sort, setSort] = useState<SortState>(null);

  const toggleSort = (key: string) =>
    setSort((prev) => {
      if (prev?.key !== key) return { key, dir: "asc" };
      return prev.dir === "asc" ? { key, dir: "desc" } : null;
    });

  /**
   * Rows in the order they should be shown. Each keeps the position it had in
   * the original list, because that position is the row's ID on screen and the
   * key the labelling checkboxes are tracked by.
   */
  function sortRows<T>(
    rows: T[],
    valueFor: (row: T, key: string, index: number) => unknown,
  ): SortedRow<T>[] {
    const withIndex = rows.map((row, index) => ({ row, index }));
    if (!sort) return withIndex;
    return withIndex.sort((a, b) =>
      compareCells(
        valueFor(a.row, sort.key, a.index),
        valueFor(b.row, sort.key, b.index),
        sort.dir,
      ),
    );
  }

  return { sort, setSort, toggleSort, sortRows };
}

/**
 * The visible way to sort, sitting above the table. The column headings sort
 * too, but nothing on screen says so, and the headings are gone altogether on
 * a phone.
 */
export function SortByControl({
  columns,
  sort,
  onChange,
  className = "",
}: {
  columns: { key: string; label: string }[];
  sort: SortState;
  onChange: (next: SortState) => void;
  className?: string;
}) {
  if (columns.length === 0) return null;
  return (
    // Same picker markup as `PageSizeSelect`, so the two read as one control.
    <div
      className={`flex flex-wrap items-center gap-2 text-sm text-muted-foreground ${className}`}
    >
      <label className="flex items-center gap-2">
        <span>Sort by</span>
        <div className="relative">
          <select
            value={sort?.key ?? ""}
            onChange={(e) =>
              onChange(
                e.target.value
                  ? { key: e.target.value, dir: sort?.dir ?? "asc" }
                  : null,
              )
            }
            className="h-8 pl-3 pr-8 appearance-none rounded-md border border-border bg-background text-sm text-foreground cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {/* Until a metric is picked the rows stay in the order the run
                produced them. Hidden from the list: it is a starting state,
                not something to choose. */}
            <option value="" disabled hidden>
              Pick a metric
            </option>
            {columns.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          <svg
            className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
      </label>
      {sort && (
        <button
          type="button"
          onClick={() =>
            onChange({
              key: sort.key,
              dir: sort.dir === "asc" ? "desc" : "asc",
            })
          }
          className="h-8 px-3 rounded-md text-sm border border-border bg-background text-foreground hover:bg-muted/60 transition-colors cursor-pointer inline-flex items-center gap-1.5"
        >
          <span aria-hidden className="text-[9px] leading-none">
            {sort.dir === "asc" ? "▲" : "▼"}
          </span>
          {sort.dir === "asc" ? "Ascending" : "Descending"}
        </button>
      )}
    </div>
  );
}

export function SortableTh({
  label,
  sortKey,
  sort,
  onToggle,
  style,
  className = "px-4 py-3 text-left text-[12px] font-medium text-foreground",
}: {
  label: React.ReactNode;
  sortKey: string;
  sort: SortState;
  onToggle: (key: string) => void;
  style?: React.CSSProperties;
  className?: string;
}) {
  const active = sort?.key === sortKey;
  return (
    <th
      style={style}
      className={className}
      aria-sort={
        active ? (sort!.dir === "asc" ? "ascending" : "descending") : "none"
      }
    >
      <button
        type="button"
        onClick={() => onToggle(sortKey)}
        className={`inline-flex items-center gap-1 cursor-pointer hover:text-foreground ${
          active ? "text-foreground" : ""
        }`}
      >
        {label}
        <span
          aria-hidden
          className={`text-[8px] leading-none ${active ? "" : "opacity-40"}`}
        >
          {active ? (sort!.dir === "asc" ? "▲" : "▼") : "▾"}
        </span>
      </button>
    </th>
  );
}
