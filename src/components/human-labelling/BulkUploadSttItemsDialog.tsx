"use client";

import { useEffect, useState } from "react";
import Papa from "papaparse";
import { apiClient } from "@/lib/api";
import {
  BulkUploadDialogShell,
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
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const reset = () => {
    setCsvFile(null);
    setParsedItems([]);
    setParseError(null);
    setUploadError(null);
  };

  useEffect(() => {
    if (isOpen) reset();
  }, [isOpen]);

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

  const helpContent = (
    <>
      <p>Your CSV needs two columns per row:</p>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>
          <code className="font-mono text-foreground">reference_transcript</code>{" "}
          — what was actually said
        </li>
        <li>
          <code className="font-mono text-foreground">predicted_transcript</code>{" "}
          — what the system transcribed
        </li>
      </ul>
    </>
  );

  const itemsPreview = (
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
            <div key={idx} className="grid grid-cols-2 gap-3 px-4 py-2 text-xs">
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
  );

  return (
    <BulkUploadDialogShell
      isOpen={isOpen}
      title="Bulk upload items"
      buildSampleCsv={() => SAMPLE_STT_CSV}
      sampleFilename="sample_stt_items.csv"
      helpContent={helpContent}
      csvFile={csvFile}
      onFile={handleFile}
      onClear={reset}
      parseError={parseError}
      uploadError={uploadError}
      isUploading={isUploading}
      itemCount={parsedItems.length}
      itemsPreview={itemsPreview}
      onUpload={handleUpload}
      onClose={onClose}
    />
  );
}
