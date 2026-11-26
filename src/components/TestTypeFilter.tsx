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
function testTypeFilterOptions(
  agentNature?: "conversation" | "general",
): { value: TestTypeFilterValue; label: string }[] {
  // One agent holds only one kind of reply test; a list across agents holds both.
  const replies: { value: TestTypeFilterValue; label: string }[] = agentNature
    ? [
        {
          value: "response",
          label: testTypeLabel(
            agentNature === "general" ? "general" : "response",
          ),
        },
      ]
    : [
        { value: "response", label: testTypeLabel("response") },
        { value: "general", label: testTypeLabel("general") },
      ];
  return [
    { value: "all", label: "All" },
    ...replies,
    { value: "tool_call", label: testTypeLabel("tool_call") },
  ];
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
  /** The agent whose tests are listed; leave out for a list across agents. */
  agentNature?: "conversation" | "general";
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
  agentNature,
}: TestTypeFilterProps) {
  return (
    <SegmentedFilter
      value={value}
      onChange={onChange}
      options={testTypeFilterOptions(agentNature)}
      size={size}
      className={className}
      ariaLabel="Filter tests by type"
    />
  );
}
