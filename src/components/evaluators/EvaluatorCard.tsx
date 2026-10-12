"use client";

import { useState, type HTMLAttributes, type ReactNode } from "react";
import { PreBuiltPill } from "@/components/EvaluatorPills";
import { EvaluatorPreviewModal } from "@/components/evaluators/EvaluatorPreviewModal";
import { isDefaultEvaluator, type EvaluatorData } from "@/lib/evaluatorApi";

type Props = {
  evaluator: EvaluatorData;
  /** Drawn after View: Remove on an agent, Delete in the library. */
  actions?: ReactNode;
} & HTMLAttributes<HTMLDivElement>;

/**
 * One evaluator as a card: name, pre-built pill, description, View and the
 * caller's own actions. Clicking anywhere on the card, or View, opens how
 * the evaluator judges in `EvaluatorPreviewModal`, which carries the links to
 * the evaluator's own page. Shared by the evaluator library pages and the
 * agent Evaluators tab, so the two read and behave the same.
 */
export function EvaluatorCard({ evaluator, actions, ...rest }: Props) {
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
      <div className="relative z-10 pointer-events-none flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="text-base font-semibold text-foreground">
              {evaluator.name}
            </h3>
            {/* Only "where did this come from". What it judges and how it
                scores are in the evaluator itself. */}
            {isDefaultEvaluator(evaluator) && <PreBuiltPill />}
          </div>
          {evaluator.description && (
            <p className="text-sm text-muted-foreground mt-0.5">
              {evaluator.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1 flex-shrink-0 pointer-events-auto">
          <button
            type="button"
            onClick={() => setPreviewOpen(true)}
            className="h-8 md:h-9 px-3 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer inline-flex items-center"
          >
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
