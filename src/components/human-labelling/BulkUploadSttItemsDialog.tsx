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
  buildItemAnnotationsPayload,
  duplicateEvaluatorNames,
  evaluatorReasoningColumn,
  evaluatorValueColumn,
  findHeaderKey,
  parseAnnotationCell,
  parseApiError,
  sampleEvaluatorValue,
  useAnnotators,
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

function csvEscape(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

const SAMPLE_STT_BASE_ROWS: Array<{
  ref: string;
  pred: string;
  reasoning: string;
}> = [
  {
    ref: "Hello, how are you today?",
    pred: "hello how are you today",
    reasoning: "Punctuation is missing but the words match.",
  },
  {
    ref: "I would like to book a flight.",
    pred: "I'd like to book a flight",
    reasoning: "",
  },
  {
    ref: "Can you repeat that, please?",
    pred: "can you repeat that please",
    reasoning: "",
  },
];

function buildSampleSttCsv(
  evaluators: EvaluatorMeta[],
  includeAnnotations: boolean,
): string {
  const headerCells = [
    "reference_transcript",
    "predicted_transcript",
    ...(includeAnnotations
      ? evaluators.flatMap((e) => [
          csvEscape(evaluatorValueColumn(e.name)),
          csvEscape(evaluatorReasoningColumn(e.name)),
        ])
      : []),
  ];
  const lines = SAMPLE_STT_BASE_ROWS.map((r) =>
    [
      csvEscape(r.ref),
      csvEscape(r.pred),
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
  reference_transcript: string;
  predicted_transcript: string;
  annotations: ParsedAnnotation[];
};

export type SttLinkedEvaluator = {
  uuid: string;
  name: string;
  output_type: "binary" | "rating" | null;
  scale_min: number | null;
  scale_max: number | null;
};

type BulkUploadSttItemsDialogProps = {
  isOpen: boolean;
  accessToken: string;
  taskUuid: string;
  linkedEvaluators?: SttLinkedEvaluator[];
  onClose: () => void;
  onSuccess: (count: number, withAnnotations: boolean) => void;
};

export function BulkUploadSttItemsDialog({
  isOpen,
  accessToken,
  taskUuid,
  linkedEvaluators = [],
  onClose,
  onSuccess,
}: BulkUploadSttItemsDialogProps) {
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
        const refKey = findHeaderKey(headers, REFERENCE_HEADERS);
        const predKey = findHeaderKey(headers, PREDICTED_HEADERS);
        if (!refKey || !predKey) {
          setParseError(
            `CSV must include "reference_transcript" and "predicted_transcript" columns. Found: ${headers.join(", ") || "(none)"}`,
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
          const r = results.data[i];
          const reference_transcript = (r[refKey] ?? "").trim();
          const predicted_transcript = (r[predKey] ?? "").trim();
          if (!reference_transcript && !predicted_transcript) continue;
          if (!reference_transcript || !predicted_transcript) {
            setParseError(
              "Every row must have both a reference and a predicted transcript.",
            );
            return;
          }
          const annotations: ParsedAnnotation[] = [];
          if (uploadAnnotations) {
            for (const meta of annotationEvaluatorsMeta) {
              if (meta.output_type !== "binary" && meta.output_type !== "rating")
                continue;
              const valueHeader = evaluatorValueColumn(meta.name);
              const reasoningHeader = evaluatorReasoningColumn(meta.name);
              const rawValue = (r[valueHeader] ?? "").trim();
              const rawReasoning = (r[reasoningHeader] ?? "").trim();
              if (!rawValue) {
                setParseError(
                  `Row ${i + 1}: missing value for "${valueHeader}".`,
                );
                return;
              }
              const parsed = parseAnnotationCell(rawValue, meta);
              if ("error" in parsed) {
                setParseError(`Row ${i + 1}: ${parsed.error}.`);
                return;
              }
              annotations.push({
                evaluator_uuid: meta.uuid,
                output_type: meta.output_type,
                value: parsed.value,
                reasoning: rawReasoning,
              });
            }
          }
          items.push({
            reference_transcript,
            predicted_transcript,
            annotations,
          });
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
          payload: {
            reference_transcript: p.reference_transcript,
            predicted_transcript: p.predicted_transcript,
          },
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
        name: "reference_transcript",
        description: "What was actually said.",
      },
      {
        name: "predicted_transcript",
        description: "What the system transcribed.",
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
      title: "Bulk upload — STT labelling items",
      intro:
        "Upload a CSV with the following columns. Each row creates one STT annotation item.",
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
  const sttGridStyle = {
    gridTemplateColumns: [
      "minmax(220px,1fr)",
      "minmax(220px,1fr)",
      ...annotationColumns.map(() => "minmax(180px,1fr)"),
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
          <div
            className="grid gap-3 px-4 py-2 border-b border-border bg-muted sticky top-0 z-10"
            style={sttGridStyle}
          >
            <div className="text-xs font-medium text-muted-foreground">
              Reference transcript
            </div>
            <div className="text-xs font-medium text-muted-foreground">
              Predicted transcript
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
                className="grid gap-3 px-4 py-2 text-xs items-start"
                style={sttGridStyle}
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
        buildSampleSttCsv(annotationEvaluatorsMeta, uploadAnnotations)
      }
      sampleFilename={() =>
        uploadAnnotations
          ? "sample_stt_items_with_annotations.csv"
          : "sample_stt_items.csv"
      }
      buildGuidelines={buildGuidelines}
      guidelinesFilename={() =>
        uploadAnnotations
          ? "stt_items_csv_guidelines_with_annotations.pdf"
          : "stt_items_csv_guidelines.pdf"
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
