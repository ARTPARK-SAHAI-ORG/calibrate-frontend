"use client";

import React, { useEffect, useState } from "react";
import { Button } from "./Button";
import { useHideFloatingButton } from "@/components/AppLayout";

type RenameDialogProps = {
  isOpen: boolean;
  /** Heading, e.g. "Rename the dataset". */
  title: string;
  /** The name as it stands. Reset every time the box opens. */
  initialName: string;
  maxLength?: number;
  /**
   * Allow saving an empty box, for a thing that has a name to fall back on
   * when it has none of its own (a run goes back to "Run 3").
   */
  allowEmpty?: boolean;
  onClose: () => void;
  /**
   * Save the new name. Return a message to show under the box when it could
   * not be saved; return nothing and the box closes itself.
   */
  onRename: (name: string) => Promise<string | void>;
};

/** Renames a thing in place: one text box, Cancel and Save. */
export function RenameDialog({
  isOpen,
  title,
  initialName,
  maxLength = 50,
  allowEmpty = false,
  onClose,
  onRename,
}: RenameDialogProps) {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  useHideFloatingButton(isOpen);

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setError(null);
    }
  }, [isOpen, initialName]);

  if (!isOpen) return null;

  const save = async () => {
    const trimmed = name.trim();
    if ((!trimmed && !allowEmpty) || isSaving) return;
    if (trimmed === initialName) {
      onClose();
      return;
    }
    setIsSaving(true);
    setError(null);
    try {
      const message = await onRename(trimmed);
      if (message) setError(message);
      else onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-background border border-border rounded-xl p-5 md:p-6 max-w-md w-full shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base md:text-lg font-semibold mb-3 md:mb-4">
          {title}
        </h2>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") save();
            else if (e.key === "Escape") onClose();
          }}
          aria-label="Name"
          className={`w-full h-9 md:h-10 px-3 rounded-md text-sm border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent ${
            error ? "border-red-500 mb-1" : "border-border mb-4"
          }`}
          maxLength={maxLength}
          autoFocus
        />
        {error && <p className="text-sm text-red-500 mb-4">{error}</p>}
        <div className="flex items-center justify-end gap-2 md:gap-3">
          <Button variant="secondary" size="md" onClick={onClose}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="md"
            onClick={save}
            disabled={!allowEmpty && !name.trim()}
            isLoading={isSaving}
            loadingText="Saving..."
          >
            Save
          </Button>
        </div>
      </div>
    </div>
  );
}
