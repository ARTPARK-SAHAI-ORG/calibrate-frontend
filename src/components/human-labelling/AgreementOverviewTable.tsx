"use client";

import { useState, type ReactNode } from "react";
import { ChevronDownIcon } from "@/components/icons";
import {
  AgreementStatCard,
  BigPercent,
  ChanceBar,
  ChanceLegend,
  chanceText,
  type EvaluatorResultStat,
} from "@/components/human-labelling/AgreementStatCard";
import { EvaluatorNamePill } from "@/components/human-labelling/EvaluatorNamePill";
import { KappaCell } from "@/components/human-labelling/KappaCell";
import {
  SortByControl,
  type SortDirection,
} from "@/components/eval-details/tableSort";
import {
  ANSWER_KINDS,
  formatAgreement,
  kappaForKind,
  type KappaByKind,
} from "@/lib/agreementKappa";
import {
  buildOverviewRows,
  overviewRows,
  sortOverviewRows,
  type AgreementGroup,
  type OverviewRow,
  type OverviewSortKey,
  type TaskAgreementResponse,
} from "@/lib/taskOverviewData";

// A thin line before each measure column.
const DIVIDER = "border-l border-border pl-4 min-w-0 self-stretch flex items-center";

export const DASH = <span className="text-sm text-muted-foreground">—</span>;

/** Whether any of these measures draws a bar, which is when the chance
 * legend has something to explain. */
function hasChanceBar(groups: readonly (AgreementGroup | null | undefined)[]) {
  return groups.some((g) => g?.current != null);
}

const MEASURE_SIZES = {
  // A table cell: agreement and kappa on one line over the bar.
  table: { percent: "text-sm", kappaOnTop: true, chanceBelow: false, barPad: "" },
  // A hover box or summary table: a larger number, room above the bar, and
  // the chance under it.
  detailed: { percent: "text-base", kappaOnTop: true, chanceBelow: true, barPad: "pt-1" },
  // A column of a card: a large number, the bar, then chance and kappa.
  card: { percent: "text-2xl", kappaOnTop: false, chanceBelow: false, barPad: "pt-1" },
};

/** One measure's agreement, kappa and chance bar, at the size its spot
 * needs, or a muted dash when there is no agreement. */
export function MeasureCell({
  group,
  size = "table",
}: {
  group: AgreementGroup;
  size?: keyof typeof MEASURE_SIZES;
}) {
  if (group.current == null) return size === "card" ? <BigPercent value={null} /> : DASH;
  const s = MEASURE_SIZES[size];
  const chance = group.chance_agreement;
  const kappa = (
    <span className="inline-flex flex-wrap items-center gap-1 min-w-0 text-xs text-muted-foreground tabular-nums">
      Kappa
      <KappaCell fields={group} />
    </span>
  );
  return (
    <div className="min-w-0 w-full">
      {/* Wraps in a narrow column rather than spilling into the next one. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <span className={`${s.percent} font-semibold tabular-nums text-foreground`}>
          {formatAgreement(group.current)}
        </span>
        {s.kappaOnTop && kappa}
      </div>
      {/* pt-1 on top of the bar's own 8px gives 12px above it. */}
      <div className={s.barPad}>
        <ChanceBar agreement={group.current} chanceAgreement={chance} />
      </div>
      {!s.kappaOnTop && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-1 text-xs text-muted-foreground tabular-nums">
          <span>{chance != null ? chanceText(chance) : ""}</span>
          {kappa}
        </div>
      )}
      {s.chanceBelow && chance != null && (
        <div className="mt-1.5 text-[11px] text-muted-foreground tabular-nums">
          {chanceText(chance)}
        </div>
      )}
    </div>
  );
}

/**
 * An annotator's agreement with the others in one card of three equal
 * columns: overall, then binary and rating labels each with its own bar,
 * under the chance legend. The columns stack on a narrow screen.
 */
export function AgreementByKindCard({
  overall,
  kinds,
}: {
  overall: number | null | undefined;
  kinds: readonly KappaByKind[] | null | undefined;
}) {
  const groups = ANSWER_KINDS.map((kind) => {
    const entry = kappaForKind(kinds, kind);
    return {
      ...entry,
      current: entry?.agreement ?? null,
      pair_count: entry?.pair_count ?? 0,
    };
  });
  const column = (title: string, content: ReactNode) => (
    <div key={title} className="p-6 min-w-0">
      <div className="text-sm font-medium text-foreground mb-3">{title}</div>
      {content}
    </div>
  );
  return (
    <>
      {hasChanceBar(groups) && <ChanceLegend />}
      <div className="border border-border rounded-xl bg-background grid grid-cols-1 md:grid-cols-3 divide-y md:divide-y-0 md:divide-x divide-border">
        {column("Overall", <BigPercent value={overall} />)}
        {ANSWER_KINDS.map((kind, i) =>
          column(
            kind === "binary" ? "Binary labels" : "Rating labels",
            <MeasureCell size="card" group={groups[i]} />,
          ),
        )}
      </div>
    </>
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
      <ChevronDownIcon
        className={`w-3.5 h-3.5 ${active ? "opacity-100" : "opacity-40"} ${
          dir === "asc" ? "rotate-180" : ""
        }`}
      />
    </button>
  );
}

/** An evaluator's name pill with a small muted tag after it. */
function NameCell({
  name,
  onOpen,
  tag,
}: {
  name: string;
  onOpen?: () => void;
  tag?: ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 min-w-0">
      <EvaluatorNamePill
        name={name}
        fitClassName="min-w-0 max-w-full"
        onOpen={onOpen}
      />
      {tag}
    </div>
  );
}

type Column<T> = {
  title: string;
  cell: (row: T) => ReactNode;
  sortKey?: OverviewSortKey;
};

type Sort = {
  key: OverviewSortKey;
  dir: SortDirection;
  /** A heading was clicked. */
  onToggle: (key: OverviewSortKey) => void;
  /** The phone sort picker chose a column and direction, or cleared it. */
  onPick: (next: { key: OverviewSortKey; dir: SortDirection } | null) => void;
};

/**
 * Evaluators down the side and one column per measure, as a table on wide
 * screens and as cards on narrow ones, under the chance legend when there
 * is a bar to explain.
 */
function MeasuresTable<T extends { key: string }>({
  rows,
  gridCols,
  nameTitle,
  nameSortKey,
  name,
  columns,
  sort,
  legend,
}: {
  rows: readonly T[];
  gridCols: string;
  nameTitle: string;
  nameSortKey?: OverviewSortKey;
  name: (row: T) => ReactNode;
  columns: Column<T>[];
  sort?: Sort;
  legend: boolean;
}) {
  const heading = (title: string, sortKey?: OverviewSortKey) =>
    sort && sortKey ? (
      <SortHeader
        label={title}
        active={sort.key === sortKey}
        dir={sort.dir}
        onClick={() => sort.onToggle(sortKey)}
      />
    ) : (
      <div className="text-sm font-medium text-muted-foreground">{title}</div>
    );
  const grid = `grid ${gridCols} gap-4 px-4`;
  return (
    <>
      {legend && <ChanceLegend />}
      {sort && (
        <SortByControl
          className="md:hidden"
          columns={[
            ...(nameSortKey ? [{ key: nameSortKey, label: nameTitle }] : []),
            ...columns.flatMap((c) =>
              c.sortKey ? [{ key: c.sortKey, label: c.title }] : [],
            ),
          ]}
          sort={sort}
          onChange={(next) =>
            sort.onPick(
              next ? { key: next.key as OverviewSortKey, dir: next.dir } : null,
            )
          }
        />
      )}
      {/* Desktop table */}
      <div className="hidden md:block border border-border rounded-xl overflow-hidden">
        <div className={`${grid} py-2 border-b border-border bg-muted/30 items-center`}>
          {heading(nameTitle, nameSortKey)}
          {columns.map((c) => (
            <div key={c.title} className={DIVIDER}>
              {heading(c.title, c.sortKey)}
            </div>
          ))}
        </div>
        {rows.map((row) => (
          <div
            key={row.key}
            className={`${grid} py-3 border-b border-border last:border-b-0 items-center`}
          >
            {name(row)}
            {columns.map((c) => (
              <div key={c.title} className={DIVIDER}>
                {c.cell(row)}
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
            {columns.map((c) => (
              <div key={c.title}>
                <p className="text-xs text-muted-foreground mb-1">{c.title}</p>
                {c.cell(row)}
              </div>
            ))}
          </div>
        ))}
      </div>
    </>
  );
}

/** Each evaluator's inter-annotator agreement and its agreement with humans,
 * as a table on wide screens and as cards on narrow ones. */
export function AgreementOverviewTable({
  rows,
  sort,
  onOpenEvaluator,
}: {
  rows: readonly OverviewRow[];
  sort: Sort;
  onOpenEvaluator: (evaluator: { uuid: string; name: string }) => void;
}) {
  return (
    <MeasuresTable
      rows={rows}
      gridCols="grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)_minmax(0,1fr)]"
      nameTitle="Evaluator"
      nameSortKey="name"
      name={(row) => (
        <NameCell
          name={row.name}
          onOpen={() => onOpenEvaluator({ uuid: row.key, name: row.name })}
        />
      )}
      columns={[
        {
          title: "Inter-annotator agreement",
          sortKey: "interAnnotator",
          cell: (row) => <MeasureCell group={row.interAnnotator} />,
        },
        {
          title: "Evaluator agreement with humans",
          sortKey: "withHumans",
          cell: (row) => <MeasureCell group={row.withHumans} />,
        },
      ]}
      sort={sort}
      legend={hasChanceBar(rows.flatMap((r) => [r.interAnnotator, r.withHumans]))}
    />
  );
}

const DEFAULT_SORT = { key: "withHumans" as OverviewSortKey, dir: "desc" as SortDirection };

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
  agreement: TaskAgreementResponse;
  onOpenEvaluator: (evaluator: { uuid: string; name: string }) => void;
  allTasks?: boolean;
  /** Groups evaluators of the same type together in the table. */
  evaluatorTypeOf?: (evaluatorId: string) => string | undefined;
}) {
  const [sort, setSort] = useState(DEFAULT_SORT);
  const onToggle = (key: OverviewSortKey) =>
    setSort((prev) =>
      prev.key === key
        ? { key, dir: prev.dir === "desc" ? "asc" : "desc" }
        : { key, dir: key === "name" ? "asc" : "desc" },
    );
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
        {(
          [
            ["Inter-annotator agreement", agreement.human_human],
            ["Evaluator agreement with humans", agreement.evaluators_with_humans],
          ] as const
        ).map(([title, group]) => (
          <AgreementStatCard
            key={title}
            staticPillText={title}
            agreement={group?.current}
          />
        ))}
      </div>
      <AgreementOverviewTable
        rows={sortOverviewRows(rows, sort.key, sort.dir)}
        sort={{
          ...sort,
          onToggle,
          onPick: (next) => setSort(next ?? DEFAULT_SORT),
        }}
        onOpenEvaluator={onOpenEvaluator}
      />
    </>
  );
}

/** One evaluator's row in an evaluation run's summary. */
export type RunSummaryRow = {
  key: string;
  evaluatorId: string;
  name: string;
  versionLabel: string | null;
  score: EvaluatorResultStat | null;
  agreement: AgreementGroup | null;
};

/**
 * An evaluation run's summary, in the Overview table's style: each
 * evaluator's score for the run, and its agreement with humans with the
 * kappa, the bar against chance and the chance, under the chance legend.
 */
export function EvaluatorRunSummaryTable({
  rows,
  onOpenEvaluator,
}: {
  rows: readonly RunSummaryRow[];
  /** Opens how an evaluator judges; left out on a shared page. */
  onOpenEvaluator?: (evaluator: { uuid: string; name: string }) => void;
}) {
  return (
    <MeasuresTable
      rows={rows}
      gridCols="grid-cols-[minmax(0,1.2fr)_minmax(0,0.7fr)_minmax(0,1.3fr)]"
      nameTitle="Evaluator"
      name={(row) => (
        <NameCell
          name={row.name}
          onOpen={
            onOpenEvaluator
              ? () => onOpenEvaluator({ uuid: row.evaluatorId, name: row.name })
              : undefined
          }
          tag={
            row.versionLabel && (
              <span className="font-mono text-[11px] text-muted-foreground shrink-0">
                {row.versionLabel}
              </span>
            )
          }
        />
      )}
      columns={[
        {
          title: "Score",
          // A binary score names what it counts, e.g. "33% Correct".
          cell: (row) =>
            row.score ? (
              <span className="text-sm font-semibold tabular-nums text-foreground">
                {row.score.value}
                {row.score.passLabel && ` ${row.score.passLabel}`}
              </span>
            ) : (
              DASH
            ),
        },
        {
          title: "Agreement with humans",
          cell: (row) =>
            row.agreement?.current != null ? (
              <MeasureCell group={row.agreement} size="detailed" />
            ) : (
              <span className="inline-flex items-center gap-2">
                {DASH}
                <span className="text-xs text-muted-foreground">
                  No human labels yet
                </span>
              </span>
            ),
        },
      ]}
      legend={hasChanceBar(rows.map((r) => r.agreement))}
    />
  );
}
