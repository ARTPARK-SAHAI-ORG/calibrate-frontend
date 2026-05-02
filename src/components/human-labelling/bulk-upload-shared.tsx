"use client";

import React, { useEffect, useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";

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
      className={`border-2 border-dashed rounded-xl text-center transition-colors cursor-pointer ${
        csvFile
          ? "border-foreground/30 bg-muted/30 py-3 px-4"
          : "border-border hover:border-muted-foreground p-8"
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

// Vertical preview of a conversation/transcript: each turn rendered as a
// "Role" pill above its content. Sized so ~2 turns are visible at once;
// anything beyond that scrolls inside the cell. Shared across the bulk
// upload dialogs so chat history rendering is identical everywhere.
export function ChatHistoryPreview({ turns }: { turns: TurnObject[] }) {
  return (
    <div className="max-h-24 overflow-y-auto pr-1 space-y-2">
      {turns.map((t, i) => {
        const role = typeof t.role === "string" ? t.role : "?";
        const content = turnContentString(t);
        return (
          <div key={`h-${i}`} className="space-y-1 leading-snug">
            <span
              className={`inline-flex items-center text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded ${rolePillClass(role)}`}
            >
              {roleLabel(role)}
            </span>
            <div className="text-foreground break-words whitespace-pre-wrap">
              {content || (
                <span className="text-muted-foreground italic">
                  (no content)
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// "View more" toggle that reveals the role/content schema and a
// copy-pasteable example for a conversation column. Reused across every
// bulk-upload dialog that takes a conversation/transcript JSON column so
// the explanation stays consistent and out of the way until the user
// asks for it.
export function ConversationFormatDetails({
  example,
}: {
  example: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
        aria-expanded={open}
      >
        <svg
          className={`w-3 h-3 transition-transform ${open ? "rotate-90" : ""}`}
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
        {open ? "View less" : "View more"}
      </button>
      {open && (
        <>
          <div className="mt-1.5">Each turn must have:</div>
          <ul className="list-disc pl-5 mt-1 space-y-0.5">
            <li>
              <code className="font-mono text-foreground">role</code> — either{" "}
              <code className="font-mono text-foreground">&quot;user&quot;</code>{" "}
              or{" "}
              <code className="font-mono text-foreground">
                &quot;assistant&quot;
              </code>
            </li>
            <li>
              <code className="font-mono text-foreground">content</code> — the
              actual message said by that role
            </li>
          </ul>
          <div className="mt-1.5">
            Example:{" "}
            <code className="font-mono text-foreground break-all">
              {example}
            </code>
          </div>
        </>
      )}
    </div>
  );
}

// Trigger a CSV download from a string. Used by the dialog shell for the
// "Download sample CSV" button and the inline tip link.
export function downloadCsvBlob(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// Shared shell for the three bulk-upload dialogs (LLM / STT / Simulation).
// Owns the modal chrome, header, footer, dropzone, format-help toggle, tip
// callout, and sample-CSV download wiring. Each dialog supplies its own
// help body, parsing/upload logic, and items preview.
type BulkUploadDialogShellProps = {
  isOpen: boolean;
  title: string;
  buildSampleCsv: () => string;
  sampleFilename: string;
  helpContent: React.ReactNode;
  csvFile: File | null;
  onFile: (file: File | null) => void;
  onClear: () => void;
  parseError: string | null;
  uploadError: string | null;
  isUploading: boolean;
  itemCount: number;
  itemsPreview: React.ReactNode;
  onUpload: () => void;
  onClose: () => void;
};

export function BulkUploadDialogShell({
  isOpen,
  title,
  buildSampleCsv,
  sampleFilename,
  helpContent,
  csvFile,
  onFile,
  onClear,
  parseError,
  uploadError,
  isUploading,
  itemCount,
  itemsPreview,
  onUpload,
  onClose,
}: BulkUploadDialogShellProps) {
  useHideFloatingButton(isOpen);
  const [formatHelpOpen, setFormatHelpOpen] = useState(true);

  // Auto-collapse the help block once a CSV has parsed; re-open if the
  // user clears it.
  useEffect(() => {
    setFormatHelpOpen(itemCount === 0);
  }, [itemCount]);

  if (!isOpen) return null;

  const downloadSample = () =>
    downloadCsvBlob(buildSampleCsv(), sampleFilename);

  const handleClose = () => {
    if (!isUploading) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={handleClose}
    >
      <div
        className={`bg-background border border-border rounded-xl shadow-2xl w-full flex flex-col max-h-[90vh] transition-[max-width] duration-200 ${
          itemCount > 0 ? "max-w-[80vw]" : "max-w-[50vw]"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <button
            onClick={handleClose}
            disabled={isUploading}
            aria-label="Close"
            className="w-8 h-8 flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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

        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block text-sm font-medium text-foreground">
                Upload CSV
              </label>
              <button
                type="button"
                onClick={downloadSample}
                className="h-9 px-3 rounded-md text-xs font-medium border border-border bg-muted/40 text-foreground hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer flex items-center gap-1.5 shadow-sm"
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
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3"
                  />
                </svg>
                Download sample CSV
              </button>
            </div>

            {itemCount > 0 && (
              <FormatHelpToggle
                open={formatHelpOpen}
                onToggle={() => setFormatHelpOpen((o) => !o)}
              />
            )}

            {formatHelpOpen && (
              <div className="text-xs text-muted-foreground mb-3 leading-relaxed space-y-2">
                {helpContent}
              </div>
            )}

            {formatHelpOpen && (
              <div className="mb-3 flex items-start gap-2 rounded-md border border-blue-500/30 bg-blue-500/10 px-3 py-2 text-xs text-foreground">
                <svg
                  className="w-4 h-4 mt-0.5 shrink-0 text-blue-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"
                  />
                </svg>
                <span>
                  <span className="font-semibold">Tip:</span>{" "}
                  <button
                    type="button"
                    onClick={downloadSample}
                    className="underline underline-offset-2 hover:opacity-80 transition-opacity cursor-pointer"
                  >
                    download the sample CSV
                  </button>{" "}
                  and edit it as a starting point
                </span>
              </div>
            )}

            <CsvDropzone csvFile={csvFile} onFile={onFile} onClear={onClear} />

            {parseError && (
              <p className="text-xs text-red-500 mt-3">{parseError}</p>
            )}
          </div>

          {itemCount > 0 && itemsPreview}

          {uploadError && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
              {uploadError}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
          <button
            onClick={handleClose}
            disabled={isUploading}
            className="h-10 px-4 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={onUpload}
            disabled={itemCount === 0 || isUploading || !!parseError}
            className="h-10 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading
              ? "Uploading"
              : itemCount > 1
                ? `Upload ${itemCount} items`
                : "Upload item"}
          </button>
        </div>
      </div>
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
