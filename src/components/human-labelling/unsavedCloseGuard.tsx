"use client";

import { useState } from "react";

type UnsavedCloseGuardOptions = {
  isOpen: boolean;
  // Whether the form currently has unsaved changes (computed by the caller,
  // since the dirty check differs per dialog).
  isDirty: boolean;
  // Edit mode allows the backdrop to close (with the dirty check); add mode
  // disables backdrop close entirely so a stray click can't discard work.
  isEdit: boolean;
  // Block closing mid-submit.
  submitting: boolean;
  onClose: () => void;
  // Optional cleanup to run right before actually closing (e.g. clear errors).
  onBeforeClose?: () => void;
};

/**
 * Shared "don't lose my work" close handling for item add/edit dialogs.
 *
 * Returns handlers that close immediately when the form is clean and pop a
 * discard confirmation when it's dirty. The backdrop is inert in add mode and
 * routes through the same check in edit mode.
 */
export function useUnsavedCloseGuard({
  isOpen,
  isDirty,
  isEdit,
  submitting,
  onClose,
  onBeforeClose,
}: UnsavedCloseGuardOptions) {
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  // Reset the confirmation whenever the dialog opens/closes, using the
  // adjust-state-during-render pattern (no effect) so it stays clean on
  // reopen without triggering set-state-in-effect.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    setDiscardConfirmOpen(false);
  }

  const doClose = () => {
    onBeforeClose?.();
    setDiscardConfirmOpen(false);
    onClose();
  };

  // Close request from the ✕ / footer Cancel: close when clean, confirm when
  // dirty.
  const attemptClose = () => {
    if (submitting) return;
    if (isDirty) setDiscardConfirmOpen(true);
    else doClose();
  };

  // Backdrop click handler — disabled in add mode, guarded in edit mode.
  const handleBackdropClick = () => {
    if (isEdit) attemptClose();
  };

  return {
    discardConfirmOpen,
    closeDiscardConfirm: () => setDiscardConfirmOpen(false),
    doClose,
    attemptClose,
    handleBackdropClick,
  };
}

/**
 * Discard-changes confirmation overlay, rendered on top of the dialog it
 * guards. Expects to sit inside the dialog's positioned (fixed/relative)
 * backdrop container.
 */
export function DiscardChangesDialog({
  open,
  onKeepEditing,
  onDiscard,
}: {
  open: boolean;
  onKeepEditing: () => void;
  onDiscard: () => void;
}) {
  if (!open) return null;
  return (
    <div
      className="absolute inset-0 z-10 flex items-center justify-center bg-black/50 p-4"
      onClick={(e) => {
        e.stopPropagation();
        onKeepEditing();
      }}
    >
      <div
        className="bg-background border border-border rounded-xl w-full max-w-sm shadow-2xl p-5"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-foreground">
          Discard changes?
        </h3>
        <p className="text-sm text-muted-foreground mt-1">
          You have unsaved changes. If you close now, they&apos;ll be lost.
        </p>
        <div className="mt-5 flex items-center justify-end gap-2 md:gap-3">
          <button
            onClick={onKeepEditing}
            className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium border border-border bg-background dark:bg-muted hover:bg-muted/50 dark:hover:bg-accent transition-colors cursor-pointer"
          >
            Keep editing
          </button>
          <button
            onClick={onDiscard}
            className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-red-600 text-white hover:bg-red-700 transition-colors cursor-pointer"
          >
            Discard
          </button>
        </div>
      </div>
    </div>
  );
}
