"use client";

import { SegmentedFilter } from "@/components/ui";
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

/**
 * Does a test's type belong under the chosen filter chip?
 *
 * The "response" chip also matches "general" tests. To the reader they are one
 * thing, "LLM response": a general agent's test and a conversation agent's test
 * are both a reply being judged, and both show that same name. The split lives
 * only in how the test stores its content, so a single chip has to select both
 * or a general agent's tests would have no chip that finds them.
 */
export function matchesTestTypeFilter(
  testType: string | null | undefined,
  filter: TestTypeFilterValue,
): boolean {
  if (filter === "all") return true;
  if (filter === "response")
    return testType === "response" || testType === "general";
  return testType === filter;
}

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
