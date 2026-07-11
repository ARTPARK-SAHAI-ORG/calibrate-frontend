"use client";

import { useEffect, useState } from "react";
import Papa from "papaparse";
import { apiClient } from "@/lib/api";
import { LazyAudioPlayer } from "@/components/evaluations/LazyAudioPlayer";
import {
  AnnotationOptIn,
  BulkUploadDialogShell,
  BulkUploadItemsPreviewShell,
  type EvaluatorMeta,
  type GuidelineColumn,
  type GuidelineDoc,
  type ParsedAnnotation,
  buildItemAnnotationsPayload,
  bulkUploadAnnotatedRowBgClass,
  duplicateEvaluatorNames,
  evaluatorReasoningColumn,
  evaluatorValueColumn,
  findHeaderKey,
  parseAnnotationCell,
  parseApiError,
  sampleEvaluatorValue,
  useAnnotatedItemsCheck,
  useAnnotators,
} from "./bulk-upload-shared";

const NAME_HEADERS = ["name", "title", "label", "item_name"];
const TEXT_HEADERS = ["text", "prompt", "transcript", "reference", "input"];
const AUDIO_HEADERS = ["audio_path", "audio_url", "audio", "url"];

function csvEscape(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

const SAMPLE_TTS_BASE_ROWS: Array<{
  name: string;
  text: string;
  audio: string;
  reasoning: string;
}> = [
  {
    name: "Greeting",
    text: "Hello, how are you today?",
    audio: "https://example.com/audio/greeting.wav",
    reasoning: "Natural intonation and clear pronunciation.",
  },
  {
    name: "Flight booking",
    text: "I would like to book a flight.",
    audio: "https://example.com/audio/flight.wav",
    reasoning: "",
  },
  {
    name: "Repeat request",
    text: "Can you repeat that, please?",
    audio: "https://example.com/audio/repeat.wav",
    reasoning: "",
  },
];

function buildSampleTtsCsv(
  evaluators: EvaluatorMeta[],
  includeAnnotations: boolean,
): string {
  const headerCells = [
    "name",
    "text",
    "audio_path",
    ...(includeAnnotations
      ? evaluators.flatMap((e) => [
          csvEscape(evaluatorValueColumn(e.name)),
          csvEscape(evaluatorReasoningColumn(e.name)),
        ])
      : []),
  ];
  const lines = SAMPLE_TTS_BASE_ROWS.map((r) =>
    [
      csvEscape(r.name),
      csvEscape(r.text),
      csvEscape(r.audio),
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
  text: string;
  audio_path: string;
  annotations: ParsedAnnotation[];
};

export type TtsLinkedEvaluator = {
  uuid: string;
  name: string;
  output_type: "binary" | "rating" | null;
  scale_min: number | null;
  scale_max: number | null;
};

type BulkUploadTtsItemsDialogProps = {
  isOpen: boolean;
  accessToken: string;
  taskUuid: string;
  linkedEvaluators?: TtsLinkedEvaluator[];
  onClose: () => void;
  onSuccess: (count: number, withAnnotations: boolean) => void;
};

export function BulkUploadTtsItemsDialog({
  isOpen,
  accessToken,
  taskUuid,
  linkedEvaluators = [],
  onClose,
  onSuccess,
}: BulkUploadTtsItemsDialogProps) {
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
  const { annotatedCheck, annotatedCheckLoading } = useAnnotatedItemsCheck({
    enabled:
      uploadAnnotations && !!selectedAnnotatorId && parsedItems.length > 0,
    taskUuid,
    accessToken,
    annotatorId: selectedAnnotatorId,
    namedItems: parsedItems,
  });

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
        const nameKey = findHeaderKey(headers, NAME_HEADERS);
        const textKey = findHeaderKey(headers, TEXT_HEADERS);
        const audioKey = findHeaderKey(headers, AUDIO_HEADERS);
        if (!nameKey || !textKey || !audioKey) {
          setParseError(
            `CSV must include "name", "text" and "audio_path" columns. Found: ${headers.join(", ") || "(none)"}`,
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
          const name = (r[nameKey] ?? "").trim();
          const text = (r[textKey] ?? "").trim();
          const audio_path = (r[audioKey] ?? "").trim();
          if (!name && !text && !audio_path) continue;
          if (!name) {
            setParseError(`Row ${i + 1}: "name" is required.`);
            return;
          }
          if (!text || !audio_path) {
            setParseError(
              `Row ${i + 1}: both "text" and "audio_path" are required.`,
            );
            return;
          }
          const annotations: ParsedAnnotation[] = [];
          if (uploadAnnotations) {
            for (const meta of annotationEvaluatorsMeta) {
              if (
                meta.output_type !== "binary" &&
                meta.output_type !== "rating"
              )
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
          items.push({ name, text, audio_path, annotations });
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
            name: p.name,
            text: p.text,
            audio_path: p.audio_path,
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
        name: "name",
        description: "Required. A unique name for the item.",
      },
      {
        name: "text",
        description: "The text the TTS model was asked to speak.",
      },
      {
        name: "audio_path",
        description: "A publicly fetchable URL to the generated audio clip.",
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
      title: "Bulk upload — TTS labelling items",
      intro:
        "Upload a CSV with the following columns. Each row creates one TTS annotation item.",
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
  const ttsGridStyle = {
    gridTemplateColumns: [
      "minmax(80px, 140px)",
      "minmax(120px, 200px)",
      "minmax(120px, 220px)",
      ...annotationColumns.map((c) =>
        c.kind === "value" ? "minmax(64px, 88px)" : "minmax(100px, 176px)",
      ),
    ].join(" "),
  };

  const itemsPreview = (
    <BulkUploadItemsPreviewShell
      itemCount={parsedItems.length}
      annotatedCheckLoading={annotatedCheckLoading}
      annotatedCheck={annotatedCheck}
    >
      <div
        className="grid gap-2 px-3 py-2 border-b border-border bg-muted sticky top-0 z-10"
        style={ttsGridStyle}
      >
        <div className="text-xs font-medium text-muted-foreground">Name</div>
        <div className="text-xs font-medium text-muted-foreground">Text</div>
        <div className="text-xs font-medium text-muted-foreground">Audio</div>
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
            className={`grid gap-2 px-3 py-2 text-xs items-start ${bulkUploadAnnotatedRowBgClass(idx, annotatedCheck)}`}
            style={ttsGridStyle}
          >
            <div className="truncate text-foreground" title={p.name}>
              {p.name || <span className="text-muted-foreground">—</span>}
            </div>
            <div className="truncate text-foreground" title={p.text}>
              {p.text}
            </div>
            <div className="min-w-0">
              <LazyAudioPlayer src={p.audio_path} />
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
    </BulkUploadItemsPreviewShell>
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
            {duplicateNames.map((n) => `"${n}"`).join(", ")}). Rename one on the
            evaluators page before uploading annotations.
          </div>
        )}
        {uploadAnnotations && evaluatorsMissingOutputType.length > 0 && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
            Annotation upload isn&apos;t available — evaluator(s){" "}
            {evaluatorsMissingOutputType.map((e) => `"${e.name}"`).join(", ")}{" "}
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
        buildSampleTtsCsv(annotationEvaluatorsMeta, uploadAnnotations)
      }
      sampleFilename={() =>
        uploadAnnotations
          ? "sample_tts_items_with_annotations.csv"
          : "sample_tts_items.csv"
      }
      buildGuidelines={buildGuidelines}
      guidelinesFilename={() =>
        uploadAnnotations
          ? "tts_items_csv_guidelines_with_annotations.pdf"
          : "tts_items_csv_guidelines.pdf"
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
