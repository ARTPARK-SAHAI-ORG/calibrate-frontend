import { useCallback, useEffect, useState } from "react";

/**
 * Previous / next for one open item in a list that is loaded a page at a
 * time. Stepping past either end of the page on screen moves the list a
 * page and opens the item at the far edge of the page that arrives, so
 * the reader walks the whole list rather than one page of it.
 *
 * Every number here counts from `pageStart`, the start of the page the
 * caller currently HAS. The page a caller has asked for runs ahead of its
 * items while they load, and counting from that instead shows a position
 * a whole page out and lets a second press skip a page.
 */
export function useItemPager<T extends { uuid: string }>({
  items,
  openUuid,
  pageStart,
  pageSize,
  total,
  onOpen,
  onPageStartChange,
}: {
  /** The items on screen, in display order. */
  items: T[];
  /** The item currently open, if any. */
  openUuid: string | null;
  /** Position of `items[0]` in the whole list. */
  pageStart: number;
  /** How many items a page holds. */
  pageSize: number;
  /** How many items the list holds in total. */
  total: number;
  /** Opens an item. */
  onOpen: (uuid: string) => void;
  /** Asks for the page starting here. */
  onPageStartChange: (start: number) => void;
}) {
  /** Set while waiting for the page a step moved to. */
  const [pending, setPending] = useState<{
    start: number;
    edge: "first" | "last";
  } | null>(null);

  // The page the step moved to has arrived: open the item at the edge the
  // reader came from. Matching on the start keeps the item on screen from
  // being swapped for one on the page they just left.
  useEffect(() => {
    if (!pending) return;
    if (pending.start !== pageStart || items.length === 0) return;
    onOpen(pending.edge === "first" ? items[0].uuid : items[items.length - 1].uuid);
    setPending(null);
  }, [pending, pageStart, items, onOpen]);

  /** Opening an item directly cancels a step that has not landed yet, so
   * it cannot pull the reader off the item they chose. */
  const open = useCallback(
    (uuid: string) => {
      setPending(null);
      onOpen(uuid);
    },
    [onOpen],
  );

  /** Forgets a step that has not landed. Call when the item view closes. */
  const cancel = useCallback(() => setPending(null), []);

  const index = openUuid ? items.findIndex((i) => i.uuid === openUuid) : -1;
  const isOpen = index >= 0;
  const hasPrev = isOpen && (index > 0 || pageStart > 0);
  const hasNext = isOpen && pageStart + index < total - 1;

  const prev = useCallback(() => {
    if (index < 0) return;
    if (index > 0) {
      open(items[index - 1].uuid);
      return;
    }
    if (pageStart === 0) return;
    const start = Math.max(0, pageStart - pageSize);
    onPageStartChange(start);
    setPending({ start, edge: "last" });
  }, [index, items, open, pageStart, pageSize, onPageStartChange]);

  const next = useCallback(() => {
    if (index < 0) return;
    if (index < items.length - 1) {
      open(items[index + 1].uuid);
      return;
    }
    if (pageStart + index >= total - 1) return;
    const start = pageStart + pageSize;
    onPageStartChange(start);
    setPending({ start, edge: "first" });
  }, [index, items, open, pageStart, pageSize, total, onPageStartChange]);

  return {
    open,
    cancel,
    hasPrev,
    hasNext,
    prev,
    next,
    /** Place of the open item in the whole list, for "12 of 341". */
    position: isOpen
      ? { index: pageStart + index, total }
      : undefined,
  };
}
