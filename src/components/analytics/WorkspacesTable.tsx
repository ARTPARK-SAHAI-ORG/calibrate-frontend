"use client";

import { useState } from "react";
import type { AnalyticsWorkspaceRow } from "@/lib/analyticsApi";
import { formatCost, formatCount, formatWhen } from "./format";

type Key = keyof AnalyticsWorkspaceRow;

const COLUMNS: { key: Key; label: string }[] = [
  { key: "name", label: "Workspace" },
  { key: "members", label: "Members" },
  { key: "evaluations", label: "All evaluations" },
  { key: "failed_evaluations", label: "Failed evaluations" },
  { key: "test_runs", label: "Test runs" },
  { key: "model_comparisons", label: "Model comparisons" },
  { key: "simulations", label: "Simulations" },
  { key: "stt", label: "Speech to text" },
  { key: "tts", label: "Text to speech" },
  { key: "labelling_evaluator_runs", label: "Evaluator runs on labelling items" },
  { key: "cost", label: "Cost" },
  { key: "traces_received", label: "Traces received" },
  { key: "traces_scored", label: "Traces scored" },
  { key: "labelling_jobs_finished", label: "Labelling jobs finished" },
  { key: "labels_collected", label: "Labels collected" },
  { key: "items_labelled", label: "Items labelled" },
  { key: "limit_hits", label: "Limit hits" },
  { key: "last_active_at", label: "Last active" },
];

function cell(row: AnalyticsWorkspaceRow, key: Key): string {
  if (key === "name") return row.name;
  if (key === "cost") return formatCost(row.cost);
  if (key === "last_active_at") return formatWhen(row.last_active_at);
  return formatCount(Number(row[key] ?? 0));
}

export function sortWorkspaces(
  rows: AnalyticsWorkspaceRow[],
  key: Key,
  desc: boolean,
): AnalyticsWorkspaceRow[] {
  const sorted = [...rows].sort((a, b) => {
    const x = a[key] ?? (key === "last_active_at" ? "" : 0);
    const y = b[key] ?? (key === "last_active_at" ? "" : 0);
    if (typeof x === "string" && typeof y === "string") return x.localeCompare(y);
    return Number(x) - Number(y);
  });
  return desc ? sorted.reverse() : sorted;
}

export function WorkspacesTable({ rows }: { rows: AnalyticsWorkspaceRow[] }) {
  const [sort, setSort] = useState<{ key: Key; desc: boolean }>({
    key: "evaluations",
    desc: true,
  });
  const sorted = sortWorkspaces(rows, sort.key, sort.desc);
  const toggle = (key: Key) =>
    setSort((s) => (s.key === key ? { key, desc: !s.desc } : { key, desc: true }));

  return (
    <div className="space-y-3">
      <h3 className="text-[15px] font-semibold">Workspaces</h3>
      {rows.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No workspaces yet</p>
      ) : (
        <>
          <div className="hidden md:block border rounded-xl overflow-x-auto">
            <table className="min-w-full">
              <thead className="bg-muted/50 border-b border-border">
                <tr>
                  {COLUMNS.map((col, i) => (
                    <th
                      key={col.key}
                      aria-sort={
                        sort.key === col.key ? (sort.desc ? "descending" : "ascending") : "none"
                      }
                      className={`px-3 py-2 text-left align-bottom text-[12px] font-medium text-muted-foreground min-w-[96px] ${
                        i === 0 ? "sticky left-0 z-10 bg-muted min-w-[180px]" : ""
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => toggle(col.key)}
                        className="text-left whitespace-normal hover:text-foreground cursor-pointer"
                      >
                        {col.label}
                        {sort.key === col.key && (sort.desc ? " ↓" : " ↑")}
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((row) => (
                  <tr key={row.org_uuid} className="border-b border-border last:border-b-0">
                    {COLUMNS.map((col, i) => (
                      <td
                        key={col.key}
                        className={`px-3 py-3 text-[13px] text-foreground ${
                          i === 0
                            ? "sticky left-0 z-10 bg-background font-medium"
                            : "whitespace-nowrap"
                        }`}
                      >
                        {cell(row, col.key)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="md:hidden space-y-3">
            {sorted.map((row) => (
              <div key={row.org_uuid} className="border rounded-xl p-4 bg-muted/10">
                <p className="text-[14px] font-medium mb-2">{row.name}</p>
                <dl className="grid grid-cols-2 gap-x-3 gap-y-2">
                  {COLUMNS.slice(1).map((col) => (
                    <div key={col.key}>
                      <dt className="text-[12px] text-muted-foreground">{col.label}</dt>
                      <dd className="text-[13px] text-foreground">{cell(row, col.key)}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
