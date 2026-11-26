"use client";

import { useState, type ReactNode } from "react";
import { EvaluatorTypePill, PreBuiltPill } from "@/components/EvaluatorPills";
import { EvaluatorPreviewModal } from "@/components/evaluators/EvaluatorPreviewModal";
import { EVALUATOR_CARD_BUTTON_CLASS } from "@/components/evaluators/DuplicateEvaluatorButton";
import { EyeIcon } from "@/components/icons";
import {
  SelectCheckbox,
  type SelectCheckboxProps,
} from "@/components/ui/SelectCheckbox";
import { isDefaultEvaluator, type EvaluatorData } from "@/lib/evaluatorApi";

// One grid for the header and every row, so the columns line up. The last
// column fits View, Duplicate and Remove, which leaves the name and the
// description too little room below `lg`, so until then a row is the tick box
// beside the name and description, with the buttons on a line of their own.
const ROW_GRID =
  "grid grid-cols-[20px_minmax(0,1fr)] lg:grid-cols-[20px_minmax(0,1fr)_minmax(0,1.4fr)_320px] gap-x-4 gap-y-2 items-center px-4";

type Props = {
  evaluators: EvaluatorData[];
  /** `checkboxProps` from `useBulkDeletion`. */
  checkboxProps: (evaluator: EvaluatorData) => SelectCheckboxProps;
  allSelected: boolean;
  onToggleAll: () => void;
  selectedCount: number;
  onRemoveSelected: () => void;
  /** Drawn after View on each row: Duplicate, then Remove. */
  renderActions: (evaluator: EvaluatorData) => ReactNode;
};

/**
 * The agent's evaluators as a table with a tick box on each row, so several
 * can be removed at once. Clicking a row opens how the evaluator judges, the
 * same window the View button opens.
 */
export function AgentEvaluatorsTable({
  evaluators,
  checkboxProps,
  allSelected,
  onToggleAll,
  selectedCount,
  onRemoveSelected,
  renderActions,
}: Props) {
  const [preview, setPreview] = useState<EvaluatorData | null>(null);

  const removeSelectedButton =
    selectedCount > 0 ? (
      <button
        type="button"
        onClick={onRemoveSelected}
        className="h-8 px-3 rounded-md text-sm font-medium border border-red-500 text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer flex-shrink-0 whitespace-nowrap"
      >
        Remove selected ({selectedCount})
      </button>
    ) : null;

  return (
    <>
      <div className="flex items-center justify-between gap-3 mb-3">
        <p className="text-sm text-muted-foreground">
          {evaluators.length}{" "}
          {evaluators.length === 1 ? "evaluator" : "evaluators"}
        </p>
        {/* Without the full header row, the button sits here instead. */}
        <div className="lg:hidden">{removeSelectedButton}</div>
      </div>

      <div className="border border-border rounded-xl overflow-hidden">
        <div className={`${ROW_GRID} py-2 bg-muted/30`}>
          <SelectCheckbox
            checked={allSelected}
            onToggle={onToggleAll}
            label="Select all evaluators"
          />
          <div className="text-sm font-medium text-muted-foreground">Name</div>
          <div className="hidden lg:block text-sm font-medium text-muted-foreground">
            Description
          </div>
          <div className="hidden lg:flex justify-end h-8">
            {removeSelectedButton}
          </div>
        </div>

        {evaluators.map((evaluator) => (
          <div
            key={evaluator.uuid}
            data-tour="evaluator-card"
            data-evaluator-name={evaluator.name}
            onClick={() => setPreview(evaluator)}
            className={`${ROW_GRID} py-3 border-t border-border hover:bg-muted/20 transition-colors cursor-pointer`}
          >
            <SelectCheckbox
              {...checkboxProps(evaluator)}
              label={`Select ${evaluator.name}`}
            />
            <button
              type="button"
              aria-label={`Open ${evaluator.name}`}
              className="flex items-center gap-2 flex-wrap text-left cursor-pointer"
            >
              <span className="text-sm font-medium text-foreground">
                {evaluator.name}
              </span>
              {evaluator.evaluator_type && (
                <EvaluatorTypePill evaluatorType={evaluator.evaluator_type} />
              )}
              {isDefaultEvaluator(evaluator) && <PreBuiltPill />}
            </button>
            {/* Holds its column on a wide screen even when empty. */}
            <p
              className={`col-start-2 lg:col-start-auto text-sm text-muted-foreground ${
                evaluator.description ? "" : "hidden lg:block"
              }`}
            >
              {evaluator.description}
            </p>
            {/* The row opens the evaluator on a click; these buttons, and
                any window they open, do their own thing. */}
            <div
              className="col-span-2 lg:col-span-1 flex items-center lg:justify-end gap-1"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                type="button"
                onClick={() => setPreview(evaluator)}
                className={EVALUATOR_CARD_BUTTON_CLASS}
              >
                <EyeIcon className="w-4 h-4" />
                View
              </button>
              {renderActions(evaluator)}
            </div>
          </div>
        ))}
      </div>

      <EvaluatorPreviewModal
        evaluatorUuid={preview?.uuid ?? null}
        evaluatorName={preview?.name ?? ""}
        onClose={() => setPreview(null)}
      />
    </>
  );
}
