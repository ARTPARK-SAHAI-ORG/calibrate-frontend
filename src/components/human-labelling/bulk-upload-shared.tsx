"use client";

import React from "react";

// ─── Shared types ─────────────────────────────────────────────────────────

export type TurnObject = {
  role: string;
  content?: unknown;
  tool_calls?: unknown;
  [key: string]: unknown;
};

// ─── Shared helpers ───────────────────────────────────────────────────────

export function parseApiError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const m = err.message.match(/Request failed: \d+ - (.+)$/);
  if (m) {
    try {
      const parsed = JSON.parse(m[1]);
      if (parsed && typeof parsed.detail === "string") return parsed.detail;
    } catch {
      // not JSON — fall through to the captured message
    }
    return m[1];
  }
  return err.message || fallback;
}

// Match `headers` against a list of canonical/alias names case-insensitively
// and ignoring whitespace differences. Returns the original header string
// (so the caller can index into Papa's parsed row dict) or null.
export function findHeaderKey(
  headers: string[],
  candidates: string[],
): string | null {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "_");
  const normalized = headers.map(norm);
  for (const cand of candidates) {
    const idx = normalized.indexOf(cand);
    if (idx >= 0) return headers[idx];
  }
  return null;
}

// Coerce a turn's `content` to a string for preview purposes.
export function turnContentString(t: TurnObject): string {
  if (typeof t.content === "string") return t.content;
  if (t.content === undefined || t.content === null) return "";
  try {
    return JSON.stringify(t.content);
  } catch {
    return String(t.content);
  }
}

export function roleLabel(role: string): string {
  if (role === "user") return "User";
  if (role === "assistant") return "AI";
  if (role === "system") return "System";
  if (role === "tool") return "Tool";
  return role;
}

// Tailwind classes for the colored role pill rendered next to each turn.
export function rolePillClass(role: string): string {
  if (role === "user") {
    return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20";
  }
  if (role === "assistant") {
    return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20";
  }
  if (role === "system") {
    return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20";
  }
  if (role === "tool") {
    return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20";
  }
  return "bg-muted text-muted-foreground border border-border";
}

// ─── Shared sub-components ────────────────────────────────────────────────

type CsvDropzoneProps = {
  csvFile: File | null;
  onFile: (file: File | null) => void;
  onClear: () => void;
  // Optional helper text shown below the prompt when no file is selected.
  helperText?: string;
};

// Drop-or-click zone for picking a single CSV. Renders the chosen file
// with a clear button when one is selected; emits null/`File` through
// `onFile`.
export function CsvDropzone({
  csvFile,
  onFile,
  onClear,
  helperText = "Up to a few thousand rows is fine",
}: CsvDropzoneProps) {
  const inputRef = React.useRef<HTMLInputElement>(null);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) onFile(f);
  };
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
        csvFile
          ? "border-foreground/30 bg-muted/30"
          : "border-border hover:border-muted-foreground"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".csv,text/csv"
        onChange={(e) => onFile(e.target.files?.[0] || null)}
        className="hidden"
      />
      {csvFile ? (
        <div className="flex items-center justify-center gap-2">
          <svg
            className="w-5 h-5 text-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
            />
          </svg>
          <span className="text-sm font-medium text-foreground">
            {csvFile.name}
          </span>
          <button
            onClick={(e) => {
              e.stopPropagation();
              if (inputRef.current) inputRef.current.value = "";
              onClear();
            }}
            aria-label="Remove file"
            className="ml-1 text-muted-foreground hover:text-foreground"
          >
            <svg
              className="w-4 h-4"
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
      ) : (
        <>
          <svg
            className="w-8 h-8 text-muted-foreground mx-auto mb-2"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
            />
          </svg>
          <p className="text-sm text-foreground font-medium">
            Drop a CSV here or click to browse
          </p>
          <p className="text-xs text-muted-foreground mt-1">{helperText}</p>
        </>
      )}
    </div>
  );
}

// Small "Show / Hide CSV format details" disclosure used after a CSV has
// parsed to get the help block out of the way.
export function FormatHelpToggle({
  open,
  onToggle,
}: {
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
      aria-expanded={open}
    >
      <svg
        className={`w-3.5 h-3.5 transition-transform ${
          open ? "rotate-90" : ""
        }`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2.5}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M8.25 4.5l7.5 7.5-7.5 7.5"
        />
      </svg>
      {open ? "Hide CSV format details" : "Show CSV format details"}
    </button>
  );
}
