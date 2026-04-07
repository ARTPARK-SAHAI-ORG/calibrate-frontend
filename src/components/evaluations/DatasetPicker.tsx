"use client";

import { useState } from "react";
import { Dataset } from "@/lib/datasets";

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
            const isSelected = ds.uuid === selectedId;
            return (
              <button
                key={ds.uuid}
                type="button"
                onClick={() => onSelect(ds.uuid)}
                className={`w-full grid grid-cols-[2fr_70px_1fr] items-center px-4 py-3 text-left transition-colors cursor-pointer ${
                  i < filtered.length - 1 ? "border-b border-border" : ""
                } ${isSelected ? "bg-foreground/5" : "hover:bg-muted/40"}`}
              >
                {/* Name + checkmark */}
                <div className="flex items-center gap-2 min-w-0">
                  {isSelected ? (
                    <svg
                      className="w-3.5 h-3.5 text-foreground shrink-0"
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
                    <div className="w-3.5 h-3.5 shrink-0" />
                  )}
                  <span
                    className={`text-sm truncate ${
                      isSelected
                        ? "font-medium text-foreground"
                        : "text-foreground"
                    }`}
                  >
                    {ds.name}
                  </span>
                </div>

                {/* Item count */}
                <span className="text-sm text-muted-foreground text-right">
                  {ds.item_count}
                </span>

                {/* Updated date */}
                <span className="text-sm text-muted-foreground text-right">
                  {formatDate(ds.updated_at)}
                </span>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}
