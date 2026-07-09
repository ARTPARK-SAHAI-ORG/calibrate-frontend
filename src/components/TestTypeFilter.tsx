"use client";

import { testTypeLabel, type TestType } from "@/lib/testTypes";

/** The filter value: a concrete test type, or "all" for no filtering. */
export type TestTypeFilterValue = "all" | TestType;

/**
 * Options for the test-type filter, in display order. Labels come from
 * {@link testTypeLabel} so a rename only happens in one place.
 */
const TEST_TYPE_FILTER_OPTIONS: {
  value: TestTypeFilterValue;
  label: string;
}[] = [
  { value: "all", label: "All" },
  { value: "response", label: testTypeLabel("response") },
  { value: "tool_call", label: testTypeLabel("tool_call") },
  { value: "conversation", label: testTypeLabel("conversation") },
];

interface TestTypeFilterProps {
  value: TestTypeFilterValue;
  onChange: (value: TestTypeFilterValue) => void;
  /**
   * "md" (default) — standalone filter row, fixed-width chips.
   * "sm" — compact, equal-width chips that fill their container (used inside
   * the narrow "Add test" dropdown).
   */
  size?: "sm" | "md";
  /** Extra classes for the pill track (positioning, e.g. `mt-2`, `w-fit`). */
  className?: string;
}

/**
 * iOS-style segmented control to filter a tests list by type. Presentational
 * only — the caller owns the filter state and any side-effects (e.g. pruning
 * bulk selections that no longer match) in its `onChange` handler.
 */
export function TestTypeFilter({
  value,
  onChange,
  size = "md",
  className = "",
}: TestTypeFilterProps) {
  const buttonClasses =
    size === "sm"
      ? "flex-1 h-6 px-1.5 text-[11px] whitespace-nowrap"
      : "h-7 px-3 text-xs";

  return (
    <div
      className={`flex items-center gap-0.5 rounded-full bg-muted/60 p-0.5 ${className}`}
    >
      {TEST_TYPE_FILTER_OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          onClick={() => onChange(opt.value)}
          className={`${buttonClasses} rounded-full font-medium cursor-pointer transition-colors ${
            value === opt.value
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
