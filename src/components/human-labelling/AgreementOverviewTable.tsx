"use client";

import { Tooltip } from "@/components/Tooltip";
import { useIsNameClipped } from "@/hooks/useIsNameClipped";
import {
  ChanceBar,
  ChanceLegend,
} from "@/components/human-labelling/AgreementStatCard";
import { KappaCell } from "@/components/human-labelling/KappaCell";
import type { AgreementGroup, OverviewRow } from "@/lib/taskOverviewData";

export type OverviewSortKey = "name" | "interAnnotator" | "withHumans";
type SortDirection = "asc" | "desc";

const GRID =
  "grid grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)] gap-4 px-4";
// A thin line before each measure column.
const DIVIDER = "border-l border-border pl-4 min-w-0 self-stretch flex items-center";

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
      className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-muted/40 text-foreground hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer truncate max-w-full"
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

const DASH = <span className="text-sm text-muted-foreground">—</span>;

/** One measure: the agreement and its kappa on one line, a chance bar under
 * them, or a muted dash when there is no agreement. */
function MeasureCell({ group }: { group: AgreementGroup }) {
  if (group.current == null) return DASH;
  return (
    <div className="min-w-0 w-full">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-semibold tabular-nums text-foreground">
          {Math.round(group.current * 100)}%
        </span>
        <span className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
          Kappa
          <KappaCell fields={group} />
        </span>
      </div>
      <ChanceBar
        agreement={group.current}
        chanceAgreement={group.chance_agreement}
      />
    </div>
  );
}

const MEASURES = [
  {
    title: "Inter-annotator agreement",
    sortKey: "interAnnotator",
    pick: (r: OverviewRow) => r.interAnnotator,
  },
  {
    title: "Evaluator agreement with humans",
    sortKey: "withHumans",
    pick: (r: OverviewRow) => r.withHumans,
  },
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
  const name = (row: OverviewRow) => (
    <div className="flex items-center gap-2 min-w-0">
      <EvaluatorNamePill
        name={row.name}
        fitClassName="min-w-0 max-w-full"
        onOpen={() => onOpenEvaluator({ uuid: row.key, name: row.name })}
      />
      {row.kind && (
        <span className="text-xs text-muted-foreground shrink-0">
          {row.kind}
        </span>
      )}
    </div>
  );
  const hasBar = rows.some(
    (r) => r.interAnnotator.current != null || r.withHumans.current != null,
  );
  return (
    <>
      {hasBar && <ChanceLegend />}
      {/* Desktop table */}
      <div className="hidden md:block border border-border rounded-xl overflow-hidden">
        <div className={`${GRID} py-2 border-b border-border bg-muted/30 items-center`}>
          <SortHeader
            label="Evaluator"
            active={sortKey === "name"}
            dir={sortDir}
            onClick={() => onSort("name")}
          />
          {MEASURES.map((m) => (
            <div key={m.sortKey} className={DIVIDER}>
              <SortHeader
                label={m.title}
                active={sortKey === m.sortKey}
                dir={sortDir}
                onClick={() => onSort(m.sortKey)}
              />
            </div>
          ))}
        </div>
        {rows.map((row) => (
          <div
            key={row.key}
            className={`${GRID} py-3 border-b border-border last:border-b-0 items-center`}
          >
            {name(row)}
            {MEASURES.map((m) => (
              <div key={m.sortKey} className={DIVIDER}>
                <MeasureCell group={m.pick(row)} />
              </div>
            ))}
          </div>
        ))}
      </div>

      {/* Mobile cards */}
      <div className="md:hidden space-y-2">
        {rows.map((row) => (
          <div
            key={row.key}
            className="border border-border rounded-xl overflow-hidden p-4 space-y-3"
          >
            {name(row)}
            {MEASURES.map((m) => (
              <div key={m.sortKey}>
                <p className="text-xs text-muted-foreground mb-1">{m.title}</p>
                <MeasureCell group={m.pick(row)} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}
