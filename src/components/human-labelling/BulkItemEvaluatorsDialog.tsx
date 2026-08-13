"use client";

import { useEffect, useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import {
  bulkUpdateItemEvaluators,
  type BulkItemEvaluatorScope,
  type TaskEvaluatorOption,
} from "./itemEvaluators";

type BulkAction = "add" | "remove";

function parseApiError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const match = err.message.match(/Request failed: \d+ - (.+)$/);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && typeof parsed.detail === "string") return parsed.detail;
    } catch {
      // not JSON
    }
    return match[1];
  }
  return err.message || fallback;
}

export type BulkItemEvaluatorsDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  accessToken: string;
  taskUuid: string;
  /** Every evaluator linked to the task, in task display order. */
  evaluators: TaskEvaluatorOption[];
  /** How many items the action will run over, for the copy. */
  selectedItemCount: number;
  /** Which items the backend should act on. Passed straight through. */
  scope: BulkItemEvaluatorScope;
  /** The parent refetches the items and shows a message. */
  onDone: (action: BulkAction, updatedCount: number) => void;
};

/**
 * Adds or removes evaluators across many items at once.
 *
 * There is no single current list to show across many rows, so the dialog only
 * offers "add these" or "remove these" rather than a picker.
 */
export function BulkItemEvaluatorsDialog({
  isOpen,
  onClose,
  accessToken,
  taskUuid,
  evaluators,
  selectedItemCount,
  scope,
  onDone,
}: BulkItemEvaluatorsDialogProps) {
  useHideFloatingButton(isOpen);

  const [action, setAction] = useState<BulkAction>("add");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setAction("add");
    setPicked(new Set());
    setError(null);
    setSubmitting(false);
  }, [isOpen]);

  if (!isOpen) return null;

  const toggle = (uuid: string) => {
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  };

  const itemLabel = `${selectedItemCount} ${
    selectedItemCount === 1 ? "item" : "items"
  }`;

  // Removing every evaluator would leave an item with none, which the backend
  // rejects. Only the task's list matters: an item with its own shorter list
  // can only end up with fewer.
  const wouldEmptyItems =
    action === "remove" &&
    evaluators.length > 0 &&
    picked.size === evaluators.length;

  const handleSubmit = async () => {
    if (picked.size === 0 || wouldEmptyItems || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      // Keep the task's order rather than the click order.
      const ids = evaluators
        .filter((ev) => picked.has(ev.uuid))
        .map((ev) => ev.uuid);
      const updatedCount = await bulkUpdateItemEvaluators(
        taskUuid,
        accessToken,
        action,
        ids,
        scope,
      );
      // A lower count than the rows picked is normal, not a failure: an item
      // that still follows the task is skipped on add.
      onDone(action, updatedCount);
    } catch (err) {
      setError(parseApiError(err, "Failed to update the evaluators"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-lg flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Change evaluators</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Applies to the {itemLabel} you selected
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="p-4 md:p-6 overflow-y-auto space-y-3">
          <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/30">
            <button
              type="button"
              onClick={() => setAction("add")}
              disabled={submitting}
              className={`h-8 px-3 rounded-md text-xs md:text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                action === "add"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => setAction("remove")}
              disabled={submitting}
              className={`h-8 px-3 rounded-md text-xs md:text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                action === "remove"
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Remove
            </button>
          </div>

          <p className="text-xs text-muted-foreground">
            {action === "add"
              ? `Add the selected evaluators to ${itemLabel}. An item that still uses the task's evaluators already has them, so it is left alone.`
              : `Remove the selected evaluators from ${itemLabel}. The task and every other item keep them.`}
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {evaluators.map((ev) => (
              <label
                key={ev.uuid}
                className="flex items-start gap-3 px-3 py-2 rounded-md border border-border hover:bg-muted/30 transition-colors cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={picked.has(ev.uuid)}
                  disabled={submitting}
                  onChange={() => toggle(ev.uuid)}
                  className="mt-0.5 w-4 h-4 accent-foreground cursor-pointer disabled:cursor-not-allowed"
                />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{ev.name}</div>
                  {ev.description && (
                    <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                      {ev.description}
                    </div>
                  )}
                </div>
              </label>
            ))}
          </div>

          {wouldEmptyItems && (
            <p className="text-xs text-red-500">
              An item must keep at least one evaluator.
            </p>
          )}

          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
              {error}
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="h-10 px-4 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={picked.size === 0 || wouldEmptyItems || submitting}
            title={
              wouldEmptyItems
                ? "An item must keep at least one evaluator"
                : undefined
            }
            className="h-10 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting
              ? "Saving..."
              : action === "add"
                ? "Add to items"
                : "Remove from items"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default BulkItemEvaluatorsDialog;
