"use client";

import { useEffect, useState } from "react";
import Papa from "papaparse";
import { useHideFloatingButton } from "@/components/AppLayout";
import { apiClient } from "@/lib/api";
import {
  CsvDropzone,
  FormatHelpToggle,
  type TurnObject,
  findHeaderKey,
  parseApiError,
  roleLabel,
  rolePillClass,
  turnContentString,
} from "./bulk-upload-shared";

const TRANSCRIPT_HEADERS = [
  "transcript",
  "transcript_json",
  "conversation",
  "conversation_history",
];
const NAME_HEADERS = ["name", "title", "simulation_name"];

const SAMPLE_SIMULATION_CSV = `name,transcript
"Card lost - happy path","[{""role"":""assistant"",""content"":""Hi, how can I help?""},{""role"":""user"",""content"":""I lost my card""},{""role"":""assistant"",""content"":""I can help block it. Can you confirm the last 4 digits?""}]"
"Refund flow","[{""role"":""user"",""content"":""I was charged twice""},{""role"":""assistant"",""content"":""I'm sorry to hear that. Let me investigate the duplicate charge for you.""}]"
`;

type ParsedItem = {
  name: string;
  transcript: TurnObject[];
};

type BulkUploadSimulationItemsDialogProps = {
  isOpen: boolean;
  accessToken: string;
  taskUuid: string;
  onClose: () => void;
  onSuccess: (count: number) => void;
};

// Vertical preview of a transcript: each turn rendered as a "Role" label
// above its content. The container is sized so that ~2 turns are visible
// at once; anything beyond that scrolls inside the cell.
function TranscriptPreview({ turns }: { turns: TurnObject[] }) {
  return (
    <div className="max-h-24 overflow-y-auto pr-1 space-y-2">
      {turns.map((t, i) => {
        const role = typeof t.role === "string" ? t.role : "?";
        const content = turnContentString(t);
        return (
          <div key={i} className="space-y-1 leading-snug">
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

export function BulkUploadSimulationItemsDialog({
  isOpen,
  accessToken,
  taskUuid,
  onClose,
  onSuccess,
}: BulkUploadSimulationItemsDialogProps) {
  useHideFloatingButton(isOpen);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [formatHelpOpen, setFormatHelpOpen] = useState(true);

  const reset = () => {
    setCsvFile(null);
    setParsedItems([]);
    setParseError(null);
    setUploadError(null);
    setFormatHelpOpen(true);
  };

  useEffect(() => {
    if (isOpen) reset();
  }, [isOpen]);

  useEffect(() => {
    setFormatHelpOpen(parsedItems.length === 0);
  }, [parsedItems.length]);

  if (!isOpen) return null;

  const downloadSampleCsv = () => {
    const blob = new Blob([SAMPLE_SIMULATION_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sample_simulation_items.csv";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleFile = (file: File | null) => {
    setUploadError(null);
    setParseError(null);
    setParsedItems([]);
    setCsvFile(file);
    if (!file) return;
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        const headers = results.meta.fields ?? [];
        const transcriptKey = findHeaderKey(headers, TRANSCRIPT_HEADERS);
        const nameKey = findHeaderKey(headers, NAME_HEADERS);
        if (!nameKey || !transcriptKey) {
          setParseError(
            `CSV must include "name" and "transcript" columns. Found: ${headers.join(", ") || "(none)"}`,
          );
          return;
        }
        const items: ParsedItem[] = [];
        for (let i = 0; i < results.data.length; i++) {
          const row = results.data[i];
          const raw = (row[transcriptKey] ?? "").trim();
          const name = (row[nameKey] ?? "").trim();
          if (!raw && !name) continue;
          if (!name) {
            setParseError(`Row ${i + 1}: "name" is required.`);
            return;
          }
          if (!raw) {
            setParseError(`Row ${i + 1}: "transcript" is required.`);
            return;
          }
          let parsed: unknown;
          try {
            parsed = JSON.parse(raw);
          } catch {
            setParseError(
              `Row ${i + 1}: "transcript" must be valid JSON. Wrap the JSON in double quotes and escape inner double quotes by doubling them.`,
            );
            return;
          }
          if (!Array.isArray(parsed) || parsed.length === 0) {
            setParseError(
              `Row ${i + 1}: "transcript" must be a non-empty array of turn objects.`,
            );
            return;
          }
          for (let j = 0; j < parsed.length; j++) {
            const t = parsed[j];
            if (!t || typeof t !== "object") {
              setParseError(
                `Row ${i + 1}, turn ${j + 1}: each turn must be an object with a "role".`,
              );
              return;
            }
            if (typeof (t as TurnObject).role !== "string") {
              setParseError(
                `Row ${i + 1}, turn ${j + 1}: each turn must have a string "role".`,
              );
              return;
            }
          }
          items.push({ name, transcript: parsed as TurnObject[] });
        }
        if (items.length === 0) {
          setParseError("No rows with a transcript were found in the CSV.");
          return;
        }
        setParsedItems(items);
      },
      error: (err) => setParseError(err.message || "Failed to parse CSV"),
    });
  };

  const handleUpload = async () => {
    if (parsedItems.length === 0 || isUploading) return;
    setIsUploading(true);
    setUploadError(null);
    try {
      await apiClient(`/annotation-tasks/${taskUuid}/items`, accessToken, {
        method: "POST",
        body: {
          items: parsedItems.map((p) => ({
            payload: { name: p.name, transcript: p.transcript },
          })),
        },
      });
      onSuccess(parsedItems.length);
    } catch (err) {
      setUploadError(parseApiError(err, "Failed to upload items"));
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    if (!isUploading) onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={handleClose}
    >
      <div
        className="bg-background border border-border rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">
            Bulk upload items
          </h2>
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
                onClick={downloadSampleCsv}
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

            {parsedItems.length > 0 && (
              <FormatHelpToggle
                open={formatHelpOpen}
                onToggle={() => setFormatHelpOpen((o) => !o)}
              />
            )}

            {formatHelpOpen && (
              <div className="text-xs text-muted-foreground mb-3 leading-relaxed space-y-2">
                <p>Each row creates one simulation item:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>
                    <code className="font-mono text-foreground">name</code> — a
                    name for the item
                  </li>
                  <li>
                    <code className="font-mono text-foreground">
                      transcript
                    </code>{" "}
                    — JSON array representing a conversation with each turn
                    having a{" "}
                    <code className="font-mono text-foreground">role</code> and{" "}
                    <code className="font-mono text-foreground">content</code>{" "}
                    fields
                  </li>
                </ul>
              </div>
            )}

            <CsvDropzone
              csvFile={csvFile}
              onFile={handleFile}
              onClear={reset}
            />

            {parseError && (
              <p className="text-xs text-red-500 mt-3">{parseError}</p>
            )}
          </div>

          {parsedItems.length > 0 && (
            <div className="space-y-2">
              <p className="text-sm font-medium text-foreground">
                {parsedItems.length}{" "}
                {parsedItems.length === 1 ? "item" : "items"} ready to upload
              </p>
              <div className="border border-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-[180px_1fr_60px] gap-3 px-4 py-2 border-b border-border bg-muted/30">
                  <div className="text-xs font-medium text-muted-foreground">
                    Name
                  </div>
                  <div className="text-xs font-medium text-muted-foreground">
                    Transcript
                  </div>
                  <div className="text-xs font-medium text-muted-foreground text-right">
                    Turns
                  </div>
                </div>
                <div className="max-h-[15rem] overflow-y-auto divide-y divide-border">
                  {parsedItems.slice(0, 50).map((p, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-[180px_1fr_60px] gap-3 px-4 py-2 text-xs items-start"
                    >
                      <div className="truncate text-foreground" title={p.name}>
                        {p.name}
                      </div>
                      <div className="min-w-0">
                        <TranscriptPreview turns={p.transcript} />
                      </div>
                      <div className="text-right tabular-nums text-muted-foreground">
                        {p.transcript.length}
                      </div>
                    </div>
                  ))}
                  {parsedItems.length > 50 && (
                    <div className="px-4 py-2 text-xs text-muted-foreground">
                      + {parsedItems.length - 50} more rows
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

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
            onClick={handleUpload}
            disabled={parsedItems.length === 0 || isUploading || !!parseError}
            className="h-10 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isUploading
              ? "Uploading…"
              : parsedItems.length > 1
                ? `Upload ${parsedItems.length} items`
                : "Upload item"}
          </button>
        </div>
      </div>
    </div>
  );
}
