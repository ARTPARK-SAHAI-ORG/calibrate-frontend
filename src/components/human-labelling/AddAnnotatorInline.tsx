"use client";

import { FormEvent, useState } from "react";
import { apiClient } from "@/lib/api";

export type NewAnnotator = { uuid: string; name: string };

// Same shape as the copies in the other labelling dialogs — kept local so this
// component doesn't pull in the heavy bulk-upload module.
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

type AddAnnotatorInlineProps = {
  accessToken: string;
  disabled?: boolean;
  /** Called with the created annotator once the backend confirms it. */
  onAdded: (annotator: NewAnnotator) => void;
};

/**
 * Name input plus an Add button that creates an annotator without leaving the
 * current dialog. Used wherever a flow would otherwise send the user to the
 * annotators tab.
 */
export function AddAnnotatorInline({
  accessToken,
  disabled = false,
  onAdded,
}: AddAnnotatorInlineProps) {
  const [name, setName] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim();
    if (!trimmed || adding || disabled) return;
    setAdding(true);
    setError(null);
    try {
      const { uuid } = await apiClient<{ uuid: string; message: string }>(
        "/annotators",
        accessToken,
        { method: "POST", body: { name: trimmed } },
      );
      onAdded({ uuid, name: trimmed });
      setName("");
    } catch (err) {
      setError(parseApiError(err, "Failed to add annotator"));
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="space-y-2">
      <form onSubmit={handleSubmit} className="flex gap-2">
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (error) setError(null);
          }}
          placeholder="New annotator name"
          aria-label="New annotator name"
          disabled={adding || disabled}
          className={`flex-1 min-w-0 h-9 px-3 rounded-md text-sm border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed ${
            error ? "border-red-500" : "border-border"
          }`}
        />
        <button
          type="submit"
          disabled={!name.trim() || adding || disabled}
          className="h-9 px-4 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {adding ? "Adding..." : "Add"}
        </button>
      </form>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
