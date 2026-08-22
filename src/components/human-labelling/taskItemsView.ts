// Items-tab helper for labelling tasks that link NO evaluators.
//
// The items tab is normally driven by the `/annotation-tasks/{uuid}/summary`
// endpoint, whose rows are keyed by (item × evaluator). A task with no linked
// evaluators therefore produces zero summary rows, so the tab would show "No
// items on this page." even though the task has items and the count reads "1
// item". This is the tool-call "correct or wrong" task shape, which attaches
// no evaluators.
//
// For that case the tab is driven straight from the task's own item list
// (returned in full by the task detail endpoint): searched, sorted by
// updated-at, and paged here in the browser.

export type TaskItemLike = {
  uuid: string;
  payload: unknown;
  created_at?: string;
  updated_at?: string;
};

/** Epoch millis for an item's updated-at (falling back to created-at). The
 * backend sends "YYYY-MM-DD HH:MM:SS" without a zone, so normalise to ISO
 * UTC before parsing. Unparseable / missing dates sort as oldest (0). */
function itemTime(item: TaskItemLike): number {
  const raw = item.updated_at ?? item.created_at ?? "";
  if (!raw) return 0;
  const t = new Date(raw.replace(" ", "T") + "Z").getTime();
  return Number.isNaN(t) ? 0 : t;
}

function matchesSearch(item: TaskItemLike, query: string): boolean {
  const p = (item.payload ?? {}) as Record<string, unknown>;
  const name = typeof p.name === "string" ? p.name : "";
  if (name.toLowerCase().includes(query)) return true;
  try {
    return JSON.stringify(item.payload ?? "")
      .toLowerCase()
      .includes(query);
  } catch {
    return false;
  }
}

/** Full filtered + sorted list (no paging) for the current search / sort. */
export function filterSortTaskItems<T extends TaskItemLike>(
  items: T[],
  search: string,
  sort: "asc" | "desc",
): T[] {
  const query = search.trim().toLowerCase();
  const matched = query
    ? items.filter((it) => matchesSearch(it, query))
    : items;
  return [...matched].sort((a, b) =>
    sort === "asc" ? itemTime(a) - itemTime(b) : itemTime(b) - itemTime(a),
  );
}

/** The rows to show on the current page, plus the total count matching the
 * search (which drives the list bar and page navigation). */
export function taskItemsPage<T extends TaskItemLike>(
  items: T[],
  opts: { search: string; sort: "asc" | "desc"; offset: number; limit: number },
): { items: T[]; total: number } {
  const filtered = filterSortTaskItems(items, opts.search, opts.sort);
  return {
    items: filtered.slice(opts.offset, opts.offset + opts.limit),
    total: filtered.length,
  };
}
