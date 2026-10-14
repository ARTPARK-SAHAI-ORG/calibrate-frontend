"use client";

import { useRef, useState } from "react";

import { useDialogNavKeys } from "@/hooks";

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
  // Step to the previous / next item while one item is open for edit.
  // Stepping throws edits away just like closing, so it asks the same
  // question first. The left and right arrow keys step too.
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
};

/** Previous / next for an edit window opened on one item. Leave them out
 * when several items are open at once: there is nothing to step between. */
export type ItemStepProps = {
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  /** Place of the open item in the whole task, for "3 of 41". */
  position?: { index: number; total: number };
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
  onPrev,
  onNext,
  hasPrev,
  hasNext,
}: UnsavedCloseGuardOptions) {
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);
  // What Discard does when the question was raised by stepping rather than
  // by closing.
  const pendingStepRef = useRef<(() => void) | null>(null);

  // Reset the confirmation whenever the dialog opens/closes, using the
  // adjust-state-during-render pattern (no effect) so it stays clean on
  // reopen without triggering set-state-in-effect.
  const [wasOpen, setWasOpen] = useState(isOpen);
  if (isOpen !== wasOpen) {
    setWasOpen(isOpen);
    setDiscardConfirmOpen(false);
  }

  // The Discard button: closes, or takes the step that raised the question.
  const doClose = () => {
    const step = pendingStepRef.current;
    pendingStepRef.current = null;
    setDiscardConfirmOpen(false);
    if (step) {
      step();
      return;
    }
    onBeforeClose?.();
    onClose();
  };

  // Close request from the ✕ / footer Cancel: close when clean, confirm when
  // dirty.
  const attemptClose = () => {
    if (submitting) return;
    if (isDirty) setDiscardConfirmOpen(true);
    else doClose();
  };

  // A step asks the discard question when there are edits. While the
  // question is on screen a step does nothing, so Discard cannot end up
  // doing something other than what raised it.
  const attemptStep = (step: () => void) => {
    if (submitting || discardConfirmOpen) return;
    if (!isDirty) {
      step();
      return;
    }
    pendingStepRef.current = step;
    setDiscardConfirmOpen(true);
  };
  const navPrev = onPrev ? () => attemptStep(onPrev) : undefined;
  const navNext = onNext ? () => attemptStep(onNext) : undefined;

  // No Escape: the window holds edits that have not been saved.
  useDialogNavKeys({
    isOpen,
    hasPrev,
    onPrev: navPrev,
    hasNext,
    onNext: navNext,
  });

  // Backdrop click handler — disabled in add mode, guarded in edit mode.
  const handleBackdropClick = () => {
    if (isEdit) attemptClose();
  };

  return {
    discardConfirmOpen,
    closeDiscardConfirm: () => {
      pendingStepRef.current = null;
      setDiscardConfirmOpen(false);
    },
    doClose,
    attemptClose,
    handleBackdropClick,
    navPrev,
    navNext,
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
