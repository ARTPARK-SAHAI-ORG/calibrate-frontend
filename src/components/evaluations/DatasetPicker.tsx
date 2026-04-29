"use client";

import { useState } from "react";
import { Dataset } from "@/lib/datasets";
import { Tooltip } from "@/components/Tooltip";

const EMPTY_DATASET_TOOLTIP =
  "This dataset has no items. Add a few rows to it before running an evaluation.";

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

type Props = {
  datasets: Dataset[];
  selectedId: string;
  onSelect: (id: string) => void;
};

export function DatasetPicker({ datasets, selectedId, onSelect }: Props) {
  const [search, setSearch] = useState("");

  const filtered = datasets.filter((ds) =>
    ds.name.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-2">
      {/* Search input */}
      <div className="relative">
        <svg
          className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 15.803 7.5 7.5 0 0015.803 15.803z"
          />
        </svg>
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search datasets"
          className="w-full h-8 pl-8 pr-3 rounded-md text-sm border border-border bg-background focus:outline-none focus:ring-1 focus:ring-foreground/30"
        />
      </div>

      {/* Table */}
      <div className="border border-border rounded-xl overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[2fr_70px_1fr] px-4 py-2 bg-muted/40 border-b border-border">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide">
            Name
          </span>
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide text-right">
            Items
          </span>
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wide text-right">
            Updated
          </span>
        </div>

        {/* Rows */}
        {filtered.length === 0 ? (
          <div className="px-4 py-6 text-center text-sm text-muted-foreground">
            {datasets.length === 0
              ? "No datasets yet"
              : "No datasets match your search"}
          </div>
        ) : (
          filtered.map((ds, i) => {
            const hasItems = (ds.item_count ?? 0) > 0;
            const isSelected = hasItems && ds.uuid === selectedId;
            const rowClass = `w-full grid grid-cols-[2fr_70px_1fr] items-start px-4 py-3 text-left transition-colors ${
              i < filtered.length - 1 ? "border-b border-border" : ""
            } ${
              !hasItems
                ? "cursor-not-allowed bg-muted/25 opacity-[0.65] hover:bg-muted/25"
                : `cursor-pointer ${
                    isSelected ? "bg-foreground/5" : "hover:bg-muted/40"
                  }`
            }`;

            const rowBody = (
              <>
                <div className="flex items-start gap-2 min-w-0">
                  {hasItems && isSelected ? (
                    <svg
                      className="w-3.5 h-3.5 text-foreground shrink-0 mt-0.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2.5}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4.5 12.75l6 6 9-13.5"
                      />
                    </svg>
                  ) : (
                    <div className="w-3.5 h-3.5 shrink-0 mt-0.5" aria-hidden />
                  )}
                  <div className="flex flex-col min-w-0 text-left">
                    <span
                      className={`text-sm truncate ${
                        isSelected
                          ? "font-medium text-foreground"
                          : hasItems
                            ? "text-foreground"
                            : "text-muted-foreground"
                      }`}
                    >
                      {ds.name}
                    </span>
                  </div>
                </div>

                <span
                  className={`text-sm text-right tabular-nums ${
                    hasItems
                      ? "text-muted-foreground"
                      : "text-muted-foreground/70"
                  }`}
                >
                  {ds.item_count}
                </span>

                <span
                  className={`text-sm text-right ${
                    hasItems
                      ? "text-muted-foreground"
                      : "text-muted-foreground/70"
                  }`}
                >
                  {formatDate(ds.updated_at)}
                </span>
              </>
            );

            if (hasItems) {
              return (
                <button
                  key={ds.uuid}
                  type="button"
                  onClick={() => onSelect(ds.uuid)}
                  className={rowClass}
                >
                  {rowBody}
                </button>
              );
            }

            return (
              <Tooltip
                key={ds.uuid}
                content={EMPTY_DATASET_TOOLTIP}
                position="top"
                className="w-full block"
              >
                <div className="w-full">
                  <button
                    type="button"
                    disabled
                    tabIndex={-1}
                    aria-disabled="true"
                    className={`${rowClass} pointer-events-none`}
                  >
                    {rowBody}
                  </button>
                </div>
              </Tooltip>
            );
          })
        )}
      </div>
    </div>
  );
}
