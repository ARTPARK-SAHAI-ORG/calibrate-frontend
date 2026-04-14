"use client";

import React from "react";
import { CloseIcon, SpinnerIcon } from "@/components/icons";
import { Button } from "./Button";
import { useHideFloatingButton } from "@/components/AppLayout";

type SlidePanelProps = {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
  isLoading?: boolean;
  error?: string | null;
  footer?: React.ReactNode;
  width?: string;
};

export function SlidePanel({
  isOpen,
  onClose,
  title,
  icon,
  children,
  isLoading = false,
  error,
  footer,
  width = "w-[40%] min-w-[500px]",
}: SlidePanelProps) {
  // Hide the floating "Talk to Us" button when this panel is open
  useHideFloatingButton(isOpen);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Panel */}
      <div
        className={`relative ${width} bg-background border-l border-border flex flex-col h-full shadow-2xl`}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            {icon && (
              <span className="text-muted-foreground">{icon}</span>
            )}
            <h2 className="text-lg font-semibold">{title}</h2>
          </div>
          <button
            onClick={onClose}
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer"
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <SpinnerIcon className="w-6 h-6 animate-spin" />
            </div>
          ) : (
            children
          )}
        </div>

        {/* Footer */}
        {footer && (
          <div className="px-6 py-4 border-t border-border space-y-3">
            {error && <p className="text-sm text-red-500">{error}</p>}
            {footer}
          </div>
        )}
      </div>
    </div>
  );
}

// Common footer pattern for CRUD forms
type SlidePanelFooterProps = {
  onCancel: () => void;
  onSubmit: () => void;
  isSubmitting?: boolean;
  isLoading?: boolean;
  submitText?: string;
  submittingText?: string;
  cancelText?: string;
};

export function SlidePanelFooter({
  onCancel,
  onSubmit,
  isSubmitting = false,
  isLoading = false,
  submitText = "Save",
  submittingText = "Saving...",
  cancelText = "Cancel",
}: SlidePanelFooterProps) {
  return (
    <div className="flex items-center justify-end gap-3">
      <Button
        variant="secondary"
        onClick={onCancel}
        disabled={isSubmitting || isLoading}
      >
        {cancelText}
      </Button>
      <Button
        variant="primary"
        onClick={onSubmit}
        disabled={isSubmitting || isLoading}
        isLoading={isSubmitting}
        loadingText={submittingText}
      >
        {submitText}
      </Button>
    </div>
  );
}
