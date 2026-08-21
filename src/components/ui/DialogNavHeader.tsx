"use client";

import { Tooltip } from "@/components/Tooltip";

/**
 * Previous/next arrows plus an "N of M" position, centered over a full-screen
 * detail dialog's header (the trace dialog, the labelling item dialog).
 * Hidden entirely when there's only one item to page through. Pair with
 * `useDialogNavKeys` for the matching arrow-key/Escape behavior.
 */
export function DialogNavHeader({
  noun,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  position,
}: {
  /** Singular noun for the aria-labels/tooltips, e.g. "trace" or "item". */
  noun: string;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  position?: { index: number; total: number };
}) {
  if (!(onPrev || onNext) || (position && position.total <= 1)) return null;

  return (
    <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-2 pointer-events-none">
      <div className="pointer-events-auto">
        <Tooltip position="bottom" content={`Previous ${noun}`}>
          <button
            type="button"
            onClick={onPrev}
            disabled={!hasPrev}
            aria-label={`Previous ${noun}`}
            className="flex items-center justify-center w-8 h-8 rounded-md border border-border hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
            </svg>
          </button>
        </Tooltip>
      </div>
      {position && position.total > 0 ? (
        <span className="text-xs text-muted-foreground tabular-nums min-w-[4rem] text-center">
          {position.index + 1} of {position.total}
        </span>
      ) : (
        <span className="min-w-[4rem]" />
      )}
      <div className="pointer-events-auto">
        <Tooltip position="bottom" content={`Next ${noun}`}>
          <button
            type="button"
            onClick={onNext}
            disabled={!hasNext}
            aria-label={`Next ${noun}`}
            className="flex items-center justify-center w-8 h-8 rounded-md border border-border hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
            </svg>
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
