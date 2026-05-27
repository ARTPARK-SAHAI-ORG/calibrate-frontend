"use client";

import React, { useState } from "react";

export type ExportColumn = {
  key: string;
  header: string;
};

type ExportRowsResult = {
  columns: ExportColumn[];
  rows: Record<string, unknown>[];
};

type ExportResultsButtonProps = {
  filename: string;
  /**
   * Builds the CSV at click time so it always reflects the latest state.
   * May return a Promise — callers that need to fetch fuller data before
   * exporting (e.g. unpaginated lists) can await the fetch inside this
   * callback. While the promise is in flight the button shows a spinner
   * and is disabled. Return empty `rows` to abort the download.
   */
  getRows: () => ExportRowsResult | Promise<ExportRowsResult>;
  disabled?: boolean;
  label?: string;
  className?: string;
  /** Color palette. "teal" is the default; "neutral" is a quiet outline
   * for pages where teal already means something else. */
  variant?: "teal" | "neutral";
};

const VARIANT_CLASSES: Record<"teal" | "neutral", string> = {
  teal: "bg-teal-500/12 border-teal-500/45 text-teal-950 dark:text-teal-100 hover:bg-teal-500/22 dark:hover:bg-teal-500/18",
  neutral:
    "bg-slate-500/10 border-slate-500/30 text-slate-700 dark:text-slate-200 hover:bg-slate-500/20 dark:hover:bg-slate-500/25",
};

function escapeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  const raw =
    typeof value === "string"
      ? value
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);

  // Prevent spreadsheet apps from interpreting exported user-controlled
  // values as formulas when a CSV is opened in Excel/Sheets.
  const s = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  if (s.includes(",") || s.includes('"') || s.includes("\n") || s.includes("\r")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

export function ExportResultsButton({
  filename,
  getRows,
  disabled,
  label = "Export results",
  className,
  variant = "teal",
}: ExportResultsButtonProps) {
  const [busy, setBusy] = useState(false);
  const handleClick = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await Promise.resolve(getRows());
      const { columns, rows } = result;
      if (rows.length === 0) return;

      const csvLines = [
        columns.map((c) => escapeCell(c.header)).join(","),
        ...rows.map((r) => columns.map((c) => escapeCell(r[c.key])).join(",")),
      ];
      const csv = csvLines.join("\n");

      // Blob URL (not data: URI) so large CSVs aren't capped by the
      // browser URL-length limit. Revoke is deferred to give the browser
      // time to consume the URL before we free it.
      const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${filename}.csv`;
      link.rel = "noopener";
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } finally {
      setBusy(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || busy}
      title="Export results as CSV"
      className={`flex items-center gap-2 h-8 px-2 md:px-3 rounded-lg text-xs md:text-sm font-medium border cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${VARIANT_CLASSES[variant]} ${className ?? ""}`}
    >
      {busy ? (
        <svg
          className="w-4 h-4 animate-spin"
          fill="none"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="4"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
          />
        </svg>
      ) : (
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
          />
        </svg>
      )}
      {busy ? "Preparing…" : label}
    </button>
  );
}
