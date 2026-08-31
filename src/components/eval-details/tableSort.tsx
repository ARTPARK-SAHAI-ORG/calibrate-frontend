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

  return { sort, toggleSort, sortRows };
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
