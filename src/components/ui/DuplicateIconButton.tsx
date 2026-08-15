"use client";

import React from "react";
import { Tooltip } from "@/components/Tooltip";
import { SpinnerIcon, CopyIcon } from "@/components/icons";

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
          <CopyIcon className="w-4 h-4" />
        )}
      </button>
    </Tooltip>
  );
}
