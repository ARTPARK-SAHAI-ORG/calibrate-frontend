"use client";

import { useEffect, useState } from "react";
import Papa from "papaparse";
import { apiClient } from "@/lib/api";
import {
  AnnotationOptIn,
  BulkUploadDialogShell,
  type EvaluatorMeta,
  type GuidelineColumn,
  type GuidelineDoc,
  type ParsedAnnotation,
  type TurnObject,
  buildItemAnnotationsPayload,
  duplicateEvaluatorNames,
  evaluatorReasoningColumn,
  evaluatorValueColumn,
  findHeaderKey,
  parseAnnotationCell,
  parseApiError,
  roleLabel,
  rolePillClass,
  sampleEvaluatorValue,
  turnContentString,
  useAnnotators,
} from "./bulk-upload-shared";

const TRANSCRIPT_HEADERS = [
  "transcript",
  "transcript_json",
  "conversation",
  "conversation_history",
];
const NAME_HEADERS = ["name", "title", "simulation_name"];

function csvEscape(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

const SAMPLE_SIMULATION_BASE_ROWS: Array<{
  name: string;
  transcript: string;
  reasoning: string;
}> = [
  {
    name: "Card lost - happy path",
    transcript: JSON.stringify([
      { role: "assistant", content: "Hi, how can I help?" },
      { role: "user", content: "I lost my card" },
      {
        role: "assistant",
        content: "I can help block it. Can you confirm the last 4 digits?",
      },
    ]),
    reasoning:
      "The agent acknowledged the issue and asked the right verification question.",
  },
  {
    name: "Refund flow",
    transcript: JSON.stringify([
      { role: "user", content: "I was charged twice" },
      {
        role: "assistant",
        content:
          "I'm sorry to hear that. Let me investigate the duplicate charge for you.",
      },
    ]),
    reasoning: "",
  },
];

function buildSampleSimulationCsv(
  evaluators: EvaluatorMeta[],
  includeAnnotations: boolean,
): string {
  const headerCells = [
    "name",
    "transcript",
    ...(includeAnnotations
      ? evaluators.flatMap((e) => [
          csvEscape(evaluatorValueColumn(e.name)),
          csvEscape(evaluatorReasoningColumn(e.name)),
        ])
      : []),
  ];
  const lines = SAMPLE_SIMULATION_BASE_ROWS.map((r) =>
    [
      csvEscape(r.name),
      csvEscape(r.transcript),
      ...(includeAnnotations
        ? evaluators.flatMap((e) => [
            csvEscape(sampleEvaluatorValue(e)),
            csvEscape(r.reasoning),
          ])
        : []),
    ].join(","),
  );
  return `${headerCells.join(",")}\n${lines.join("\n")}\n`;
}

type ParsedItem = {
  name: string;
  transcript: TurnObject[];
  annotations: ParsedAnnotation[];
};

export type SimulationLinkedEvaluator = {
  uuid: string;
  name: string;
  output_type: "binary" | "rating" | null;
  scale_min: number | null;
  scale_max: number | null;
};

type BulkUploadSimulationItemsDialogProps = {
  isOpen: boolean;
  accessToken: string;
  taskUuid: string;
  linkedEvaluators?: SimulationLinkedEvaluator[];
  onClose: () => void;
  onSuccess: (count: number, withAnnotations: boolean) => void;
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
  linkedEvaluators = [],
  onClose,
  onSuccess,
}: BulkUploadSimulationItemsDialogProps) {
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadAnnotations, setUploadAnnotations] = useState(false);
  const [selectedAnnotatorId, setSelectedAnnotatorId] = useState<string | null>(
    null,
  );
  const annotatorsState = useAnnotators(isOpen, accessToken);

  const annotationEvaluatorsMeta: EvaluatorMeta[] = linkedEvaluators.map(
    (e) => ({
      uuid: e.uuid,
      name: e.name,
      output_type: e.output_type,
      scale_min: e.scale_min,
      scale_max: e.scale_max,
    }),
  );

  // Evaluators without a usable output_type can't be annotated here —
  // the parser would silently drop their column and produce a half-
  // labelled batch. Block the annotation flow rather than failing later.
  const evaluatorsMissingOutputType = annotationEvaluatorsMeta.filter(
    (e) => e.output_type !== "binary" && e.output_type !== "rating",
  );

  // Two linked evaluators sharing a name produce duplicate CSV headers
  // that PapaParse silently overwrites. Block the annotation flow until
  // one is renamed.
  const duplicateNames = duplicateEvaluatorNames(annotationEvaluatorsMeta);

  const reset = () => {
    setCsvFile(null);
    setParsedItems([]);
    setParseError(null);
    setUploadError(null);
    setUploadAnnotations(false);
    setSelectedAnnotatorId(null);
  };

  useEffect(() => {
    if (isOpen) reset();
  }, [isOpen]);

  useEffect(() => {
    setParsedItems([]);
    setParseError(null);
    setCsvFile(null);
  }, [uploadAnnotations]);


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
        if (uploadAnnotations) {
          if (evaluatorsMissingOutputType.length > 0) {
            setParseError(
              `Annotation upload is unavailable: evaluator(s) ${evaluatorsMissingOutputType
                .map((e) => `"${e.name}"`)
                .join(", ")} have no binary/rating output configured.`,
            );
            return;
          }
          const missing: string[] = [];
          for (const meta of annotationEvaluatorsMeta) {
            const valueHeader = evaluatorValueColumn(meta.name);
            if (!headers.includes(valueHeader)) missing.push(valueHeader);
          }
          if (missing.length > 0) {
            setParseError(
              `CSV is missing annotation column(s): ${missing
                .map((c) => `"${c}"`)
                .join(", ")}.`,
            );
            return;
          }
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
          const annotations: ParsedAnnotation[] = [];
          if (uploadAnnotations) {
            for (const meta of annotationEvaluatorsMeta) {
              if (meta.output_type !== "binary" && meta.output_type !== "rating")
                continue;
              const valueHeader = evaluatorValueColumn(meta.name);
              const reasoningHeader = evaluatorReasoningColumn(meta.name);
              const rawValue = (row[valueHeader] ?? "").trim();
              const rawReasoning = (row[reasoningHeader] ?? "").trim();
              if (!rawValue) {
                setParseError(
                  `Row ${i + 1}: missing value for "${valueHeader}".`,
                );
                return;
              }
              const parsedAnn = parseAnnotationCell(rawValue, meta);
              if ("error" in parsedAnn) {
                setParseError(`Row ${i + 1}: ${parsedAnn.error}.`);
                return;
              }
              annotations.push({
                evaluator_uuid: meta.uuid,
                output_type: meta.output_type,
                value: parsedAnn.value,
                reasoning: rawReasoning,
              });
            }
          }
          items.push({
            name,
            transcript: parsed as TurnObject[],
            annotations,
          });
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
    if (uploadAnnotations && !selectedAnnotatorId) {
      setUploadError("Select an annotator before uploading.");
      return;
    }
    if (uploadAnnotations && evaluatorsMissingOutputType.length > 0) {
      setUploadError(
        "One or more evaluators have no binary/rating output configured.",
      );
      return;
    }
    setIsUploading(true);
    setUploadError(null);
    try {
      const itemsBody = parsedItems.map((p) => {
        const annotationsObj = uploadAnnotations
          ? buildItemAnnotationsPayload(p.annotations)
          : undefined;
        return {
          payload: { name: p.name, transcript: p.transcript },
          ...(annotationsObj ? { annotations: annotationsObj } : {}),
        };
      });
      const anyAnnotated = itemsBody.some((it) => "annotations" in it);
      await apiClient(`/annotation-tasks/${taskUuid}/items`, accessToken, {
        method: "POST",
        body: {
          ...(anyAnnotated && selectedAnnotatorId
            ? { annotator_id: selectedAnnotatorId }
            : {}),
          items: itemsBody,
        },
      });
      onSuccess(parsedItems.length, uploadAnnotations);
    } catch (err) {
      setUploadError(parseApiError(err, "Failed to upload items"));
    } finally {
      setIsUploading(false);
    }
  };

  const buildGuidelines = (): GuidelineDoc => {
    const columns: GuidelineColumn[] = [
      {
        name: "name",
        description: "A name for the item.",
      },
      {
        name: "transcript",
        description:
          'A JSON array of chat messages representing the full conversation. Each message is an object with a "role" and "content" field.\n\nrole — either "user" or "assistant"\ncontent — the message said by that role',
        example: `[
  {"role": "assistant", "content": "Hi, how can I help?"},
  {"role": "user", "content": "I lost my card"}
]`,
      },
    ];

    if (uploadAnnotations && annotationEvaluatorsMeta.length > 0) {
      for (const e of annotationEvaluatorsMeta) {
        const range =
          e.output_type === "binary"
            ? "true/false"
            : e.output_type === "rating" &&
                typeof e.scale_min === "number" &&
                typeof e.scale_max === "number"
              ? `any value between ${e.scale_min}-${e.scale_max}`
              : "value";
        columns.push({
          name: evaluatorValueColumn(e.name),
          description: `Required. Value for the "${e.name}" evaluator (${range}).`,
        });
        columns.push({
          name: evaluatorReasoningColumn(e.name),
          description: `(optional) Reasoning for the value assigned to "${e.name}".`,
        });
      }
    }

    return {
      title: "Bulk upload — Simulation labelling items",
      intro:
        "Upload a CSV with the following columns. Each row creates one simulation annotation item.",
      columns,
    };
  };

  const annotationColumns =
    uploadAnnotations && annotationEvaluatorsMeta.length > 0
      ? annotationEvaluatorsMeta.flatMap((e) => [
          {
            evaluatorUuid: e.uuid,
            kind: "value" as const,
            header: evaluatorValueColumn(e.name),
          },
          {
            evaluatorUuid: e.uuid,
            kind: "reasoning" as const,
            header: evaluatorReasoningColumn(e.name),
          },
        ])
      : [];
  const simGridStyle = {
    gridTemplateColumns: [
      "minmax(100px, 152px)",
      "minmax(140px, 220px)",
      "48px",
      ...annotationColumns.map((c) =>
        c.kind === "value"
          ? "minmax(64px, 88px)"
          : "minmax(100px, 176px)",
      ),
    ].join(" "),
  };

  const itemsPreview = (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">
        {parsedItems.length} {parsedItems.length === 1 ? "item" : "items"} ready
        to upload
      </p>
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="overflow-auto max-h-[20rem]">
          <div className="min-w-max">
          <div
            className="grid gap-2 px-3 py-2 border-b border-border bg-muted sticky top-0 z-10"
            style={simGridStyle}
          >
            <div className="text-xs font-medium text-muted-foreground">
              Name
            </div>
            <div className="text-xs font-medium text-muted-foreground">
              Transcript
            </div>
            <div className="text-xs font-medium text-muted-foreground text-right">
              Turns
            </div>
            {annotationColumns.map((c) => (
              <div
                key={`ah-${c.evaluatorUuid}-${c.kind}`}
                className="text-xs font-medium text-muted-foreground font-mono truncate"
                title={c.header}
              >
                {c.header}
              </div>
            ))}
          </div>
          <div className="divide-y divide-border">
            {parsedItems.slice(0, 50).map((p, idx) => (
              <div
                key={idx}
                className="grid gap-2 px-3 py-2 text-xs items-start"
                style={simGridStyle}
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
                {annotationColumns.map((c) => {
                  const ann = p.annotations.find(
                    (a) => a.evaluator_uuid === c.evaluatorUuid,
                  );
                  const display =
                    c.kind === "value"
                      ? ann
                        ? typeof ann.value === "boolean"
                          ? ann.value
                            ? "true"
                            : "false"
                          : String(ann.value)
                        : ""
                      : (ann?.reasoning ?? "");
                  return (
                    <div
                      key={`${idx}-a-${c.evaluatorUuid}-${c.kind}`}
                      className="min-w-0 max-h-24 overflow-y-auto pr-1 leading-snug text-foreground break-words whitespace-pre-wrap"
                    >
                      {display}
                    </div>
                  );
                })}
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
      </div>
    </div>
  );

  const annotationOptIn =
    linkedEvaluators.length > 0 ? (
      <div className="space-y-3">
        <AnnotationOptIn
          annotators={annotatorsState.annotators}
          loading={annotatorsState.loading}
          error={annotatorsState.error}
          uploadAnnotations={uploadAnnotations}
          onToggle={setUploadAnnotations}
          selectedAnnotatorId={selectedAnnotatorId}
          onSelectAnnotator={setSelectedAnnotatorId}
        />
        {uploadAnnotations && duplicateNames.length > 0 && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
            Two or more linked evaluators share the same name (
            {duplicateNames.map((n) => `"${n}"`).join(", ")}). Rename one
            on the evaluators page before uploading annotations.
          </div>
        )}
        {uploadAnnotations && evaluatorsMissingOutputType.length > 0 && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
            Annotation upload isn&apos;t available — evaluator(s){" "}
            {evaluatorsMissingOutputType
              .map((e) => `"${e.name}"`)
              .join(", ")}{" "}
            have no binary/rating output configured.
          </div>
        )}
      </div>
    ) : null;

  const uploadBlocked =
    uploadAnnotations &&
    (annotatorsState.annotators.length === 0 ||
      !selectedAnnotatorId ||
      duplicateNames.length > 0 ||
      evaluatorsMissingOutputType.length > 0);

  return (
    <BulkUploadDialogShell
      isOpen={isOpen}
      title="Bulk upload items"
      buildSampleCsv={() =>
        buildSampleSimulationCsv(annotationEvaluatorsMeta, uploadAnnotations)
      }
      sampleFilename={() =>
        uploadAnnotations
          ? "sample_simulation_items_with_annotations.csv"
          : "sample_simulation_items.csv"
      }
      buildGuidelines={buildGuidelines}
      guidelinesFilename={() =>
        uploadAnnotations
          ? "simulation_items_csv_guidelines_with_annotations.pdf"
          : "simulation_items_csv_guidelines.pdf"
      }
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
      topContent={annotationOptIn}
      uploadBlocked={uploadBlocked}
      hideUploadSection={
        uploadAnnotations &&
        (!selectedAnnotatorId ||
          duplicateNames.length > 0 ||
          evaluatorsMissingOutputType.length > 0)
      }
    />
  );
}
