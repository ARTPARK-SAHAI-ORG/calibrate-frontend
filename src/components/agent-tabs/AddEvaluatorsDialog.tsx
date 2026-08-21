"use client";

import React, { useState, useEffect } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { EvaluatorPicker } from "@/components/evaluators/EvaluatorPicker";
import type { EvaluatorData } from "@/lib/evaluatorApi";

type AddEvaluatorsDialogProps = {
  isOpen: boolean;
  /** Library minus already-attached (parent filters, but we stay defensive). */
  availableEvaluators: EvaluatorData[];
  onClose: () => void;
  /** Parent does the attaching + refresh; we just hand back the picked uuids. */
  onAdd: (selectedUuids: string[]) => Promise<void> | void;
  /** The line under the title. Says where the evaluators are going. */
  description?: string;
  /** Offer full-conversation evaluators, hidden everywhere else. */
  allowConversationType?: boolean;
};

export function AddEvaluatorsDialog({
  isOpen,
  availableEvaluators,
  onClose,
  onAdd,
  description = "Choose evaluators from your library to add to this agent",
  allowConversationType = false,
}: AddEvaluatorsDialogProps) {
  // Hide the floating "Talk to Us" button while the modal is open.
  useHideFloatingButton(isOpen);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset transient state each time the dialog opens so a re-open starts fresh.
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set());
      setSaving(false);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const toggle = (uuid: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) {
        next.delete(uuid);
      } else {
        next.add(uuid);
      }
      return next;
    });
  };

  const handleClose = () => {
    if (!saving) onClose();
  };

  const handleAdd = async () => {
    if (selectedIds.size === 0 || saving) return;
    try {
      setSaving(true);
      setError(null);
      await onAdd(Array.from(selectedIds));
      onClose();
    } catch (err) {
      // Keep the dialog open and surface the failure instead of closing as if
      // the add succeeded.
      setError(err instanceof Error ? err.message : "Failed to add evaluators");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={handleClose}
    >
      <div
        data-tour="add-evaluators-dialog"
        // A real height, not just a cap: the columns inside fill the body, and a
        // percentage of a content-sized box would leave them unscrollable.
        className="bg-background border border-border rounded-xl w-full max-w-6xl shadow-2xl flex flex-col max-h-[90vh] md:h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 md:px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-foreground">
              Add evaluators
            </h2>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              {description}
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={saving}
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Close"
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

        {/* Body */}
        {/* The picker is the whole body, so let it have the height rather
            than scrolling the body around it. */}
        <div className="flex-1 min-h-0 overflow-y-auto md:overflow-hidden p-4 md:p-6">
          <EvaluatorPicker
            evaluators={availableEvaluators}
            selectedIds={selectedIds}
            onToggle={toggle}
            emptyMessage="All evaluators are already added"
            allowConversationType={allowConversationType}
            fillHeight
          />
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 px-5 md:px-6 py-4 border-t border-border">
          {error && (
            <p
              role="alert"
              className="text-sm text-red-600 dark:text-red-400 text-right"
            >
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 md:gap-3">
            <button
              onClick={handleClose}
              disabled={saving}
              className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium border border-border bg-background dark:bg-muted hover:bg-muted/50 dark:hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              data-tour="evaluators-add-confirm"
              onClick={handleAdd}
              disabled={selectedIds.size === 0 || saving}
              className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {saving && (
                <svg
                  className="w-4 h-4 animate-spin"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              )}
              {saving
                ? "Adding..."
                : `Add${selectedIds.size > 0 ? ` (${selectedIds.size})` : ""}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
