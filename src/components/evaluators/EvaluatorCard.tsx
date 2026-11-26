"use client";

import { useState, type HTMLAttributes, type ReactNode } from "react";
import { EvaluatorTypePill, PreBuiltPill } from "@/components/EvaluatorPills";
import { EvaluatorPreviewModal } from "@/components/evaluators/EvaluatorPreviewModal";
import { isDefaultEvaluator, type EvaluatorData } from "@/lib/evaluatorApi";
import { EyeIcon, WarningTriangleIcon } from "@/components/icons";
import { EVALUATOR_CARD_BUTTON_CLASS } from "./DuplicateEvaluatorButton";

type Props = {
  evaluator: EvaluatorData;
  /** Drawn after View: Duplicate, then Remove on an agent or Delete in the library. */
  actions?: ReactNode;
  /** One line under the description, for something the reader needs to fix. */
  warning?: string;
} & HTMLAttributes<HTMLDivElement>;

/**
 * One evaluator as a card: name, type pill, pre-built pill, description, View and the
 * caller's own actions. Clicking anywhere on the card, or View, opens how
 * the evaluator judges in `EvaluatorPreviewModal`, which carries the links to
 * the evaluator's own page. Shared by the evaluator library pages and the
 * agent Evaluators tab, so the two read and behave the same.
 */
export function EvaluatorCard({ evaluator, actions, warning, ...rest }: Props) {
  const [previewOpen, setPreviewOpen] = useState(false);

  return (
    <div
      {...rest}
      className="relative border border-border rounded-xl bg-background dark:bg-muted px-4 py-3 md:px-5 md:py-3 transition-colors cursor-pointer hover:bg-muted/20 dark:hover:bg-accent"
    >
      {/* Covers the whole card so clicking anywhere opens the preview, and
          the buttons still sit above it. */}
      <button
        type="button"
        onClick={() => setPreviewOpen(true)}
        aria-label={`Open ${evaluator.name}`}
        className="absolute inset-0 rounded-xl z-0 cursor-pointer"
      />
      <div className="relative z-10 pointer-events-none flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-foreground">
              {evaluator.name}
            </h3>
            {evaluator.evaluator_type && (
              // Takes the mouse back so its tooltip shows, and still opens
              // the card on a click.
              <span
                className="pointer-events-auto"
                onClick={() => setPreviewOpen(true)}
              >
                <EvaluatorTypePill evaluatorType={evaluator.evaluator_type} />
              </span>
            )}
            {isDefaultEvaluator(evaluator) && <PreBuiltPill />}
          </div>
          {evaluator.description && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {evaluator.description}
            </p>
          )}
          {warning && (
            <p className="flex items-center gap-1.5 text-xs text-orange-700 dark:text-orange-300 mt-1">
              <WarningTriangleIcon className="w-3.5 h-3.5 flex-shrink-0 text-orange-600 dark:text-orange-400" />
              {warning}
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1 sm:flex-shrink-0 pointer-events-auto">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className={EVALUATOR_CARD_BUTTON_CLASS}
          >
            <EyeIcon className="w-4 h-4" />
            View
          </button>
          {actions}
        </div>
      </div>

      <EvaluatorPreviewModal
        evaluatorUuid={previewOpen ? evaluator.uuid : null}
        evaluatorName={evaluator.name}
        onClose={() => setPreviewOpen(false)}
      />
    </div>
  );
}
