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
  /** What a screen reader says, when the tooltip alone does not say which row
   *  this button belongs to. Defaults to the tooltip. */
  ariaLabel?: string;
  /** Shows a spinner and disables the button while the source data loads. */
  loading?: boolean;
  /** Disables the button with no spinner, e.g. while another row is loading. */
  disabled?: boolean;
  /** Extra classes appended to the base styling. */
  className?: string;
  /** The pointer moves through the tooltip. Use it when rows of these sit one
   *  above the other, so the tooltip never blocks the button above. */
  tooltipPassThrough?: boolean;
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
  ariaLabel = tooltip,
  loading = false,
  disabled = false,
  className = "",
  tooltipPassThrough = false,
}: DuplicateIconButtonProps) {
  return (
    <Tooltip content={tooltip} passThrough={tooltipPassThrough}>
      <button
        type="button"
        disabled={loading || disabled}
        onClick={(e) => {
          e.stopPropagation();
          if (loading || disabled) return;
          onClick();
        }}
        aria-label={ariaLabel}
        aria-busy={loading}
        className={`w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
          loading || disabled ? "cursor-not-allowed" : "cursor-pointer"
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
