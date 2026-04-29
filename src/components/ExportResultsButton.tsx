"use client";

import React from "react";

export type ExportColumn = {
  key: string;
  header: string;
};

type ExportResultsButtonProps = {
  filename: string;
  /**
   * Builds the CSV at click time so it always reflects the latest state.
   * Return empty `rows` to disable the download.
   */
  getRows: () => { columns: ExportColumn[]; rows: Record<string, unknown>[] };
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

export function ExportResultsButton({
  filename,
  getRows,
  disabled,
  label = "Export",
  className,
}: ExportResultsButtonProps) {
  const handleClick = () => {
    const { columns, rows } = getRows();
    if (rows.length === 0) return;

    const csvLines = [
      columns.map((c) => escapeCell(c.header)).join(","),
      ...rows.map((r) => columns.map((c) => escapeCell(r[c.key])).join(",")),
    ];
    const csv = csvLines.join("\n");

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${filename}.csv`;
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={disabled}
      title="Export results as CSV"
      className={`flex items-center gap-2 h-8 px-2 md:px-3 rounded-lg text-xs md:text-sm font-medium border cursor-pointer transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-teal-500/12 border-teal-500/45 text-teal-950 dark:text-teal-100 hover:bg-teal-500/22 dark:hover:bg-teal-500/18 ${className ?? ""}`}
    >
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
      {label}
    </button>
  );
}
