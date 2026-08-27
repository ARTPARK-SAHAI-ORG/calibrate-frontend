"use client";

import { Link } from "@/lib/nav";
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
      // This sits inside the table row that opened it, so a click on the dark
      // area would otherwise also open the row behind it.
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
    >
      <div
        className="bg-background rounded-xl w-full max-w-2xl h-[80vh] shadow-2xl overflow-hidden flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-4 py-3 border-b border-border shrink-0">
          <h2 className="text-sm font-semibold text-foreground truncate">
            {evaluatorName ?? "Evaluator"}
          </h2>
          <div className="flex items-center gap-2 shrink-0">
            {/* A new tab, so the test being written stays open behind it. */}
            <Link
              href={`/evaluators/${evaluatorUuid}`}
              target="_blank"
              rel="noopener noreferrer"
              className="h-8 px-3 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer inline-flex items-center"
            >
              View more
            </Link>
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
        </div>
        <div className="flex-1 min-h-0">
          <EvaluatorPromptPreview evaluatorUuid={evaluatorUuid} />
        </div>
      </div>
    </div>
  );
}
