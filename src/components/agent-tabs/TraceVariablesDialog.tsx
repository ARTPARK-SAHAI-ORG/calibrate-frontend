"use client";

import React, { useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { Select } from "@/components/ui/Select";
import type { EvaluatorData } from "@/lib/evaluatorApi";

const METADATA = "metadata.";

const TRACE_SOURCES = [
  { value: "input", label: "Input" },
  { value: "output.response", label: "Agent reply" },
  { value: "output.tool_calls", label: "Tool calls" },
  { value: METADATA, label: "Metadata" },
  { value: "labels", label: "Labels" },
  { value: "conversation_id", label: "Conversation ID" },
  { value: "message_id", label: "Message ID" },
];

const isMetadata = (value: string) => value.startsWith(METADATA);
const metadataKey = (value: string) => value.slice(METADATA.length).trim();

type TraceVariablesDialogProps = {
  evaluator: EvaluatorData;
  onClose: () => void;
  /** Parent does the saving + refresh; we just hand back the whole map. */
  onSave: (traceVariables: Record<string, string>) => Promise<void>;
};

/** Mounted only while open, so every open starts from `evaluator`. */
export function TraceVariablesDialog({
  evaluator,
  onClose,
  onSave,
}: TraceVariablesDialogProps) {
  // Hide the floating "Talk to Us" button while the modal is open.
  useHideFloatingButton(true);

  const variables = evaluator.live_version?.variables ?? [];
  // A Metadata row holds "metadata." plus whatever key has been typed so far.
  const [values, setValues] = useState<Record<string, string>>(
    evaluator.trace_variables ?? {},
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setValue = (name: string, value: string) =>
    setValues((prev) => ({ ...prev, [name]: value }));

  const hasEmptyMetadataKey = variables.some((variable) => {
    const value = values[variable.name] ?? "";
    return isMetadata(value) && !metadataKey(value);
  });

  const handleClose = () => {
    if (!saving) onClose();
  };

  const handleSave = async () => {
    const traceVariables: Record<string, string> = {};
    for (const { name } of variables) {
      const value = values[name];
      if (value) {
        traceVariables[name] = isMetadata(value)
          ? METADATA + metadataKey(value)
          : value;
      }
    }
    try {
      setSaving(true);
      setError(null);
      await onSave(traceVariables);
      onClose();
    } catch (err) {
      // Keep the dialog open and surface the failure instead of closing as if
      // the save succeeded.
      setError(
        err instanceof Error ? err.message : "Failed to save trace values",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={handleClose}
    >
      <div
        className="bg-background border border-border rounded-xl w-full max-w-md shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 md:px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-foreground">
              Choose trace values
            </h2>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              Choose which part of each trace fills each variable in this
              evaluator
            </p>
          </div>
          <button
            onClick={handleClose}
            disabled={saving}
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Close"
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

        {/* Body */}
        <div className="flex-1 min-h-0 overflow-y-auto p-4 md:p-6 space-y-4">
          {variables.map(({ name }) => {
            const value = values[name] ?? "";
            return (
              <div key={name} className="space-y-2">
                <label
                  htmlFor={`trace-variable-${name}`}
                  className="block text-sm font-medium font-mono text-foreground break-all"
                >
                  {`{{${name}}}`}
                </label>
                <Select
                  id={`trace-variable-${name}`}
                  value={isMetadata(value) ? METADATA : value}
                  onChange={(e) => setValue(name, e.target.value)}
                  disabled={saving}
                  className="cursor-pointer"
                >
                  <option value="">Not set</option>
                  {TRACE_SOURCES.map((source) => (
                    <option key={source.value} value={source.value}>
                      {source.label}
                    </option>
                  ))}
                </Select>
                {isMetadata(value) && (
                  <input
                    type="text"
                    aria-label={`Metadata key for ${name}`}
                    value={value.slice(METADATA.length)}
                    onChange={(e) =>
                      setValue(name, METADATA + e.target.value)
                    }
                    disabled={saving}
                    placeholder="Metadata key, for example expert_answer"
                    className="w-full h-10 px-3 rounded-md text-sm border border-border bg-background focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                  />
                )}
              </div>
            );
          })}
          <p className="text-xs text-muted-foreground">
            Applies to new traces. A trace missing one of these values is not
            scored by this evaluator.
          </p>
        </div>

        {/* Footer */}
        <div className="flex flex-col gap-2 px-5 md:px-6 py-4 border-t border-border">
          {error && (
            <p
              role="alert"
              className="text-sm text-red-600 dark:text-red-400 text-right"
            >
              {error}
            </p>
          )}
          <div className="flex items-center justify-end gap-2 md:gap-3">
            <button
              onClick={handleClose}
              disabled={saving}
              className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium border border-border bg-background dark:bg-muted hover:bg-muted/50 dark:hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || hasEmptyMetadataKey}
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
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
              )}
              {saving ? "Saving..." : "Save"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
