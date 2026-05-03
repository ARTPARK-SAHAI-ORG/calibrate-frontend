"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { jsPDF } from "jspdf";
import { useHideFloatingButton } from "@/components/AppLayout";
import { SingleSelectPicker } from "@/components/SingleSelectPicker";
import { apiClient } from "@/lib/api";

// ─── Shared types ─────────────────────────────────────────────────────────

export type TurnObject = {
  role: string;
  content?: unknown;
  tool_calls?: unknown;
  [key: string]: unknown;
};

// Minimal evaluator description used by the bulk upload dialogs to render
// per-evaluator value/reasoning columns in the helper text and sample CSV
// (when the user opts into pre-filling annotations).
export type EvaluatorMeta = {
  uuid: string;
  name: string;
  output_type: "binary" | "rating" | null;
  scale_min: number | null;
  scale_max: number | null;
};

export type Annotator = { uuid: string; name: string };

// Per-evaluator annotation parsed from a CSV row. Reasoning is always a
// string (empty string when no reasoning column / cell). The value field
// holds either a boolean (binary evaluators) or a number (rating).
export type ParsedAnnotation = {
  evaluator_uuid: string;
  output_type: "binary" | "rating";
  value: boolean | number;
  reasoning: string;
};

// Per-evaluator annotation payload as the backend expects it for a single
// item: an object keyed by evaluator UUID. The shape is uniform across
// every output_type — `{ value, reasoning }` — and the bulk endpoint
// rejects any other key (e.g. `pass`) with 400.
export type ItemAnnotationsPayload = Record<
  string,
  { value: boolean | number; reasoning: string }
>;

// Build the per-item annotations payload from parsed cells. Returns
// `undefined` when no evaluator cells were filled in for the row, so the
// caller can omit `annotations` for that item entirely.
export function buildItemAnnotationsPayload(
  parsed: ParsedAnnotation[],
): ItemAnnotationsPayload | undefined {
  if (parsed.length === 0) return undefined;
  const out: ItemAnnotationsPayload = {};
  for (const a of parsed) {
    out[a.evaluator_uuid] = {
      value: a.value,
      reasoning: a.reasoning,
    };
  }
  return out;
}

// CSV column header for an evaluator's value column. We namespace under
// `<evalName>/value` (not just `<evalName>`) so the header can't collide
// with reserved item columns like `name`, `agent_response`, or
// `conversation_history`.
export function evaluatorValueColumn(evalName: string): string {
  return `${evalName}/value`;
}

// CSV column header for an evaluator's reasoning column.
export function evaluatorReasoningColumn(evalName: string): string {
  return `${evalName}/reasoning`;
}

// Returns the names that appear more than once in `evaluators`, so the
// caller can refuse to render the annotation flow when two linked
// evaluators share a name (which would produce duplicate CSV headers
// that PapaParse silently overwrites). Empty list = safe to proceed.
export function duplicateEvaluatorNames(
  evaluators: { name: string }[],
): string[] {
  const seen = new Map<string, number>();
  for (const e of evaluators) {
    seen.set(e.name, (seen.get(e.name) ?? 0) + 1);
  }
  return Array.from(seen.entries())
    .filter(([, n]) => n > 1)
    .map(([name]) => name);
}

// Sample value to render in the sample CSV's evaluator value column.
// Binary → "true"; rating → midpoint of [min,max] (rounded).
export function sampleEvaluatorValue(e: EvaluatorMeta): string {
  if (e.output_type === "binary") return "true";
  if (
    e.output_type === "rating" &&
    typeof e.scale_min === "number" &&
    typeof e.scale_max === "number"
  ) {
    const mid = Math.round((e.scale_min + e.scale_max) / 2);
    return String(mid);
  }
  return "";
}

// Parse an annotation cell value against the evaluator's output type. Returns
// the typed value or an error message.
export function parseAnnotationCell(
  raw: string,
  e: EvaluatorMeta,
): { value: boolean | number } | { error: string } {
  const trimmed = raw.trim();
  if (e.output_type === "binary") {
    const lower = trimmed.toLowerCase();
    if (["true", "pass", "1", "yes"].includes(lower)) return { value: true };
    if (["false", "fail", "0", "no"].includes(lower)) return { value: false };
    return {
      error: `expected "true"/"pass" or "false"/"fail" for binary evaluator "${e.name}"`,
    };
  }
  if (e.output_type === "rating") {
    const num = Number(trimmed);
    if (!Number.isFinite(num)) {
      return {
        error: `expected a number for rating evaluator "${e.name}"`,
      };
    }
    if (
      typeof e.scale_min === "number" &&
      typeof e.scale_max === "number" &&
      (num < e.scale_min || num > e.scale_max)
    ) {
      return {
        error: `value ${num} is outside the ${e.scale_min}–${e.scale_max} range for "${e.name}"`,
      };
    }
    return { value: num };
  }
  return { error: `unsupported evaluator type for "${e.name}"` };
}

// ─── Annotator picker ─────────────────────────────────────────────────────

// Loads annotators from the backend; surfaces a loading / empty / error
// state. Returns helpers for use inside a bulk-upload dialog.
export function useAnnotators(
  isOpen: boolean,
  accessToken: string,
): {
  annotators: Annotator[];
  loading: boolean;
  error: string | null;
} {
  const [annotators, setAnnotators] = useState<Annotator[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen || !accessToken) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const data = await apiClient<Annotator[]>("/annotators", accessToken);
        if (!cancelled) setAnnotators(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled)
          setError(parseApiError(err, "Failed to load annotators"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOpen, accessToken]);

  return { annotators, loading, error };
}

type AnnotationOptInProps = {
  annotators: Annotator[];
  loading: boolean;
  error: string | null;
  uploadAnnotations: boolean;
  onToggle: (next: boolean) => void;
  selectedAnnotatorId: string | null;
  onSelectAnnotator: (uuid: string | null) => void;
};

// Renders the "Upload annotations too?" yes/no choice and, when yes,
// either a single-select annotator picker, an empty state with a link to
// add annotators, or load/error feedback. Used at the top of every bulk
// upload items dialog when the parent task has linked evaluators.
export function AnnotationOptIn({
  annotators,
  loading,
  error,
  uploadAnnotations,
  onToggle,
  selectedAnnotatorId,
  onSelectAnnotator,
}: AnnotationOptInProps) {
  return (
    <div className="space-y-3">
      <div>
        <label className="block text-sm font-medium text-foreground mb-2">
          Do you want to upload existing human labels?
        </label>

        <div className="flex rounded-lg border border-border overflow-hidden w-fit">
          <button
            type="button"
            onClick={() => onToggle(false)}
            className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer ${
              !uploadAnnotations
                ? "bg-foreground text-background"
                : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            No
          </button>
          <button
            type="button"
            onClick={() => onToggle(true)}
            className={`px-4 py-2 text-sm font-medium transition-colors cursor-pointer border-l border-border ${
              uploadAnnotations
                ? "bg-foreground text-background"
                : "bg-background text-muted-foreground hover:text-foreground hover:bg-muted"
            }`}
          >
            Yes
          </button>
        </div>
      </div>

      {uploadAnnotations && (
        <div>
          <label className="block text-sm font-medium text-foreground mb-2">
            Select annotator
          </label>
          {loading ? (
            <p className="text-xs text-muted-foreground">Loading annotators…</p>
          ) : error ? (
            <p className="text-xs text-red-500">{error}</p>
          ) : annotators.length === 0 ? (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-foreground">
              No annotators exist yet.{" "}
              <Link
                href="/human-labelling?tab=annotators"
                className="underline underline-offset-2 hover:opacity-80 transition-opacity"
              >
                Add an annotator
              </Link>{" "}
              to your account first.
            </div>
          ) : (
            <SingleSelectPicker<Annotator>
              items={annotators}
              selectedId={selectedAnnotatorId}
              onSelect={(a) => onSelectAnnotator(a.uuid)}
              getId={(a) => a.uuid}
              ariaLabel="Select annotator"
              placeholder="Select an annotator"
              className="w-full"
              matchesSearch={(a, q) =>
                a.name.toLowerCase().includes(q.toLowerCase())
              }
              searchPlaceholder="Search annotators"
              renderTrigger={(a) => (
                <span className="text-sm text-foreground">
                  {a ? a.name : "Select an annotator"}
                </span>
              )}
              renderOption={(a) => (
                <span className="text-sm text-foreground">{a.name}</span>
              )}
            />
          )}
        </div>
      )}
    </div>
  );
}

// Helper text bullet list describing the evaluator value and reasoning
// columns that appear when the user opts into uploading annotations.
export function EvaluatorAnnotationColumnsHelp({
  evaluators,
}: {
  evaluators: EvaluatorMeta[];
}) {
  return (
    <>
      {evaluators.map((e) => {
        const range =
          e.output_type === "binary"
            ? "true/false"
            : e.output_type === "rating" &&
                typeof e.scale_min === "number" &&
                typeof e.scale_max === "number"
              ? `any value between ${e.scale_min}-${e.scale_max}`
              : "value";
        const pill = (
          <Link
            href={`/evaluators/${e.uuid}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-accent text-accent-foreground text-[10px] font-medium hover:opacity-80 transition-opacity cursor-pointer"
          >
            {e.name}
          </Link>
        );
        return (
          <React.Fragment key={e.uuid}>
            <li>
              <code className="font-mono text-foreground">
                {evaluatorValueColumn(e.name)}
              </code>{" "}
              — value for {pill} evaluator ({range})
            </li>
            <li>
              <code className="font-mono text-foreground">
                {evaluatorReasoningColumn(e.name)}
              </code>{" "}
              — (optional) reasoning for the value assigned to the {pill}{" "}
              evaluator
            </li>
          </React.Fragment>
        );
      })}
    </>
  );
}

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
export function ConversationFormatDetails({ example }: { example: string }) {
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
              <code className="font-mono text-foreground">
                &quot;user&quot;
              </code>{" "}
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

// ─── Guidelines PDF ───────────────────────────────────────────────────────

// Structured representation of CSV format guidelines that we render to a
// nicely-formatted PDF for download. Each column documents one CSV column;
// `fields` describes nested object fields (used for tool_calls).
export type GuidelineField = {
  name: string;
  meta?: string;
  description: string;
  example?: string;
};

export type GuidelineColumn = {
  name: string;
  description: string;
  example?: string;
  fields?: GuidelineField[];
  trailingExamples?: { label: string; example: string }[];
};

export type GuidelineDoc = {
  title: string;
  intro?: string;
  columns: GuidelineColumn[];
};

export function generateGuidelinesPdf(doc: GuidelineDoc): Blob {
  const pdf = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = pdf.internal.pageSize.getWidth();
  const pageH = pdf.internal.pageSize.getHeight();
  const M = 56;
  const textW = pageW - 2 * M;
  let y = M;

  const ensure = (needed: number) => {
    if (y + needed > pageH - M) {
      pdf.addPage();
      y = M;
    }
  };

  const writeText = (
    text: string,
    opts: {
      size?: number;
      style?: "normal" | "bold" | "italic";
      font?: "helvetica" | "courier";
      color?: [number, number, number];
      indent?: number;
      lineGap?: number;
    } = {},
  ) => {
    const size = opts.size ?? 11;
    const style = opts.style ?? "normal";
    const font = opts.font ?? "helvetica";
    const indent = opts.indent ?? 0;
    const lineH = size * 1.35;
    pdf.setFont(font, style);
    pdf.setFontSize(size);
    pdf.setTextColor(...(opts.color ?? [30, 30, 30]));
    const lines = pdf.splitTextToSize(text, textW - indent);
    for (const line of lines) {
      ensure(lineH);
      pdf.text(line, M + indent, y + size);
      y += lineH;
    }
    if (opts.lineGap) y += opts.lineGap;
  };

  const writeCodeBlock = (code: string, indent = 0) => {
    const size = 9;
    const lineH = size * 1.4;
    pdf.setFont("courier", "normal");
    pdf.setFontSize(size);
    // Split on hard newlines first so we preserve the author's line breaks
    // and indentation, then word-wrap each segment to the block width.
    const wrapW = textW - indent - 16;
    const lines: string[] = [];
    for (const raw of code.split("\n")) {
      const wrapped = pdf.splitTextToSize(raw, wrapW) as string[];
      if (wrapped.length === 0) lines.push("");
      else lines.push(...wrapped);
    }
    const padY = 6;
    const blockH = lines.length * lineH + padY * 2;
    ensure(blockH + 4);
    pdf.setFillColor(245, 246, 248);
    pdf.setDrawColor(225, 228, 232);
    pdf.roundedRect(M + indent, y, textW - indent, blockH, 4, 4, "FD");
    pdf.setTextColor(40, 50, 70);
    let yy = y + padY;
    for (const line of lines) {
      pdf.text(line, M + indent + 8, yy + size);
      yy += lineH;
    }
    y += blockH + 8;
  };

  // Title
  writeText(doc.title, { size: 22, style: "bold", color: [20, 20, 20] });
  // Underline accent
  pdf.setDrawColor(220, 224, 230);
  pdf.setLineWidth(0.8);
  pdf.line(M, y + 2, M + textW, y + 2);
  y += 14;

  if (doc.intro) {
    writeText(doc.intro, { size: 11, color: [70, 75, 85], lineGap: 6 });
  }

  for (const col of doc.columns) {
    ensure(40);
    writeText(col.name, {
      size: 13,
      style: "bold",
      font: "courier",
      color: [20, 35, 90],
      lineGap: 2,
    });
    writeText(col.description, {
      size: 11,
      color: [40, 45, 55],
      indent: 12,
      lineGap: 4,
    });
    if (col.example) {
      writeCodeBlock(col.example, 12);
    }
    if (col.fields) {
      for (const f of col.fields) {
        ensure(30);
        const header = f.meta ? `${f.name}  ${f.meta}` : f.name;
        writeText(header, {
          size: 11,
          style: "bold",
          font: "courier",
          color: [60, 60, 80],
          indent: 12,
          lineGap: 1,
        });
        writeText(f.description, {
          size: 10.5,
          color: [55, 60, 70],
          indent: 24,
          lineGap: 3,
        });
        if (f.example) {
          writeCodeBlock(f.example, 24);
        }
      }
    }
    if (col.trailingExamples) {
      for (const ex of col.trailingExamples) {
        ensure(30);
        writeText(ex.label, {
          size: 10.5,
          style: "italic",
          color: [80, 85, 95],
          indent: 12,
          lineGap: 1,
        });
        writeCodeBlock(ex.example, 12);
      }
    }
    y += 6;
  }

  return pdf.output("blob");
}

function downloadBlob(blob: Blob, filename: string): void {
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
  sampleFilename: string | (() => string);
  // Structured CSV format guidelines, rendered to a styled PDF for the
  // "Download CSV format guidelines" button.
  buildGuidelines: () => GuidelineDoc;
  guidelinesFilename?: string | (() => string);
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
  // Optional content rendered above the CSV upload section. Used by the
  // labelling-task dialogs to ask the user up-front whether they want to
  // also pre-fill annotations and to pick the annotator.
  topContent?: React.ReactNode;
  // When set, blocks the Upload button. Used together with topContent to
  // gate uploads on incomplete top-level prerequisites (e.g. annotator not
  // yet picked).
  uploadBlocked?: boolean;
  // When set, hides the entire CSV upload section (guidelines, dropzone,
  // tip, items preview, footer Upload button). Used to keep the dialog
  // focused on a top-level prerequisite — e.g. picking an annotator —
  // before exposing the rest of the flow.
  hideUploadSection?: boolean;
};

export function BulkUploadDialogShell({
  isOpen,
  title,
  buildSampleCsv,
  sampleFilename,
  buildGuidelines,
  guidelinesFilename = "csv_format_guidelines.pdf",
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
  topContent,
  uploadBlocked,
  hideUploadSection,
}: BulkUploadDialogShellProps) {
  useHideFloatingButton(isOpen);

  if (!isOpen) return null;

  const downloadSample = () =>
    downloadCsvBlob(
      buildSampleCsv(),
      typeof sampleFilename === "function" ? sampleFilename() : sampleFilename,
    );

  const downloadGuidelines = () =>
    downloadBlob(
      generateGuidelinesPdf(buildGuidelines()),
      typeof guidelinesFilename === "function"
        ? guidelinesFilename()
        : guidelinesFilename,
    );

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
          itemCount > 0 ? "md:max-w-[70vw]" : "md:max-w-[37.5vw]"
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
          {topContent}
          {!hideUploadSection && (
          <div>
            {itemCount === 0 && (
              <div className="mb-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={downloadGuidelines}
                  className="h-9 px-3 rounded-md text-xs font-semibold border border-blue-500/40 bg-blue-500/15 text-blue-700 dark:text-blue-300 hover:bg-blue-500/25 hover:border-blue-500/60 transition-colors cursor-pointer flex items-center gap-1.5"
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
                  Download CSV format guidelines
                </button>
              </div>
            )}

            <CsvDropzone csvFile={csvFile} onFile={onFile} onClear={onClear} />

            {itemCount === 0 && (
              <div className="mt-3 flex items-start gap-2 rounded-md border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-foreground">
                <svg
                  className="w-4 h-4 mt-0.5 shrink-0 text-emerald-500"
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
                    className="underline underline-offset-2 font-semibold text-emerald-700 dark:text-emerald-300 hover:opacity-80 transition-opacity cursor-pointer"
                  >
                    download the sample CSV
                  </button>{" "}
                  and edit it as a starting point
                </span>
              </div>
            )}

            {parseError && (
              <p className="text-xs text-red-500 mt-3">{parseError}</p>
            )}
          </div>
          )}

          {!hideUploadSection && itemCount > 0 && itemsPreview}

          {!hideUploadSection && uploadError && (
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
          {!hideUploadSection && (
          <button
            onClick={onUpload}
            disabled={
              itemCount === 0 || isUploading || !!parseError || !!uploadBlocked
            }
            className="h-10 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading
              ? "Uploading"
              : itemCount > 1
                ? `Upload ${itemCount} items`
                : "Upload item"}
          </button>
          )}
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
