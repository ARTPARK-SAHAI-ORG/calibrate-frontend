"use client";

import { useEffect, useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";

type CreateWorkspaceDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onCreate: (name: string) => Promise<void>;
};

export function CreateWorkspaceDialog({
  isOpen,
  onClose,
  onCreate,
}: CreateWorkspaceDialogProps) {
  useHideFloatingButton(isOpen);

  const [name, setName] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setName("");
      setError(null);
      setIsSubmitting(false);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || isSubmitting) return;
    setIsSubmitting(true);
    setError(null);
    try {
      await onCreate(trimmed);
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create workspace",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <form
        onSubmit={handleSubmit}
        className="bg-background rounded-xl w-full max-w-md p-5 md:p-6 shadow-2xl"
      >
        <h2 className="text-base md:text-lg font-semibold text-foreground mb-2">
          Create workspace
        </h2>
        <p className="text-sm text-muted-foreground mb-4">
          Workspaces let you collaborate with teammates on a shared set of
          agents, tests, and simulations.
        </p>

        <label className="block text-sm font-medium text-foreground mb-1.5">
          Name
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Acme Health"
          autoFocus
          disabled={isSubmitting}
          className="w-full h-10 px-3 rounded-md border border-border bg-background text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-foreground/10 disabled:opacity-50"
        />

        {error && (
          <p className="mt-3 text-sm text-red-600 dark:text-red-400">{error}</p>
        )}

        <div className="mt-5 flex items-center justify-end gap-2 md:gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isSubmitting || !name.trim()}
            className="h-9 md:h-10 px-4 rounded-md text-xs md:text-sm font-medium bg-foreground text-background hover:opacity-90 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {isSubmitting && (
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
            {isSubmitting ? "Creating..." : "Create workspace"}
          </button>
        </div>
      </form>

      <div className="absolute inset-0 -z-10" onClick={onClose} />
    </div>
  );
}
