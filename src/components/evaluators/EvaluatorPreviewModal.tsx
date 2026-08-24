"use client";

import { EvaluatorPromptPreview } from "./EvaluatorPromptPreview";

/**
 * How an evaluator judges, in a modal over whatever is open. For a
 * single-column form (an attached-evaluator card, a picker dropdown row) that
 * has no room for `EvaluatorPicker`'s side-by-side list-plus-preview layout.
 */
export function EvaluatorPreviewModal({
  evaluatorUuid,
  evaluatorName,
  onClose,
}: {
  evaluatorUuid: string | null;
  evaluatorName?: string;
  onClose: () => void;
}) {
  if (!evaluatorUuid) return null;

  return (
    <div
      className="fixed inset-0 z-[160] flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-background rounded-xl w-full max-w-2xl h-[80vh] shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-foreground truncate">
            {evaluatorName ?? "Evaluator"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer shrink-0"
            aria-label="Close preview"
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
        <div className="flex-1 min-h-0">
          <EvaluatorPromptPreview evaluatorUuid={evaluatorUuid} />
        </div>
      </div>
    </div>
  );
}
