"use client";

import { useEffect, useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { humaniseDetailObject } from "./bulk-upload-shared";
import {
  DiscardChangesDialog,
  useUnsavedCloseGuard,
} from "./unsavedCloseGuard";

type SttRowDraft = {
  id: string;
  uuid?: string; // present in edit mode; undefined for new rows
  name: string;
  actual: string;
  predicted: string;
};

export type SttItemRowSubmission = {
  uuid?: string;
  name: string;
  actual_transcript: string;
  predicted_transcript: string;
};

type AddSttItemsDialogProps = {
  isOpen: boolean;
  mode?: "add" | "edit";
  initialRows?: {
    uuid: string;
    name: string;
    actual: string;
    predicted: string;
  }[];
  onClose: () => void;
  onSubmit: (rows: SttItemRowSubmission[]) => Promise<void> | void;
};

function extractApiError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const m = err.message.match(/Request failed: \d+ - ([\s\S]+)$/);
  if (m) {
    try {
      const parsed = JSON.parse(m[1]);
      if (parsed?.detail && typeof parsed.detail === "object") {
        const msg = humaniseDetailObject(parsed.detail);
        if (msg) return msg;
      }
    } catch {
      /* ignore */
    }
    return m[1];
  }
  return err.message || fallback;
}

const newRow = (): SttRowDraft => ({
  id:
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  name: "",
  actual: "",
  predicted: "",
});

export function AddSttItemsDialog({
  isOpen,
  mode = "add",
  initialRows,
  onClose,
  onSubmit,
}: AddSttItemsDialogProps) {
  useHideFloatingButton(isOpen);

  const isEdit = mode === "edit";

  const [rows, setRows] = useState<SttRowDraft[]>(() =>
    initialRows && initialRows.length > 0
      ? initialRows.map((r) => ({
          id: r.uuid,
          uuid: r.uuid,
          name: r.name,
          actual: r.actual,
          predicted: r.predicted,
        }))
      : [newRow()],
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset rows whenever the dialog opens (so a fresh edit starts from the
  // latest selected items, and a reopened add starts blank).
  useEffect(() => {
    if (isOpen) {
      setRows(
        initialRows && initialRows.length > 0
          ? initialRows.map((r) => ({
              id: r.uuid,
              uuid: r.uuid,
              name: r.name,
              actual: r.actual,
              predicted: r.predicted,
            }))
          : [newRow()],
      );
      setError(null);
    }
  }, [isOpen, initialRows]);

  // Unsaved-changes check. Add mode: any field has content. Edit mode: any
  // field differs from the item it was seeded with (rows align 1:1 with
  // initialRows since edit mode can't add/remove rows).
  const isDirty = isEdit
    ? rows.some((r, i) => {
        const init = initialRows?.[i];
        return (
          r.name.trim() !== (init?.name ?? "").trim() ||
          r.actual.trim() !== (init?.actual ?? "").trim() ||
          r.predicted.trim() !== (init?.predicted ?? "").trim()
        );
      })
    : rows.some((r) => r.name.trim() || r.actual.trim() || r.predicted.trim());

  // Note: this dialog intentionally has no backdrop-click close, so
  // `handleBackdropClick` is not used here.
  const { discardConfirmOpen, closeDiscardConfirm, doClose, attemptClose } =
    useUnsavedCloseGuard({
    isOpen,
    isDirty,
    isEdit,
    submitting,
    onClose,
    onBeforeClose: () => setError(null),
  });

  if (!isOpen) return null;

  const updateRow = (id: string, patch: Partial<SttRowDraft>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const removeRow = (id: string) => {
    setRows((prev) =>
      prev.length === 1 ? prev : prev.filter((r) => r.id !== id),
    );
  };

  const addRow = () => setRows((prev) => [...prev, newRow()]);

  const validRows: SttItemRowSubmission[] = rows
    .map((r) => ({
      uuid: r.uuid,
      name: r.name.trim(),
      actual_transcript: r.actual.trim(),
      predicted_transcript: r.predicted.trim(),
    }))
    .filter((r) => r.name && r.actual_transcript && r.predicted_transcript);

  const handleSubmit = async () => {
    if (validRows.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(validRows);
    } catch (err) {
      setError(
        extractApiError(
          err,
          isEdit ? "Failed to save items" : "Failed to add items",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div
        className="bg-background border border-border rounded-xl w-full max-w-4xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 md:px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-foreground">
              {isEdit ? "Edit items" : "Add items"}
            </h2>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              {isEdit
                ? "Update the name, reference, and predicted transcripts for each row"
                : "Annotators will compare the predicted transcript against the reference"}
            </p>
          </div>
          <button
            onClick={attemptClose}
            disabled={submitting}
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
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

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
          {/* One card per item, fields stacked vertically so long transcripts
              (incl. non-latin scripts) are fully readable. Add mode can add /
              remove cards; edit mode seeds a fixed set from the selection. */}
          {rows.map((row, idx) => (
            <div
              key={row.id}
              className="border border-border rounded-xl bg-muted/10 p-4 space-y-3"
            >
              {(!isEdit || rows.length > 1) && (
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-muted-foreground">
                    Item {idx + 1}
                  </span>
                  {!isEdit && (
                    <button
                      onClick={() => removeRow(row.id)}
                      disabled={rows.length === 1 || submitting}
                      className="w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                      aria-label={`Remove item ${idx + 1}`}
                      title="Remove this item"
                    >
                      <svg
                        className="w-4 h-4"
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
                  )}
                </div>
              )}
              <div className="space-y-1">
                <label className="block text-xs font-medium text-muted-foreground">
                  Name
                </label>
                <input
                  type="text"
                  value={row.name}
                  onChange={(e) => updateRow(row.id, { name: e.target.value })}
                  placeholder="e.g. Clip 1"
                  disabled={submitting}
                  className="w-full h-9 px-3 rounded-md text-sm border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-muted-foreground">
                  Reference transcript
                </label>
                <textarea
                  value={row.actual}
                  onChange={(e) => updateRow(row.id, { actual: e.target.value })}
                  placeholder="What was actually said"
                  rows={3}
                  disabled={submitting}
                  className="w-full px-3 py-2 rounded-md text-sm border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 resize-y"
                />
              </div>
              <div className="space-y-1">
                <label className="block text-xs font-medium text-muted-foreground">
                  Predicted transcript
                </label>
                <textarea
                  value={row.predicted}
                  onChange={(e) =>
                    updateRow(row.id, { predicted: e.target.value })
                  }
                  placeholder="What the system transcribed"
                  rows={3}
                  disabled={submitting}
                  className="w-full px-3 py-2 rounded-md text-sm border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 resize-y"
                />
              </div>
            </div>
          ))}

          {!isEdit && (
            <button
              onClick={addRow}
              disabled={submitting}
              className="w-full h-10 rounded-md text-sm font-medium border border-dashed border-border bg-background hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
            >
              <svg
                className="w-4 h-4"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
              Add another item
            </button>
          )}

          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 md:gap-3 px-5 md:px-6 py-4 border-t border-border">
          <div className="flex items-center gap-2 md:gap-3">
            <button
              onClick={attemptClose}
              disabled={submitting}
              className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium border border-border bg-background dark:bg-muted hover:bg-muted/50 dark:hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={validRows.length === 0 || submitting}
              className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting
                ? isEdit
                  ? "Saving..."
                  : "Adding..."
                : isEdit
                  ? validRows.length > 1
                    ? `Save ${validRows.length} items`
                    : "Save item"
                  : validRows.length > 1
                    ? `Add ${validRows.length} items`
                    : "Add item"}
            </button>
          </div>
        </div>
      </div>

      <DiscardChangesDialog
        open={discardConfirmOpen}
        onKeepEditing={closeDiscardConfirm}
        onDiscard={doClose}
      />
    </div>
  );
}
