"use client";

import { useState, type ReactNode } from "react";
import { Tooltip } from "@/components/Tooltip";
import { useIsNameClipped } from "@/hooks/useIsNameClipped";
import {
  ChanceBar,
  ChanceLegend,
  OverallAgreementCards,
} from "@/components/human-labelling/AgreementStatCard";
import { KappaCell } from "@/components/human-labelling/KappaCell";
import type { AnswerKind, KappaByKind } from "@/lib/agreementKappa";
import {
  buildOverviewRows,
  overviewRows,
  sortOverviewRows,
  type AgreementGroup,
  type EvaluatorAgreement,
  type OverviewRow,
} from "@/lib/taskOverviewData";

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

/**
 * One measure's agreement, kappa and chance bar, laid out three ways:
 * - `table`: agreement and kappa on one line over the bar, for a table cell.
 * - `hover`: the same with a larger number and more room, for a hover box.
 * - `card`: a large number, the bar, then the chance and the kappa on one
 *   line, for a column of a card.
 * With no agreement it is a muted dash, large in a card.
 */
export function MeasureCell({
  group,
  variant = "table",
}: {
  group: AgreementGroup;
  variant?: "table" | "hover" | "card";
}) {
  if (group.current == null)
    return variant === "card" ? (
      <div className="text-2xl font-semibold text-muted-foreground">—</div>
    ) : (
      DASH
    );
  const percent = `${Math.round(group.current * 100)}%`;
  const kappa = (
    <span className="inline-flex flex-wrap items-center gap-1 min-w-0 text-xs text-muted-foreground tabular-nums">
      Kappa
      <KappaCell fields={group} />
    </span>
  );
  // pt-1 on top of the bar's own 8px gives 12px above it.
  const bar = (
    <div className={variant === "table" ? "" : "pt-1"}>
      <ChanceBar
        agreement={group.current}
        chanceAgreement={group.chance_agreement}
      />
    </div>
  );
  if (variant === "card") {
    const chance = group.chance_agreement;
    return (
      <div className="min-w-0 w-full">
        <div className="text-2xl font-semibold tabular-nums text-foreground">
          {percent}
        </div>
        {bar}
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
          <span>{chance != null ? `Chance ${Math.round(chance * 100)}%` : ""}</span>
          {kappa}
        </div>
      </div>
    );
  }
  return (
    <div className="min-w-0 w-full">
      {/* Wraps in a narrow column rather than spilling into the next one. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span
          className={`${variant === "hover" ? "text-base" : "text-sm"} font-semibold tabular-nums text-foreground`}
        >
          {percent}
        </span>
        {kappa}
      </div>
      {bar}
    </div>
  );
}

const ANSWER_KINDS: AnswerKind[] = ["binary", "rating"];

/**
 * An annotator's agreement with the others in one card of three equal
 * columns: overall, then binary and rating labels each with its own bar.
 * The columns stack on a narrow screen.
 */
export function AgreementByKindCard({
  overall,
  kinds,
}: {
  overall: number | null | undefined;
  kinds: readonly KappaByKind[] | null | undefined;
}) {
  const column = (title: string, content: ReactNode) => (
    <div key={title} className="p-6 min-w-0">
      <div className="text-sm font-medium text-foreground mb-3">{title}</div>
      {content}
    </div>
  );
  return (
    <div className="border border-border rounded-xl bg-background grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
      {column(
        "Overall",
        overall != null ? (
          <div className="text-2xl font-semibold tabular-nums text-foreground">
            {Math.round(overall * 100)}%
          </div>
        ) : (
          <div className="text-2xl font-semibold text-muted-foreground">—</div>
        ),
      )}
      {ANSWER_KINDS.map((kind) => {
        const entry = kinds?.find((k) => k.answer_kind === kind);
        return column(
          kind === "binary" ? "Binary labels" : "Rating labels",
          <MeasureCell
            variant="card"
            group={{
              ...entry,
              current: entry?.agreement ?? null,
              pair_count: entry?.pair_count ?? 0,
            }}
          />,
        );
      })}
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

/**
 * Agreement laid out for the Overview tab and the task page: the two overall
 * numbers, then the evaluators in the sortable table. Under All tasks an
 * evaluator with nothing in either measure is left out; one task lists every
 * linked evaluator. Rendered as siblings so the caller's spacing applies.
 */
export function AgreementOverviewSection({
  agreement,
  onOpenEvaluator,
  allTasks = false,
  evaluatorTypeOf,
}: {
  agreement: {
    human_human?: { current: number | null } | null;
    evaluators_with_humans?: { current: number | null } | null;
    evaluators?: EvaluatorAgreement[];
  };
  onOpenEvaluator: (evaluator: { uuid: string; name: string }) => void;
  allTasks?: boolean;
  /** Groups evaluators of the same type together in the table. */
  evaluatorTypeOf?: (evaluatorId: string) => string | undefined;
}) {
  const [sortKey, setSortKey] = useState<OverviewSortKey>("withHumans");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const handleSort = (key: OverviewSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };
  const rows = overviewRows(
    buildOverviewRows(agreement.evaluators ?? []).map((row) => ({
      ...row,
      evaluatorType: evaluatorTypeOf?.(row.key),
    })),
    allTasks,
  );
  return (
    <>
      <div className="flex flex-wrap items-stretch gap-3">
        <OverallAgreementCards
          interAnnotator={agreement.human_human}
          withHumans={agreement.evaluators_with_humans}
        />
      </div>
      <AgreementOverviewTable
        rows={sortOverviewRows(rows, sortKey, sortDir)}
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={handleSort}
        onOpenEvaluator={onOpenEvaluator}
      />
    </>
  );
}
