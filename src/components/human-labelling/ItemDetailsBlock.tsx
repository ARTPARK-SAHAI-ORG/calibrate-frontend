"use client";

import { useState } from "react";
import { Tooltip } from "@/components/Tooltip";
import { MetadataTable, type MetadataEntry } from "@/components/ui";

export function itemDescriptionOf(payload: unknown): string {
  const description =
    payload && typeof payload === "object"
      ? (payload as Record<string, unknown>).description
      : undefined;
  return typeof description === "string" ? description.trim() : "";
}

export function hasItemDetails(
  payload: unknown,
  metadata?: MetadataEntry[] | null,
): boolean {
  return Boolean(itemDescriptionOf(payload)) || Boolean(metadata?.length);
}

/** An item's description and metadata in one box headed "Item details", the
 *  way every view that shows one item draws them. Closed unless `defaultOpen`;
 *  the heading opens and closes it. Renders nothing when the item has neither. */
export function ItemDetailsBlock({
  payload,
  metadata,
  defaultOpen = false,
  heading = "Item details",
}: {
  payload: unknown;
  metadata?: MetadataEntry[] | null;
  defaultOpen?: boolean;
  heading?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  if (!hasItemDetails(payload, metadata)) return null;
  const description = itemDescriptionOf(payload);
  return (
    <section
      data-tutorial="item-details"
      className="border border-border rounded-xl bg-muted/20"
    >
      <Tooltip
        content={open ? "Hide the details" : "Show the details"}
        position="top"
      >
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((o) => !o)}
          className="w-full flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl text-base font-semibold text-foreground hover:bg-muted/50 transition-colors cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-foreground/30"
        >
          {heading}
          <svg
            className={`w-4 h-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </button>
      </Tooltip>
      {open && (
        <div className="px-3 pb-3 space-y-3">
          {description && (
            <div className="space-y-1">
              <h3 className="text-xs font-medium text-muted-foreground">
                Description
              </h3>
              <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                {description}
              </p>
            </div>
          )}
          <MetadataTable
            entries={metadata}
            headingClassName="text-xs font-medium text-muted-foreground"
          />
        </div>
      )}
    </section>
  );
}
