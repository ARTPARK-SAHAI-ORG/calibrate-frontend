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
  /** Plural noun, e.g. `traces` or `items`. Defaults to `{itemNoun}s`. */
  itemNounPlural?: string;
};

/**
 * Count + per-page + page navigation for server-paginated lists. Canonical
 * markup shared by the Traces tab and human-alignment items tab — copy this
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
  itemNounPlural = `${itemNoun}s`,
}: ServerPaginatedListBarProps) {
  const showPagination = total > PAGE_SIZE_OPTIONS[0];
  const rangeStart = total === 0 ? 0 : offset + 1;
  const rangeEnd = Math.min(offset + loadedCount, total);
  const plural = total === 1 ? itemNoun : itemNounPlural;

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pb-1 text-sm text-muted-foreground">
      <div>
        {total === 0 ? (
          `0 ${itemNounPlural}`
        ) : !showPagination ? (
          <>
            <span className="text-foreground font-medium">{total}</span> {plural}
          </>
        ) : (
          <>
            Showing{" "}
            <span className="text-foreground font-medium">{rangeStart}</span>–
            <span className="text-foreground font-medium">{rangeEnd}</span> of{" "}
            <span className="text-foreground font-medium">{total}</span> {plural}
          </>
        )}
      </div>
      {showPagination && (
        <div className="flex items-center gap-3">
          <PageSizeSelect value={pageSize} onChange={onPageSizeChange} />
          {pageCount > 1 && (
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
      )}
    </div>
  );
}
