"use client";

import React from "react";

/** How a search query is compared against a field. */
export type SearchMode = "contains" | "starts-with" | "ends-with" | "exact";

const SEARCH_MODE_OPTIONS: ReadonlyArray<[SearchMode, string]> = [
  ["contains", "Contains"],
  ["starts-with", "Starts with"],
  ["ends-with", "Ends with"],
  ["exact", "Exact"],
];

/**
 * Case-insensitive comparison of a field value against a query using the
 * given match mode. Shared by every test-search bar so the UI selector and
 * the filtering stay in lockstep.
 */
export function matchesSearchMode(
  value: string,
  query: string,
  mode: SearchMode
): boolean {
  const field = value.toLowerCase();
  const q = query.toLowerCase();
  switch (mode) {
    case "starts-with":
      return field.startsWith(q);
    case "ends-with":
      return field.endsWith(q);
    case "exact":
      return field === q;
    case "contains":
    default:
      return field.includes(q);
  }
}

type SearchModeInputProps = {
  value: string;
  onChange: (value: string) => void;
  mode: SearchMode;
  onModeChange: (mode: SearchMode) => void;
  placeholder?: string;
  className?: string;
};

/**
 * Search input with a match-mode selector docked inside its left edge. The
 * selector is an inverted inline control mirroring the tool-call argument
 * matcher in AddTestDialog.
 */
export function SearchModeInput({
  value,
  onChange,
  mode,
  onModeChange,
  placeholder = "Search",
  className = "",
}: SearchModeInputProps) {
  return (
    // One bordered pill: the match-mode selector docks on the left and the
    // text input fills the rest. Flex layout keeps the placeholder flush to
    // the selector regardless of which (variable-width) mode is selected.
    <div
      className={`flex items-center w-full h-9 md:h-10 rounded-md border border-border bg-background pl-1.5 focus-within:ring-2 focus-within:ring-accent focus-within:border-transparent ${className}`}
    >
      {/* Match mode — how the query is compared against each field. */}
      <div className="relative flex-shrink-0">
        <select
          value={mode}
          onChange={(e) => onModeChange(e.target.value as SearchMode)}
          aria-label="Search match mode"
          className="h-7 md:h-8 pl-2.5 pr-7 rounded-md text-xs font-medium bg-foreground text-background border border-transparent hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-accent cursor-pointer appearance-none transition-opacity"
        >
          {SEARCH_MODE_OPTIONS.map(([m, label]) => (
            <option key={m} value={m}>
              {label}
            </option>
          ))}
        </select>
        <div className="absolute inset-y-0 right-0 flex items-center pr-1.5 pointer-events-none">
          <svg
            className="w-3.5 h-3.5 text-background"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 8.25l-7.5 7.5-7.5-7.5"
            />
          </svg>
        </div>
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 min-w-0 h-full pl-2.5 pr-4 bg-transparent rounded-r-md text-sm md:text-base text-foreground placeholder:text-muted-foreground focus:outline-none"
      />
    </div>
  );
}
