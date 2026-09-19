"use client";

import React from "react";

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
  inline = false,
}: {
  /** Singular noun for the aria-labels/tooltips, e.g. "trace" or "item". */
  noun: string;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  position?: { index: number; total: number };
  /** Draw the arrows where they are put, instead of centring them over the
   * header. For a caller that places them itself. */
  inline?: boolean;
}) {
  if (!showsDialogNav({ onPrev, onNext, position })) return null;

  return (
    <div
      className={
        inline
          ? "hidden md:flex items-center gap-2"
          : "hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-2 pointer-events-none"
      }
    >
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

/**
 * Whether the arrows are drawn at all: nothing to step through, or only the
 * open item itself, and there is nothing to show. One rule, so a caller
 * laying out around the arrows cannot disagree with the arrows themselves.
 */
export function showsDialogNav({
  onPrev,
  onNext,
  position,
}: {
  onPrev?: () => void;
  onNext?: () => void;
  position?: { index: number; total: number };
}): boolean {
  if (!(onPrev || onNext)) return false;
  return !(position && position.total <= 1);
}

/**
 * The same arrows in a thin row of their own across the top of a dialog, for
 * a window whose header row is already full (the test window, the run
 * windows). Nothing is drawn when there is nothing to step through, so the
 * window never carries an empty bar.
 */
export function DialogNavRow(props: React.ComponentProps<typeof DialogNavHeader>) {
  if (!showsDialogNav(props)) return null;
  return (
    <div
      className="relative shrink-0 h-12 border-b border-border hidden md:block"
      data-testid="dialog-nav-row"
    >
      <div className="absolute inset-0 flex items-center justify-center">
        <DialogNavHeader {...props} />
      </div>
    </div>
  );
}
