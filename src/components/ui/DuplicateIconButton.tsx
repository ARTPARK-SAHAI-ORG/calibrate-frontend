"use client";

import React from "react";
import { Tooltip } from "@/components/Tooltip";
import { SpinnerIcon } from "@/components/icons";

type DuplicateIconButtonProps = {
  /** Invoked when the button is clicked. Click propagation is stopped first,
   *  so this is safe to use inside clickable rows. */
  onClick: () => void;
  /** Tooltip text shown on hover. Also used as the accessible label. */
  tooltip?: string;
  /** Shows a spinner and disables the button while the source data loads. */
  loading?: boolean;
  /** Extra classes appended to the base styling. */
  className?: string;
};

/**
 * Shared icon button for duplicate actions. Renders a copy icon with a
 * hover tooltip (via the Tooltip component). Used across resource rows
 * (tests, labelling items, etc.) so the duplicate affordance stays
 * consistent. While `loading` is true it shows a spinner and is disabled —
 * callers use this to fetch the source item before opening the dialog.
 */
export function DuplicateIconButton({
  onClick,
  tooltip = "Duplicate",
  loading = false,
  className = "",
}: DuplicateIconButtonProps) {
  return (
    <Tooltip content={tooltip}>
      <button
        type="button"
        disabled={loading}
        onClick={(e) => {
          e.stopPropagation();
          if (loading) return;
          onClick();
        }}
        aria-label={tooltip}
        aria-busy={loading}
        className={`w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          loading ? "cursor-not-allowed" : "cursor-pointer"
        } ${className}`}
      >
        {loading ? (
          <SpinnerIcon className="w-4 h-4 animate-spin" />
        ) : (
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75"
            />
          </svg>
        )}
      </button>
    </Tooltip>
  );
}
