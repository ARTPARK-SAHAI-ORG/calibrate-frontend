"use client";

import React from "react";

type PickerRowProps = {
  /** What the checkbox's own aria-label announces, e.g. "Select Weather lookup". */
  ariaLabel: string;
  checked: boolean;
  onToggle: () => void;
  /** True while this row's item is the one shown in the preview column. */
  isPreviewed: boolean;
  /** Opens this row's item in the preview column. */
  onPreview: () => void;
  name: string;
  /** A small pill next to the name, e.g. the item's type. */
  badge?: React.ReactNode;
  description?: string;
};

/**
 * One row in a checkbox-list-with-preview picker (evaluators, tools — any
 * future one). The single place that row's look lives, so the two pickers
 * can never drift the way they did when each hand-copied its own version.
 */
export function PickerRow({
  ariaLabel,
  checked,
  onToggle,
  isPreviewed,
  onPreview,
  name,
  badge,
  description,
}: PickerRowProps) {
  return (
    <div
      className={`flex items-start gap-3 px-3 py-2.5 transition-colors ${
        isPreviewed
          ? "bg-muted/60 border-l-2 border-foreground/40 pl-[calc(0.75rem-2px)]"
          : "hover:bg-muted/30"
      }`}
    >
      {/* The box is centred against the name's own line, so it sits the
          same way whether or not a description follows underneath. */}
      <span className="flex h-5 items-center flex-shrink-0">
        <input
          type="checkbox"
          aria-label={ariaLabel}
          checked={checked}
          onChange={onToggle}
          className="w-4 h-4 cursor-pointer accent-foreground"
        />
      </span>
      {/* The body opens the preview on the right rather than ticking the
          box, so an item can be read before it is added. */}
      <button
        type="button"
        onClick={onPreview}
        className="min-w-0 flex-1 text-left cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-border rounded-sm"
      >
        <span className="text-sm font-medium text-foreground">{name}</span>
        {badge && <> {badge}</>}
        {description && (
          <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
            {description}
          </div>
        )}
      </button>
    </div>
  );
}
