"use client";

import React from "react";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { SelectCheckbox } from "@/components/ui/SelectCheckbox";

type CheckboxProps = React.ComponentProps<typeof SelectCheckbox>;

/**
 * Presentational pieces for the STT/TTS evaluation-list delete UI. The two
 * pages mirror each other, so the twinned layout bits live here and are driven
 * by the shared `useJobDeletion` hook's outputs. State/logic stays in the hook;
 * these only render.
 */

/** Count + "Delete selected (N)" bar shown above the evaluations table. */
export function JobBulkDeleteBar({
  count,
  selectedCount,
  onBulkDelete,
}: {
  count: number;
  selectedCount: number;
  onBulkDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 mb-3">
      <p className="text-sm text-muted-foreground">
        {count} {count === 1 ? "evaluation" : "evaluations"}
      </p>
      {selectedCount > 0 && (
        <button
          onClick={onBulkDelete}
          className="h-9 px-4 rounded-md text-sm font-medium border border-red-500 text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer flex-shrink-0"
        >
          Delete selected ({selectedCount})
        </button>
      )}
    </div>
  );
}

/** Table-header "select all finished evaluations" checkbox cell. */
export function JobSelectAllCell({
  allSelected,
  hasBulkDeletableJobs,
  onToggle,
}: {
  allSelected: boolean;
  hasBulkDeletableJobs: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="flex items-center">
      <SelectCheckbox
        checked={allSelected}
        onToggle={onToggle}
        disabled={!hasBulkDeletableJobs}
        label="Select all finished evaluations"
        tooltip={
          hasBulkDeletableJobs ? undefined : "No finished evaluations to select"
        }
      />
    </div>
  );
}

/** Desktop table-row selection checkbox cell. */
export function JobRowSelectCell({
  checkboxProps,
}: {
  checkboxProps: CheckboxProps;
}) {
  return (
    <div className="flex items-center">
      <SelectCheckbox {...checkboxProps} />
    </div>
  );
}

/** Desktop table-row delete-icon cell. */
export function JobRowDeleteCell({ onDelete }: { onDelete: () => void }) {
  return (
    <div className="flex items-center justify-end">
      <DeleteIconButton onClick={onDelete} title="Delete evaluation" />
    </div>
  );
}

/** Mobile card select + delete controls. */
export function JobMobileSelectDelete({
  checkboxProps,
  onDelete,
}: {
  checkboxProps: CheckboxProps;
  onDelete: () => void;
}) {
  return (
    <div className="flex items-center justify-between mb-4">
      <SelectCheckbox {...checkboxProps} />
      <DeleteIconButton onClick={onDelete} title="Delete evaluation" />
    </div>
  );
}

/** Single/bulk delete confirmation dialog with evaluation-specific copy. */
export function JobDeleteDialog({
  open,
  bulkCount,
  isDeleting,
  error,
  onClose,
  onConfirm,
}: {
  open: boolean;
  bulkCount: number;
  isDeleting: boolean;
  error: string | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;
  return (
    <DeleteConfirmationDialog
      isOpen
      onClose={onClose}
      onConfirm={onConfirm}
      title={bulkCount > 0 ? "Delete evaluations" : "Delete evaluation"}
      message={
        bulkCount > 0
          ? `Are you sure you want to delete ${bulkCount} evaluation${bulkCount > 1 ? "s" : ""}? This action cannot be undone.`
          : "Are you sure you want to delete this evaluation? This action cannot be undone."
      }
      confirmText="Delete"
      isDeleting={isDeleting}
      extraContent={
        error ? <p className="text-sm text-red-500">{error}</p> : undefined
      }
    />
  );
}
