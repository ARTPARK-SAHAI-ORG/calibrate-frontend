"use client";

import { useCallback, useState } from "react";

/**
 * Tracks which test rows are ticked for "submit for labelling". Items are
 * keyed by an opaque string id — test uuid for unit-test runs, `model:index`
 * for benchmark runs (see `benchmarkLabellingKey`). Shared by
 * `TestRunnerDialog` and `BenchmarkResultsDialog` so the toggle / bulk-toggle
 * semantics stay identical.
 */
export function useLabellingSelection() {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Select all of `ids` unless they're already all selected, in which case
  // deselect them — drives both the global and per-group "select all" toggles.
  const bulkToggle = useCallback((ids: string[]) => {
    setSelected((prev) => {
      const next = new Set(prev);
      const allSelected = ids.length > 0 && ids.every((id) => next.has(id));
      for (const id of ids) {
        if (allSelected) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, []);

  const clear = useCallback(() => setSelected(new Set()), []);

  return { selected, toggle, bulkToggle, clear };
}
