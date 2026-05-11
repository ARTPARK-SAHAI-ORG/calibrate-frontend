"use client";

import React from "react";
import { useHideFloatingButton } from "@/components/AppLayout";

type DeleteConfirmationDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDeleting?: boolean;
  /** Optional content rendered between the message and the action row
   * (e.g. a "permanently delete" checkbox). */
  extraContent?: React.ReactNode;
};

export function DeleteConfirmationDialog({
  isOpen,
  onClose,
  onConfirm,
  title = "Confirm deletion",
  message,
  confirmText = "Remove",
  cancelText = "Cancel",
  isDeleting = false,
  extraContent,
}: DeleteConfirmationDialogProps) {
  // Hide the floating "Talk to Us" button when this dialog is open
  useHideFloatingButton(isOpen);

  if (!isOpen) return null;

  const handleClose = () => {
    if (!isDeleting) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background rounded-xl w-full max-w-md p-5 md:p-6 shadow-2xl">
        <h2 className="text-base md:text-lg font-semibold text-foreground mb-2">
          {title}
        </h2>
        <p className="text-sm md:text-base text-muted-foreground mb-4">
          {message}
        </p>
        {extraContent && <div className="mb-5">{extraContent}</div>}
        <div className="flex items-center justify-end gap-2 md:gap-3">
          <button
            onClick={handleClose}
            disabled={isDeleting}
            className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {cancelText}
          </button>
          <button
            onClick={onConfirm}
            disabled={isDeleting}
            className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium bg-red-800 text-white hover:bg-red-900 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isDeleting && (
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
                ></circle>
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                ></path>
              </svg>
            )}
            {isDeleting
              ? `${confirmText.replace(/e$/, "")}ing...`
              : confirmText}
          </button>
        </div>
      </div>

      {/* Backdrop click to close */}
      <div className="absolute inset-0 -z-10" onClick={handleClose} />
    </div>
  );
}
