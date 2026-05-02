"use client";

import { useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import type { EvaluatorType } from "@/components/EvaluatorPills";

export type EvaluatorTypeOption = {
  value: EvaluatorType;
  title: string;
  description: string;
};

const TYPE_INACTIVE_CLASSES: Record<EvaluatorType, string> = {
  tts: "border-purple-500/20 bg-purple-500/[0.04] hover:bg-purple-500/10 hover:border-purple-500/40",
  stt: "border-blue-500/20 bg-blue-500/[0.04] hover:bg-blue-500/10 hover:border-blue-500/40",
  llm: "border-orange-500/20 bg-orange-500/[0.04] hover:bg-orange-500/10 hover:border-orange-500/40",
  simulation:
    "border-pink-500/20 bg-pink-500/[0.04] hover:bg-pink-500/10 hover:border-pink-500/40",
};

const TYPE_ACTIVE_CLASSES: Record<EvaluatorType, string> = {
  tts: "border-purple-500/60 bg-purple-500/15 ring-1 ring-purple-500/40",
  stt: "border-blue-500/60 bg-blue-500/15 ring-1 ring-blue-500/40",
  llm: "border-orange-500/60 bg-orange-500/15 ring-1 ring-orange-500/40",
  simulation: "border-pink-500/60 bg-pink-500/15 ring-1 ring-pink-500/40",
};

const TYPE_TITLE_CLASSES: Record<EvaluatorType, string> = {
  tts: "text-purple-700 dark:text-purple-300",
  stt: "text-blue-700 dark:text-blue-300",
  llm: "text-orange-700 dark:text-orange-300",
  simulation: "text-pink-700 dark:text-pink-300",
};

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
              Pick the use case so we can configure the right judge model and
              inputs.
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {options.map((opt) => {
              const active = selected === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setSelected(opt.value)}
                  className={`flex flex-col items-start text-left p-4 rounded-md border transition-colors cursor-pointer ${
                    active
                      ? TYPE_ACTIVE_CLASSES[opt.value]
                      : TYPE_INACTIVE_CLASSES[opt.value]
                  }`}
                >
                  <div
                    className={`text-sm md:text-base font-medium ${TYPE_TITLE_CLASSES[opt.value]}`}
                  >
                    {opt.title}
                  </div>
                  <div className="text-xs md:text-sm text-muted-foreground mt-1 leading-relaxed">
                    {opt.description}
                  </div>
                </button>
              );
            })}
          </div>
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
