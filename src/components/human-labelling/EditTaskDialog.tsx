"use client";

import { useEffect, useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { apiClient } from "@/lib/api";

function parseApiError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const match = err.message.match(/Request failed: \d+ - (.+)$/);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && typeof parsed.detail === "string") return parsed.detail;
    } catch {
      // not JSON
    }
    return match[1];
  }
  return err.message || fallback;
}

type EditTaskDialogProps = {
  isOpen: boolean;
  accessToken: string;
  taskUuid: string;
  initialName: string;
  initialDescription: string;
  onClose: () => void;
  onSaved: () => void;
};

export function EditTaskDialog({
  isOpen,
  accessToken,
  taskUuid,
  initialName,
  initialDescription,
  onClose,
  onSaved,
}: EditTaskDialogProps) {
  useHideFloatingButton(isOpen);

  const [name, setName] = useState(initialName);
  const [description, setDescription] = useState(initialDescription);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  // Reset fields whenever the dialog opens for a (potentially) different task.
  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setDescription(initialDescription);
      setError(null);
      setNameError(null);
    }
  }, [isOpen, initialName, initialDescription]);

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!name.trim()) {
      setError("Name is required");
      return;
    }
    setSaving(true);
    setError(null);
    setNameError(null);
    try {
      await apiClient(`/annotation-tasks/${taskUuid}`, accessToken, {
        method: "PUT",
        body: {
          name: name.trim(),
          description: description.trim(),
        },
      });
      onSaved();
    } catch (err) {
      const msg = parseApiError(err, "Failed to save task");
      // Mirror the evaluator-edit pattern: show name conflicts inline.
      if (msg.toLowerCase().includes("already exists")) {
        setNameError(msg);
      } else {
        setError(msg);
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="bg-background border border-border rounded-xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 md:px-6 py-4 border-b border-border">
          <h2 className="text-base md:text-lg font-semibold text-foreground">
            Edit task
          </h2>
          <button
            onClick={() => {
              if (!saving) onClose();
            }}
            disabled={saving}
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 md:px-6 py-4 md:py-5 space-y-4">
          <div>
            <label className="block text-xs md:text-sm font-medium mb-2">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setNameError(null);
                if (error) setError(null);
              }}
              placeholder="Task name"
              className={`w-full h-9 md:h-10 px-3 md:px-4 rounded-md text-sm md:text-base border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent ${
                (!name.trim() && error) || nameError
                  ? "border-red-500"
                  : "border-border"
              }`}
            />
            {nameError && (
              <p className="text-xs md:text-sm text-red-500 mt-1">
                {nameError}
              </p>
            )}
          </div>
          <div>
            <label className="block text-xs md:text-sm font-medium mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description of the labelling task"
              rows={3}
              className="w-full px-3 md:px-4 py-2 rounded-md text-sm md:text-base border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent resize-none"
            />
          </div>
          {error && <p className="text-sm text-red-500">{error}</p>}
        </div>

        <div className="flex items-center justify-end gap-2 md:gap-3 px-5 md:px-6 py-4 border-t border-border">
          <button
            onClick={() => {
              if (!saving) onClose();
            }}
            disabled={saving}
            className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
          >
            {saving && (
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
            Save
          </button>
        </div>
      </div>
    </div>
  );
}
