"use client";

import React from "react";

export type TableColumn = {
  key: string;
  header: string;
  // Optional render function for custom cell rendering
  render?: (value: any, row: Record<string, any>) => React.ReactNode;
};

type DownloadableTableProps = {
  columns: TableColumn[];
  data: Record<string, any>[];
  filename?: string;
  title?: string;
};

export function DownloadableTable({
  columns,
  data,
  filename = "table-data",
  title,
}: DownloadableTableProps) {
  const downloadCSV = () => {
    // Create CSV header
    const headers = columns.map((col) => col.header);
    const csvRows = [headers.join(",")];

    // Add data rows
    data.forEach((row) => {
      const values = columns.map((col) => {
        const value = row[col.key];
        // Handle values that might contain commas or quotes
        if (value === null || value === undefined) return "";
        const stringValue = String(value);
        // Escape quotes and wrap in quotes if contains comma, quote, or newline
        if (
          stringValue.includes(",") ||
          stringValue.includes('"') ||
          stringValue.includes("\n")
        ) {
          return `"${stringValue.replace(/"/g, '""')}"`;
        }
        return stringValue;
      });
      csvRows.push(values.join(","));
    });

    // Create and download file
    const csvContent = csvRows.join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${filename}.csv`);
    link.style.visibility = "hidden";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  if (data.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      {/* Header with title and download button */}
      <div className="flex items-center justify-between">
        {title && (
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
        )}
        <button
          onClick={downloadCSV}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground border border-border rounded-md hover:bg-muted/50 transition-colors cursor-pointer"
          title="Download as CSV"
        >
          <svg
            className="w-3.5 h-3.5"
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
          Download CSV
        </button>
      </div>

      {/* Table — scrolls horizontally instead of cramming/wrapping columns
          when there are many (headers and cells stay single-line). */}
      <div className="border rounded-xl overflow-x-auto">
        <table className="w-full">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-left text-sm font-medium text-foreground whitespace-nowrap"
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((row, rowIndex) => (
              <tr
                key={rowIndex}
                className="border-b border-border last:border-b-0"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className="px-4 py-3 text-sm text-foreground whitespace-nowrap"
                  >
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
