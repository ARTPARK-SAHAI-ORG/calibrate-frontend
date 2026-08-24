"use client";

import { useState } from "react";
import { Tooltip } from "@/components/Tooltip";
import { EvaluatorPreviewModal } from "@/components/evaluators/EvaluatorPreviewModal";

export type EvaluatorPillItem = {
  uuid: string;
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
      {visible.map((ev) => (
        <button
          key={ev.uuid}
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            setPreviewEvaluator({ uuid: ev.uuid, name: ev.name });
          }}
          title={`Open ${ev.name}`}
          className={`${EVALUATOR_PILL_CLASSES} min-w-0 shrink truncate hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer`}
        >
          <span className="truncate">{ev.name}</span>
        </button>
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
      <EvaluatorPreviewModal
        evaluatorUuid={previewEvaluator?.uuid ?? null}
        evaluatorName={previewEvaluator?.name}
        onClose={() => setPreviewEvaluator(null)}
      />
    </div>
  );
}
