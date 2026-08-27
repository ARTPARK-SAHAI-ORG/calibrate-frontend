"use client";

import { useState } from "react";
import { Tooltip } from "@/components/Tooltip";
import { EvaluatorPreviewModal } from "@/components/evaluators/EvaluatorPreviewModal";

export type EvaluatorPillItem = {
  /**
   * The evaluator this pill stands for, when the list it came from carries
   * one. Without it the pill is plain text: there is nothing to preview.
   */
  uuid?: string | null;
  name: string;
};

const EVALUATOR_PILL_CLASSES =
  "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-muted/40 text-foreground max-w-full";

/**
 * Fixed-width evaluators cell: shows up to 2 pills (each opens how that
 * evaluator judges in a preview), and folds the rest into a "+N" chip whose
 * tooltip lists the remaining evaluators as the same pills on hover. One
 * instance renders per table row, so the preview modal is owned here rather
 * than lifted to the row's parent — only one can be open per row anyway, and
 * it mounts/unmounts with the row.
 */
export function EvaluatorPillList({
  evaluators,
}: {
  evaluators: EvaluatorPillItem[];
}) {
  const [previewEvaluator, setPreviewEvaluator] = useState<{
    uuid: string;
    name: string;
  } | null>(null);

  if (evaluators.length === 0) {
    return <span className="text-sm text-muted-foreground">—</span>;
  }
  const visible =
    evaluators.length <= 2 ? evaluators : evaluators.slice(0, 1);
  const rest = evaluators.length <= 2 ? [] : evaluators.slice(1);
  return (
    <div className="flex items-center gap-1 min-w-0">
      {visible.map((ev, index) =>
        ev.uuid ? (
          <button
            key={ev.uuid}
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setPreviewEvaluator({ uuid: ev.uuid as string, name: ev.name });
            }}
            title={`Open ${ev.name}`}
            className={`${EVALUATOR_PILL_CLASSES} min-w-0 shrink truncate hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer`}
          >
            <span className="truncate">{ev.name}</span>
          </button>
        ) : (
          // A plain pill can be clipped by a narrow column, so the whole name
          // is on hover. There is nothing to open, so no click handler.
          // Keyed by position: a list with no ids can hold the same name
          // twice, and two pills with the same key confuse React.
          <Tooltip
            key={`${index}-${ev.name}`}
            content={ev.name}
            className="min-w-0 shrink"
          >
            <span className={`${EVALUATOR_PILL_CLASSES} w-full truncate`}>
              <span className="truncate">{ev.name}</span>
            </span>
          </Tooltip>
        ),
      )}
      {rest.length > 0 && (
        <Tooltip
          content={
            <div className="flex flex-wrap gap-1 max-w-64">
              {rest.map((ev, index) => (
                <span
                  key={ev.uuid ?? `${index}-${ev.name}`}
                  className={EVALUATOR_PILL_CLASSES}
                >
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
      <EvaluatorPreviewModal
        evaluatorUuid={previewEvaluator?.uuid ?? null}
        evaluatorName={previewEvaluator?.name}
        onClose={() => setPreviewEvaluator(null)}
      />
    </div>
  );
}

/**
 * The same fixed-width pills for plain names that are not evaluators, so a
 * table row stays one line high whatever it holds. Used for the models a run
 * tried.
 */
export function NamePillList({ names }: { names: string[] }) {
  return <EvaluatorPillList evaluators={names.map((name) => ({ name }))} />;
}
