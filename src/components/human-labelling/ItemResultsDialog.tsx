"use client";

import { useEffect, useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";

export type ItemResultsEvaluator = {
  uuid: string;
  name: string;
};

type ItemResultsDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  itemName: string;
  evaluators: ItemResultsEvaluator[];
};

export function ItemResultsDialog({
  isOpen,
  onClose,
  itemName,
  evaluators,
}: ItemResultsDialogProps) {
  useHideFloatingButton(isOpen);

  const [activeUuid, setActiveUuid] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setActiveUuid(evaluators[0]?.uuid ?? null);
  }, [isOpen, evaluators]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4">
      <div className="bg-background rounded-none md:rounded-xl w-full max-w-[92rem] h-full md:h-[92vh] flex flex-col shadow-2xl border border-border">
        {/* Header */}
        <div className="flex items-center justify-between px-4 md:px-6 py-3 md:py-4 border-b border-border">
          <div className="min-w-0">
            <h2 className="text-base md:text-lg font-semibold truncate">
              Results
            </h2>
            <p className="text-xs text-muted-foreground truncate">{itemName}</p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors cursor-pointer"
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

        {/* Tabs */}
        {evaluators.length > 0 ? (
          <>
            <div className="px-4 md:px-6 border-b border-border overflow-x-auto">
              <div className="flex items-center gap-1 min-w-max">
                {evaluators.map((ev) => (
                  <button
                    key={ev.uuid}
                    onClick={() => setActiveUuid(ev.uuid)}
                    className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 transition-colors cursor-pointer whitespace-nowrap ${
                      activeUuid === ev.uuid
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {ev.name}
                  </button>
                ))}
              </div>
            </div>

            {/* Active tab body — placeholder for now */}
            <div className="flex-1 overflow-y-auto p-6 md:p-8">
              <div className="max-w-2xl mx-auto text-center space-y-3 py-12">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-muted/50">
                  <svg
                    className="w-6 h-6 text-muted-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                    />
                  </svg>
                </div>
                <h3 className="text-base font-semibold">
                  Results for{" "}
                  {evaluators.find((e) => e.uuid === activeUuid)?.name ??
                    "this evaluator"}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Per-evaluator analytics for this item will appear here —
                  agreement with annotators, evaluator runs over time, and
                  pass/fail breakdowns.
                </p>
              </div>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            No evaluators are linked to this task.
          </div>
        )}
      </div>
    </div>
  );
}
