"use client";

import { ConfirmDialog } from "@/components/ui";

type Props = {
  /** What the click is asking for, or null when nothing has been clicked. */
  pending: boolean | null;
  onClose: () => void;
  onConfirm: (next: boolean) => void;
};

/**
 * The question asked before continuous monitoring is turned on or off. Both
 * places that switch it, the pill above the table and the Settings tab, ask it
 * in the same words.
 */
export function TraceScoringConfirmDialog({
  pending,
  onClose,
  onConfirm,
}: Props) {
  return (
    <ConfirmDialog
      isOpen={pending !== null}
      onClose={onClose}
      onConfirm={() => {
        onClose();
        if (pending !== null) onConfirm(pending);
      }}
      title={
        pending
          ? "Turn on continuous monitoring"
          : "Turn off continuous monitoring"
      }
      message={
        pending
          ? "All new traces will be scored using your evaluators. Existing traces won't be scored."
          : "New traces will not be scored. Traces with existing scores won't be affected."
      }
      confirmText={pending ? "Turn on" : "Turn off"}
    />
  );
}
