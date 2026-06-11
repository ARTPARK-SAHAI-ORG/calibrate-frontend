"use client";

import { useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import type { EvaluatorType } from "@/components/EvaluatorPills";
import {
  EvaluatorUseCaseCards,
  type EvaluatorUseCaseOption,
} from "@/components/evaluators/evaluatorUseCases";

export type EvaluatorTypeOption = EvaluatorUseCaseOption;

type UseCasePickerDialogProps = {
  initialValue: EvaluatorType | null;
  options: EvaluatorTypeOption[];
  onCancel: () => void;
  onSelect: (value: EvaluatorType) => void;
};

export function UseCasePickerDialog({
  initialValue,
  options,
  onCancel,
  onSelect,
}: UseCasePickerDialogProps) {
  useHideFloatingButton(true);
  const [selected, setSelected] = useState<EvaluatorType | null>(initialValue);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onCancel}
    >
      <div
        className="bg-background border border-border rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 md:px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-foreground">
              What is this evaluator for?
            </h2>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              Pick the use case so we can set a good default LLM judge model and
              prompt for you
            </p>
          </div>
          <button
            onClick={onCancel}
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer flex-shrink-0"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <EvaluatorUseCaseCards
            options={options}
            selected={selected}
            onSelect={setSelected}
          />
        </div>

        <div className="flex items-center justify-end gap-2 md:gap-3 px-5 md:px-6 py-4 border-t border-border">
          <button
            onClick={onCancel}
            className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium border border-border bg-background dark:bg-muted hover:bg-muted/50 dark:hover:bg-accent transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              if (selected) onSelect(selected);
            }}
            disabled={!selected}
            className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Continue
          </button>
        </div>
      </div>
    </div>
  );
}
