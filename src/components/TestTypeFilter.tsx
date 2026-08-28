"use client";

import { SegmentedFilter } from "@/components/ui";
import {
  matchesTestTypeFilter,
  testTypeLabel,
  type TestTypeFilterValue,
} from "@/lib/testTypes";

export type { TestTypeFilterValue };
export { matchesTestTypeFilter };

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
 * Filters a tests list by type. Presentational only — the caller owns the
 * filter state and any side-effects (e.g. pruning bulk selections that no
 * longer match) in its `onChange` handler.
 */
export function TestTypeFilter({
  value,
  onChange,
  size = "md",
  className = "",
}: TestTypeFilterProps) {
  return (
    <SegmentedFilter
      value={value}
      onChange={onChange}
      options={TEST_TYPE_FILTER_OPTIONS}
      size={size}
      className={className}
      ariaLabel="Filter tests by type"
    />
  );
}
