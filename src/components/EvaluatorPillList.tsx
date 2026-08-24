"use client";

import { Link } from "@/lib/nav";
import { Tooltip } from "@/components/Tooltip";

export type EvaluatorPillItem = {
  uuid: string;
  name: string;
};

const EVALUATOR_PILL_CLASSES =
  "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-muted/40 text-foreground max-w-full";

/**
 * Fixed-width evaluators cell: shows up to 2 pills (each a link to the
 * evaluator), and folds the rest into a "+N" chip whose tooltip lists the
 * remaining evaluators as the same pills on hover.
 */
export function EvaluatorPillList({
  evaluators,
}: {
  evaluators: EvaluatorPillItem[];
}) {
  if (evaluators.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  const visible =
    evaluators.length <= 2 ? evaluators : evaluators.slice(0, 1);
  const rest = evaluators.length <= 2 ? [] : evaluators.slice(1);
  return (
    <div className="flex items-center gap-1 min-w-0">
      {visible.map((ev) => (
        <Link
          key={ev.uuid}
          href={`/evaluators/${ev.uuid}`}
          onClick={(e) => e.stopPropagation()}
          title={`Open ${ev.name}`}
          className={`${EVALUATOR_PILL_CLASSES} min-w-0 shrink truncate hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer`}
        >
          <span className="truncate">{ev.name}</span>
        </Link>
      ))}
      {rest.length > 0 && (
        <Tooltip
          content={
            <div className="flex flex-wrap gap-1 max-w-64">
              {rest.map((ev) => (
                <span key={ev.uuid} className={EVALUATOR_PILL_CLASSES}>
                  {ev.name}
                </span>
              ))}
            </div>
          }
        >
          <span
            onClick={(e) => e.stopPropagation()}
            className={`${EVALUATOR_PILL_CLASSES} shrink-0 text-muted-foreground cursor-default`}
          >
            +{rest.length}
          </span>
        </Tooltip>
      )}
    </div>
  );
}
