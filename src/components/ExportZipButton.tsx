"use client";

import React, { useState } from "react";
import JSZip from "jszip";
import type { ExportColumn } from "@/components/ExportResultsButton";

export type ExportZipFile = {
  /** Path inside the zip, e.g. `audios/openai_42.mp3`. */
  path: string;
  /** Absolute URL the browser can `fetch()` directly. */
  url: string;
};

type ExportZipButtonProps = {
  filename: string;
  /**
   * Builds the zip's contents at click time so it always reflects the latest
   * state. Return an empty `rows` array to disable the download.
   *
   * - `csv`: written to the zip's root as `results.csv` using the same
   *   formula-injection-safe escape rules as `ExportResultsButton`.
   * - `files`: external assets fetched and added at their `path` in the zip.
   *   Failures are logged and surfaced as `<path>.error.txt` so the user has
   *   a record without the whole download blowing up.
   */
  getContents: () => {
    csv: { columns: ExportColumn[]; rows: Record<string, unknown>[] };
    files: ExportZipFile[];
  };
  disabled?: boolean;
  label?: string;
  className?: string;
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

function buildCsv(
  columns: ExportColumn[],
  rows: Record<string, unknown>[],
): string {
  const lines = [
    columns.map((c) => escapeCell(c.header)).join(","),
    ...rows.map((r) => columns.map((c) => escapeCell(r[c.key])).join(",")),
  ];
  return lines.join("\n");
}

export function ExportZipButton({
  filename,
  getContents,
  disabled,
  label = "Export",
  className,
}: ExportZipButtonProps) {
  const [isExporting, setIsExporting] = useState(false);

  const handleClick = async () => {
    if (isExporting) return;
    const { csv, files } = getContents();
    if (csv.rows.length === 0 && files.length === 0) return;

    setIsExporting(true);
    try {
      const zip = new JSZip();
      zip.file("results.csv", buildCsv(csv.columns, csv.rows));

      // Fetch each asset in parallel. Use Promise.allSettled so one
      // 404 / network error doesn't kill the whole export.
      const fetched = await Promise.allSettled(
        files.map(async (f) => {
          const res = await fetch(f.url);
          if (!res.ok) {
            throw new Error(`HTTP ${res.status} for ${f.url}`);
          }
          const blob = await res.blob();
          return { path: f.path, blob };
        }),
      );
      fetched.forEach((result, i) => {
        if (result.status === "fulfilled") {
          zip.file(result.value.path, result.value.blob);
        } else {
          const file = files[i];
          const message =
            result.reason instanceof Error
              ? result.reason.message
              : String(result.reason);
          console.error(`Export: failed to fetch ${file.url}`, result.reason);
          zip.file(`${file.path}.error.txt`, message);
        }
      });

      const blob = await zip.generateAsync({ type: "blob" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `${filename}.zip`;
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled || isExporting}
      title="Export results as a zip"
      className={`flex items-center gap-2 h-8 px-2 md:px-3 rounded-lg text-xs md:text-sm font-medium border cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-teal-500/12 border-teal-500/45 text-teal-950 dark:text-teal-100 hover:bg-teal-500/22 dark:hover:bg-teal-500/18 ${className ?? ""}`}
    >
      {isExporting ? (
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
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
      {isExporting ? "Exporting…" : label}
    </button>
  );
}
