"use client";

import { useEffect } from "react";

/**
 * Escape-to-close plus arrow-key previous/next for a full-screen detail
 * dialog (the trace dialog, the labelling item dialog). Skips the arrow keys
 * while focus is in a text field, so typing a hyphen or arrow-navigating text
 * doesn't also step the dialog.
 */
export function useDialogNavKeys({
  isOpen,
  onClose,
  hasPrev,
  onPrev,
  hasNext,
  onNext,
}: {
  isOpen: boolean;
  onClose: () => void;
  hasPrev?: boolean;
  onPrev?: () => void;
  hasNext?: boolean;
  onNext?: () => void;
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }
      if (e.key === "ArrowLeft" && hasPrev && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowRight" && hasNext && onNext) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose, hasPrev, hasNext, onPrev, onNext]);
}
