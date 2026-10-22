"use client";

import { Tooltip } from "@/components/Tooltip";
import { useIsNameClipped } from "@/hooks/useIsNameClipped";
import { agreementColor } from "@/components/human-labelling/AgreementStatCard";
import { KappaCell } from "@/components/human-labelling/KappaCell";
import type { AgreementGroup, OverviewRow } from "@/lib/taskOverviewData";

export type OverviewSortKey = "name" | "current";
type SortDirection = "asc" | "desc";

const GRID =
  "grid grid-cols-[minmax(0,1.4fr)_repeat(4,minmax(0,1fr))] gap-4 px-4";

/**
 * One evaluator's name, as a pill that opens how that evaluator judges. The
 * name is cut to fit the row, and the whole of it is on hover only when it is
 * actually cut off: a name already fully readable would just be covered by a
 * popup saying the same thing.
 */
function EvaluatorNamePill({
  name,
  onOpen,
  fitClassName,
}: {
  name: string;
  onOpen: () => void;
  /** Sizing for the row this pill sits in, on whatever wraps the pill. */
  fitClassName: string;
}) {
  const { ref, clipped } = useIsNameClipped(name);
  const pill = (
    <button
      type="button"
      onClick={onOpen}
      className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-muted/40 text-foreground hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer truncate w-full"
    >
      <span ref={ref} className="truncate">
        {name}
      </span>
    </button>
  );
  return clipped ? (
    <Tooltip content={name} className={fitClassName}>
      {pill}
    </Tooltip>
  ) : (
    <div className={`relative ${fitClassName}`}>{pill}</div>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
}: {
  label: string;
  active: boolean;
  dir: SortDirection;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 text-sm font-medium transition-colors cursor-pointer w-fit ${
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {label}
      <svg
        className={`w-3.5 h-3.5 ${active ? "opacity-100" : "opacity-40"}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d={
            dir === "desc"
              ? "M19.5 8.25l-7.5 7.5-7.5-7.5"
              : "M4.5 15.75l7.5-7.5 7.5 7.5"
          }
        />
      </svg>
    </button>
  );
}

function percent(group: AgreementGroup): string {
  return group.current != null ? `${Math.round(group.current * 100)}%` : "—";
}

const GROUPS = [
  { title: "Inter-annotator agreement", pick: (r: OverviewRow) => r.interAnnotator },
  { title: "Evaluator agreement with humans", pick: (r: OverviewRow) => r.withHumans },
] as const;

/** Each evaluator's inter-annotator agreement and its agreement with humans,
 * as a table on wide screens and as cards on narrow ones. */
export function AgreementOverviewTable({
  rows,
  sortKey,
  sortDir,
  onSort,
  onOpenEvaluator,
}: {
  rows: readonly OverviewRow[];
  sortKey: OverviewSortKey;
  sortDir: SortDirection;
  onSort: (key: OverviewSortKey) => void;
  onOpenEvaluator: (evaluator: { uuid: string; name: string }) => void;
}) {
  const name = (row: OverviewRow, fitClassName: string) => (
    <div className="min-w-0 flex-1">
      <EvaluatorNamePill
        name={row.name}
        fitClassName={fitClassName}
        onOpen={() => onOpenEvaluator({ uuid: row.key, name: row.name })}
      />
      {row.kind && (
        <p className="text-xs text-muted-foreground mt-1">{row.kind}</p>
      )}
    </div>
  );
  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block border border-border rounded-xl overflow-hidden">
        <div className="border-b border-border bg-muted/30 py-2 space-y-1">
          <div className={`${GRID} items-center`}>
            <div />
            {GROUPS.map((g) => (
              <div
                key={g.title}
                className="col-span-2 text-sm font-medium text-foreground"
              >
                {g.title}
              </div>
            ))}
          </div>
          <div className={`${GRID} items-center`}>
            <SortHeader
              label="Name"
              active={sortKey === "name"}
              dir={sortDir}
              onClick={() => onSort("name")}
            />
            <div className="text-sm font-medium text-muted-foreground">
              Agreement
            </div>
            <div className="text-sm font-medium text-muted-foreground">
              Kappa
            </div>
            <SortHeader
              label="Agreement"
              active={sortKey === "current"}
              dir={sortDir}
              onClick={() => onSort("current")}
            />
            <div className="text-sm font-medium text-muted-foreground">
              Kappa
            </div>
          </div>
        </div>
        {rows.map((row) => (
          <div
            key={row.key}
            className={`${GRID} py-3 border-b border-border last:border-b-0 items-center`}
          >
            {name(row, "max-w-full min-w-0")}
            {GROUPS.map((g) => {
              const group = g.pick(row);
              return [
                <div
                  key={`${g.title}-agreement`}
                  className={`text-sm font-semibold tabular-nums ${agreementColor(group.current)}`}
                >
                  {percent(group)}
                </div>,
                <div
                  key={`${g.title}-kappa`}
                  className="text-sm font-semibold tabular-nums text-foreground"
                >
                  <KappaCell fields={group} />
                </div>,
              ];
            })}
          </div>
        ))}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {rows.map((row) => (
          <div
            key={row.key}
            className="border border-border rounded-xl overflow-hidden p-4 space-y-2"
          >
            <div className="flex items-center gap-2">
              {name(row, "flex-1 min-w-0")}
            </div>
            {GROUPS.map((g) => {
              const group = g.pick(row);
              return (
                <div key={g.title}>
                  <p className="text-xs text-muted-foreground">{g.title}</p>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span
                      className={`text-base font-semibold tabular-nums ${agreementColor(group.current)}`}
                    >
                      {percent(group)}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      Kappa <KappaCell fields={group} />
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </>
  );
}
