"use client";

import React from "react";
import { Tooltip } from "@/components/Tooltip";

type SelectCheckboxProps = {
  /** Whether the box is currently ticked. */
  checked: boolean;
  /** Invoked when the box is toggled. Click propagation is stopped first,
   *  so this is safe to use inside clickable rows. */
  onToggle: () => void;
  /** Accessible label for screen readers. */
  label: string;
  /** Optional hover tooltip text, rendered via the shared Tooltip component
   *  (not the native `title`). Use it to explain a disabled box. */
  tooltip?: string;
  /** When true, the box can't be toggled (still swallows the row click). */
  disabled?: boolean;
  /** Extra classes appended to the base styling. */
  className?: string;
};

/**
 * Shared square checkbox used for row selection (select-all headers and
 * per-row checkboxes) across list pages with bulk actions. Renders a filled
 * box with a checkmark when checked, mirroring the tests-page selection UI.
 */
export function SelectCheckbox({
  checked,
  onToggle,
  label,
  tooltip,
  disabled = false,
  className = "",
}: SelectCheckboxProps) {
  const button = (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        if (disabled) return;
        onToggle();
      }}
      aria-label={label}
      aria-pressed={checked}
      aria-disabled={disabled}
      className={`w-5 h-5 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
        disabled
          ? "cursor-not-allowed opacity-40 border-border"
          : checked
            ? "bg-foreground border-foreground cursor-pointer"
            : "border-border hover:border-muted-foreground cursor-pointer"
      } ${className}`}
    >
      {checked && !disabled && (
        <svg
          className="w-3 h-3 text-background"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={3}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M4.5 12.75l6 6 9-13.5"
          />
        </svg>
      )}
    </button>
  );

  return tooltip ? <Tooltip content={tooltip}>{button}</Tooltip> : button;
}
