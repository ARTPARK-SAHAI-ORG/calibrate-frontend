"use client";

import { PAGE_SIZE_OPTIONS } from "@/hooks/usePageSize";
import { PageSizeSelect } from "./PageSizeSelect";

export type ServerPaginatedListBarProps = {
  total: number;
  offset: number;
  /** Rows on the current page (usually `items.length`). */
  loadedCount: number;
  pageSize: number;
  onPageSizeChange: (next: number) => void;
  currentPage: number;
  pageCount: number;
  onPrev: () => void;
  onNext: () => void;
  prevDisabled?: boolean;
  nextDisabled?: boolean;
  /** Singular noun, e.g. `trace` or `item`. */
  itemNoun: string;
  /** Sits on the right of the same line, before the paging controls. */
  trailing?: React.ReactNode;
  /** Plural noun, e.g. `traces` or `items`. Defaults to `{itemNoun}s`. */
  itemNounPlural?: string;
};

/**
 * Count + per-page + page navigation for server-paginated lists. Canonical
 * markup shared by the Monitoring tab and human-alignment items tab — copy this
 * component instead of inlining the bar. Rules: CLAUDE.md → Server-paginated
 * list bar.
 */
export function ServerPaginatedListBar({
  total,
  offset,
  loadedCount,
  pageSize,
  onPageSizeChange,
  currentPage,
  pageCount,
  onPrev,
  onNext,
  prevDisabled = false,
  nextDisabled = false,
  itemNoun,
  trailing,
  itemNounPlural = `${itemNoun}s`,
}: ServerPaginatedListBarProps) {
  const showPagination = total > PAGE_SIZE_OPTIONS[0];
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + loadedCount, total);
  const plural = total === 1 ? itemNoun : itemNounPlural;

  return (
    // With something pinned to the right, the row becomes three zones so that
    // thing keeps its place as the page controls change width: count and page
    // size left, arrows centred. Without one, the old two-zone row.
    <div
      className={`flex flex-wrap items-center gap-3 pb-1 text-sm text-muted-foreground ${
        trailing ? "" : "justify-between"
      }`}
    >
      <div className="flex items-center gap-3">
        <span>
          {total === 0
            ? `0 ${itemNounPlural}`
            : !showPagination
              ? `${total} ${plural}`
              : `${rangeStart}–${rangeEnd} of ${total} ${plural}`}
        </span>
        {/* Beside the count only when the right is taken; otherwise it keeps
            its old place over there. */}
        {showPagination && trailing && (
          <PageSizeSelect value={pageSize} onChange={onPageSizeChange} />
        )}
      </div>
      <div
        className={
          trailing
            ? "flex-1 flex items-center justify-center"
            : "flex items-center gap-3"
        }
      >
        {showPagination && !trailing && (
          <PageSizeSelect value={pageSize} onChange={onPageSizeChange} />
        )}
        {showPagination && pageCount > 1 && (
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onPrev}
              disabled={prevDisabled}
              aria-label="Previous page"
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border bg-background hover:bg-muted transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M15 19l-7-7 7-7"
                />
              </svg>
            </button>
            <span className="px-2 text-sm">
              Page{" "}
              <span className="text-foreground font-medium">{currentPage}</span>{" "}
              of{" "}
              <span className="text-foreground font-medium">{pageCount}</span>
            </span>
            <button
              type="button"
              onClick={onNext}
              disabled={nextDisabled}
              aria-label="Next page"
              className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border bg-background hover:bg-muted transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          </div>
        )}
      </div>
      {trailing}
    </div>
  );
}
