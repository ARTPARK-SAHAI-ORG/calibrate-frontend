"use client";

import { useState } from "react";
import { apiClient } from "@/lib/api";

/**
 * Per-item evaluators.
 *
 * An annotation item may carry its own evaluator list instead of using the
 * task's. The backend rule: an item's evaluators are its own list, or the
 * task's list when it has none, minus anything no longer linked to the task.
 * It never rewrites a saved item list when the task's evaluators change, so a
 * saved list can name evaluators the task has since dropped.
 *
 * That means the item read endpoints give us two fields and they are not
 * interchangeable:
 *   - `evaluator_ids` — what was saved, or null. On these reads it only tells
 *     us whether the user customised the item, so do not render the list
 *     itself from it.
 *   - `effective_evaluator_ids` — what actually applies now. Render from this,
 *     and send this back on a write; sending the raw list can include an
 *     unlinked evaluator, which the backend rejects with 400.
 *
 * The labelling job endpoint is different: the `evaluator_ids` on each of its
 * items is already resolved and frozen for that job, so `AnnotationJobView`
 * renders straight from it.
 */

export type TaskEvaluatorOption = {
  uuid: string;
  name: string;
  description?: string | null;
};

/** The two evaluator fields present on every item read. */
export type ItemEvaluatorFields = {
  evaluator_ids?: string[] | null;
  effective_evaluator_ids?: string[] | null;
};

/**
 * Which evaluators apply to this item right now.
 *
 * Falls back to the task's list when the backend has not sent
 * `effective_evaluator_ids`, so screens keep working against an older backend
 * and against optimistic rows we build client-side before a refetch.
 */
export function effectiveEvaluatorIds(
  item: ItemEvaluatorFields | null | undefined,
  taskEvaluatorIds: string[],
): string[] {
  const effective = item?.effective_evaluator_ids;
  if (Array.isArray(effective)) {
    // Guard against a stale id surviving in the response: the task's current
    // list is always the outer bound.
    const allowed = new Set(taskEvaluatorIds);
    return effective.filter((id) => allowed.has(id));
  }
  return taskEvaluatorIds;
}

/** True when the user has narrowed this item, so it no longer follows the task. */
export function isCustomisedItem(
  item: ItemEvaluatorFields | null | undefined,
): boolean {
  return Array.isArray(item?.evaluator_ids);
}

/**
 * Keep only the evaluators that apply to `itemEvaluatorIds`, preserving the
 * task's display order rather than the order the ids arrived in.
 */
export function filterEvaluatorsForItem<T extends { uuid: string }>(
  evaluators: T[],
  itemEvaluatorIds: string[] | null | undefined,
): T[] {
  if (!Array.isArray(itemEvaluatorIds)) return evaluators;
  const allowed = new Set(itemEvaluatorIds);
  return evaluators.filter((ev) => allowed.has(ev.uuid));
}

/**
 * The evaluators an add/edit dialog starts with: the item's own saved list
 * narrowed to what the task still has and put back in task order, or every
 * task evaluator when the item follows the task or when nothing it saved
 * survives. Never empty while the task has evaluators, because the backend
 * rejects an empty list.
 */
export function seedItemEvaluatorIds(
  taskEvaluatorIds: string[],
  initialEvaluatorIds: string[] | null | undefined,
): string[] {
  if (!Array.isArray(initialEvaluatorIds)) return taskEvaluatorIds;
  const kept = taskEvaluatorIds.filter((id) =>
    initialEvaluatorIds.includes(id),
  );
  return kept.length > 0 ? kept : taskEvaluatorIds;
}

/**
 * The one evaluator choice an item add/edit dialog offers.
 *
 * `submitValue` is what the caller sends for the item:
 *   - `undefined` — the user did not touch the choice, so leave the item's
 *     evaluators exactly as they are.
 *   - `null` — the selection is the task's full list, so the item follows the
 *     task.
 *   - a list — the item keeps its own evaluators.
 */
export function useItemEvaluatorSelection(
  taskEvaluators: { uuid: string }[] | undefined,
  initialEvaluatorIds: string[] | null | undefined,
  isOpen: boolean,
) {
  const taskIds = (taskEvaluators ?? []).map((e) => e.uuid);
  const seededIds = seedItemEvaluatorIds(taskIds, initialEvaluatorIds);

  // Re-seed when the dialog opens or closes, and when the seed itself changes
  // (a different item, or the task's evaluators changed underneath).
  const seedKey = `${isOpen}|${seededIds.join(",")}`;
  const [selectedIds, setSelectedIds] = useState(seededIds);
  const [lastSeedKey, setLastSeedKey] = useState(seedKey);
  if (seedKey !== lastSeedKey) {
    setLastSeedKey(seedKey);
    setSelectedIds(seededIds);
  }

  // The selection is always a subset of the task's list, so a shorter
  // selection is the whole test for "this item no longer follows the task".
  const isCustomised = selectedIds.length !== taskIds.length;
  const changed = selectedIds.join(",") !== seededIds.join(",");

  return {
    selectedIds,
    isCustomised,
    /** The picker hands back the full list it wants selected. */
    select: (ids: string[]) => setSelectedIds(ids),
    followTask: () => setSelectedIds(taskIds),
    changed,
    /** False when nothing is ticked, which the backend rejects. */
    canSubmit: taskIds.length === 0 || selectedIds.length > 0,
    submitValue: (changed ? (isCustomised ? selectedIds : null) : undefined) as
      string[] | null | undefined,
  };
}

export type BulkItemEvaluatorScope =
  { item_ids: string[] } | { select_all: true; q?: string };

/**
 * Add or remove one or more evaluators across a set of items.
 *
 * `add` on an item that still follows the task writes nothing and is not
 * counted, because that item already gets every task evaluator and saving a
 * list would stop it following the task.
 */
export async function bulkUpdateItemEvaluators(
  taskUuid: string,
  accessToken: string,
  action: "add" | "remove",
  evaluatorIds: string[],
  scope: BulkItemEvaluatorScope,
): Promise<number> {
  const result = await apiClient<{ updated_count?: number }>(
    `/annotation-tasks/${taskUuid}/items/evaluators`,
    accessToken,
    {
      method: "POST",
      body: { action, evaluator_ids: evaluatorIds, ...scope },
    },
  );
  return result?.updated_count ?? 0;
}
