"use client";

import { useEffect, useState } from "react";
import Papa from "papaparse";
import { useHideFloatingButton } from "@/components/AppLayout";
import { apiClient } from "@/lib/api";
import {
  CsvDropzone,
  FormatHelpToggle,
  findHeaderKey,
  parseApiError,
} from "./bulk-upload-shared";

const REFERENCE_HEADERS = [
  "reference_transcript",
  "reference",
  "actual_transcript",
  "actual",
  "ground_truth",
  "text",
];
const PREDICTED_HEADERS = [
  "predicted_transcript",
  "predicted",
  "prediction",
  "hypothesis",
];

const SAMPLE_STT_CSV = `reference_transcript,predicted_transcript
"Hello, how are you today?","hello how are you today"
"I would like to book a flight.","I'd like to book a flight"
"Can you repeat that, please?","can you repeat that please"
`;

type ParsedItem = {
  reference_transcript: string;
  predicted_transcript: string;
};

type BulkUploadSttItemsDialogProps = {
  isOpen: boolean;
  accessToken: string;
  taskUuid: string;
  onClose: () => void;
  onSuccess: (count: number) => void;
};

export function BulkUploadSttItemsDialog({
  isOpen,
  accessToken,
  taskUuid,
  onClose,
  onSuccess,
}: BulkUploadSttItemsDialogProps) {
  useHideFloatingButton(isOpen);

  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  // Format help: open by default; auto-collapses once a CSV parses.
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
    const blob = new Blob([SAMPLE_STT_CSV], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sample_stt_items.csv";
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
        const refKey = findHeaderKey(headers, REFERENCE_HEADERS);
        const predKey = findHeaderKey(headers, PREDICTED_HEADERS);
        if (!refKey || !predKey) {
          setParseError(
            `CSV must include "reference_transcript" and "predicted_transcript" columns. Found: ${headers.join(", ") || "(none)"}`,
          );
          return;
        }
        const items: ParsedItem[] = [];
        for (const r of results.data) {
          const reference_transcript = (r[refKey] ?? "").trim();
          const predicted_transcript = (r[predKey] ?? "").trim();
          if (!reference_transcript && !predicted_transcript) continue;
          if (!reference_transcript || !predicted_transcript) {
            setParseError(
              "Every row must have both a reference and a predicted transcript.",
            );
            return;
          }
          items.push({ reference_transcript, predicted_transcript });
        }
        if (items.length === 0) {
          setParseError("No rows with content were found in the CSV.");
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
          items: parsedItems.map((p) => ({ payload: p })),
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
                <p>Your CSV needs two columns per row:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>
                    <code className="font-mono text-foreground">
                      reference_transcript
                    </code>{" "}
                    — what was actually said
                  </li>
                  <li>
                    <code className="font-mono text-foreground">
                      predicted_transcript
                    </code>{" "}
                    — what the system transcribed
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
                <div className="grid grid-cols-2 gap-3 px-4 py-2 border-b border-border bg-muted/30">
                  <div className="text-xs font-medium text-muted-foreground">
                    Reference transcript
                  </div>
                  <div className="text-xs font-medium text-muted-foreground">
                    Predicted transcript
                  </div>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-border">
                  {parsedItems.slice(0, 50).map((p, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-2 gap-3 px-4 py-2 text-xs"
                    >
                      <div
                        className="truncate text-foreground"
                        title={p.reference_transcript}
                      >
                        {p.reference_transcript}
                      </div>
                      <div
                        className="truncate text-foreground"
                        title={p.predicted_transcript}
                      >
                        {p.predicted_transcript}
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
