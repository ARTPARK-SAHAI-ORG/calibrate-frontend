"use client";

import React from "react";
import { PAGE_SIZE_OPTIONS } from "@/hooks/usePageSize";

/** The "Per page" picker shown next to a list's page controls. The caller
 *  sends the reader back to the first page when the choice changes. */
export function PageSizeSelect({
  value,
  onChange,
}: {
  value: number;
  onChange: (next: number) => void;
}) {
  return (
    <label className="flex items-center gap-2">
      <span>Per page</span>
      <div className="relative">
        <select
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="h-8 pl-3 pr-8 appearance-none rounded-md border border-border bg-background text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {PAGE_SIZE_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>
              {opt}
            </option>
          ))}
        </select>
        <svg
          className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </div>
    </label>
  );
}
