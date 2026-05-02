"use client";

import { useEffect, useState } from "react";
import Papa from "papaparse";
import { apiClient } from "@/lib/api";
import {
  BulkUploadDialogShell,
  ConversationFormatDetails,
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

  const helpContent = (
    <>
      <p>Each row creates one simulation item:</p>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>
          <code className="font-mono text-foreground">name</code> — a name for
          the item
        </li>
        <li>
          <code className="font-mono text-foreground">transcript</code> — JSON
          array representing the full conversation.
          <ConversationFormatDetails
            example={
              '[{"role":"assistant","content":"Hi, how can I help?"},{"role":"user","content":"I lost my card"},{"role":"assistant","content":"I can help block it. Can you confirm the last 4 digits?"}]'
            }
          />
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
        <div className="grid grid-cols-[180px_1fr_60px] gap-3 px-4 py-2 border-b border-border bg-muted/30">
          <div className="text-xs font-medium text-muted-foreground">Name</div>
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
  );

  return (
    <BulkUploadDialogShell
      isOpen={isOpen}
      title="Bulk upload items"
      buildSampleCsv={() => SAMPLE_SIMULATION_CSV}
      sampleFilename="sample_simulation_items.csv"
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
