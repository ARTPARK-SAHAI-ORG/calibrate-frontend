"use client";

import React from "react";
import { Button } from "./Button";
import { useHideFloatingButton } from "@/components/AppLayout";

type ConfirmDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message?: string;
  confirmText?: string;
};

/** Plain "are you sure" step for an action that is not destructive, e.g.
 *  starting a run. Deletes keep DeleteConfirmationDialog and its red button. */
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
}: ConfirmDialogProps) {
  useHideFloatingButton(isOpen);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background rounded-xl w-full max-w-md p-5 md:p-6 shadow-2xl">
        <h2 className="text-base md:text-lg font-semibold text-foreground mb-2">
          {title}
        </h2>
        {message && (
          <p className="text-sm md:text-base text-muted-foreground mb-4">
            {message}
          </p>
        )}
        <div className="flex items-center justify-end gap-2 md:gap-3">
          <Button variant="secondary" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" size="md" onClick={onConfirm}>
            {confirmText}
          </Button>
        </div>
      </div>
    </div>
  );
}
