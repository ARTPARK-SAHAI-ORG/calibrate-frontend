"use client";

import { useState } from "react";
import { Select } from "@/components/ui/Select";
import type {
  AnalyticsFailure,
  AnalyticsKind,
  AnalyticsLimitHit,
} from "@/lib/analyticsApi";
import { KIND_LABELS, LIMIT_LABELS, formatCount, formatWhen, kindLabel } from "./format";

const FAILURE_KINDS: AnalyticsKind[] = [
  "test_run",
  "model_comparison",
  "simulation",
  "stt",
  "tts",
  "labelling_evaluator_run",
];

// One grid for both lists: a table on wide screens, stacked lines on a phone.
const HEAD = "hidden md:grid gap-3 px-4 py-2 bg-muted/50 border-b border-border text-[12px] font-medium text-muted-foreground";
const ROW = "grid grid-cols-1 gap-1 md:gap-3 px-4 py-3 border-b border-border last:border-b-0 text-[13px] text-foreground";

function LatestNote({ shown, total }: { shown: number; total: number }) {
  if (total <= shown) return null;
  return <p className="text-[12px] text-muted-foreground">Showing the latest {shown}</p>;
}

export function FailuresList({
  failures,
  total,
}: {
  failures: AnalyticsFailure[];
  total: number;
}) {
  const [workspace, setWorkspace] = useState("");
  const [kind, setKind] = useState("");
  const [open, setOpen] = useState<string | null>(null);

  const workspaces = [...new Map(failures.map((f) => [f.org_uuid, f.org_name]))].sort(
    (a, b) => a[1].localeCompare(b[1]),
  );
  // A workspace picked before the dates changed may have no failures now:
  // drop it rather than filter by an option the list no longer shows.
  const activeWorkspace = workspaces.some(([uuid]) => uuid === workspace) ? workspace : "";
  const shown = failures.filter(
    (f) =>
      (!activeWorkspace || f.org_uuid === activeWorkspace) && (!kind || f.kind === kind),
  );
  const cols = "md:grid-cols-[160px_180px_160px_minmax(0,1fr)]";

  return (
    <div className="space-y-3">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <h3 className="text-[15px] font-semibold">Failed evaluations</h3>
        <div className="flex flex-wrap gap-2">
          <Select
            aria-label="Workspace"
            value={activeWorkspace}
            onChange={(e) => setWorkspace(e.target.value)}
            className="cursor-pointer"
            wrapperClassName="min-w-[160px]"
          >
            <option value="">All workspaces</option>
            {workspaces.map(([uuid, name]) => (
              <option key={uuid} value={uuid}>
                {name}
              </option>
            ))}
          </Select>
          <Select
            aria-label="Kind"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            className="cursor-pointer"
            wrapperClassName="min-w-[160px]"
          >
            <option value="">All kinds</option>
            {FAILURE_KINDS.map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </Select>
        </div>
      </div>
      <LatestNote shown={failures.length} total={total} />
      {shown.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">
          {failures.length === 0
            ? "No evaluations failed in these dates"
            : "No failed evaluations match these filters"}
        </p>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <div className={`${HEAD} ${cols}`}>
            <span>When</span>
            <span>Workspace</span>
            <span>Kind</span>
            <span>What went wrong</span>
          </div>
          {shown.map((f) => {
            const expanded = open === f.id;
            return (
              <div
                key={f.id}
                role="button"
                tabIndex={0}
                aria-expanded={expanded}
                onClick={() => {
                  // Selecting the error text to copy it is not a click on the row.
                  if (window.getSelection()?.toString()) return;
                  setOpen(expanded ? null : f.id);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setOpen(expanded ? null : f.id);
                  }
                }}
                className={`${ROW} ${cols} cursor-pointer hover:bg-muted/30`}
              >
                <span className="text-muted-foreground">{formatWhen(f.created_at)}</span>
                <span>{f.org_name}</span>
                <span>{kindLabel(f.kind)}</span>
                <span
                  className={`font-mono text-[12px] min-w-0 ${
                    expanded ? "whitespace-pre-wrap break-words" : "truncate"
                  }`}
                >
                  {f.error || "No details were recorded"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function LimitHitsList({
  hits,
  total,
}: {
  hits: AnalyticsLimitHit[];
  total: number;
}) {
  const cols = "md:grid-cols-[160px_180px_minmax(0,1fr)_160px_90px_90px]";
  return (
    <div className="space-y-3">
      <h3 className="text-[15px] font-semibold">Limit hits</h3>
      <LatestNote shown={hits.length} total={total} />
      {hits.length === 0 ? (
        <p className="text-[13px] text-muted-foreground">No limits were hit in these dates</p>
      ) : (
        <div className="border rounded-xl overflow-hidden">
          <div className={`${HEAD} ${cols}`}>
            <span>When</span>
            <span>Workspace</span>
            <span>Limit</span>
            <span>Kind</span>
            <span>Asked for</span>
            <span>Allowed</span>
          </div>
          {hits.map((h, i) => (
            <div key={`${h.created_at}-${h.org_uuid}-${i}`} className={`${ROW} ${cols}`}>
              <span className="text-muted-foreground">{formatWhen(h.created_at)}</span>
              <span>{h.org_name}</span>
              <span>{LIMIT_LABELS[h.limit_name] ?? h.limit_name}</span>
              <span>{kindLabel(h.kind)}</span>
              <span>
                <span className="md:hidden text-muted-foreground">Asked for </span>
                {h.requested === null ? "Not known" : formatCount(h.requested)}
              </span>
              <span>
                <span className="md:hidden text-muted-foreground">Allowed </span>
                {h.cap === null ? "Not known" : formatCount(h.cap)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
