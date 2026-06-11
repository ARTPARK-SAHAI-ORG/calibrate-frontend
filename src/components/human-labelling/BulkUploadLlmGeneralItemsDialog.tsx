"use client";

import { useEffect, useState } from "react";
import Papa from "papaparse";
import { apiClient } from "@/lib/api";
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

type EvaluatorVariableDef = {
  name: string;
  description?: string;
  default?: string;
};

export type LlmGeneralLinkedEvaluator = {
  uuid: string;
  name: string;
  slug: string | null;
  variables: EvaluatorVariableDef[];
  output_type: "binary" | "rating" | null;
  scale_min: number | null;
  scale_max: number | null;
};

type EvaluatorRef = {
  evaluator_uuid: string;
  variable_values?: Record<string, string>;
};

const NAME_HEADERS = ["name", "title", "label", "item_name"];
const INPUT_HEADERS = ["input", "prompt", "question", "request"];
const OUTPUT_HEADERS = ["output", "response", "completion", "answer", "reply"];

function csvEscape(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

// Column header for an evaluator variable, e.g. "Correctness/criteria".
// One column per variable per evaluator — keeps the CSV flat instead of
// asking users to hand-author JSON in a single cell.
function variableColumnName(evalName: string, varName: string): string {
  return `${evalName}/${varName}`;
}

const SAMPLE_BASE_ROWS: Array<{
  name: string;
  input: string;
  output: string;
  sampleVariableValue: string;
  reasoning: string;
}> = [
  {
    name: "Summary 1",
    input: "Summarise: The cat sat on the mat and then went to sleep.",
    output: "A cat sat on a mat and fell asleep.",
    sampleVariableValue:
      "The summary should be accurate, concise, and capture the key facts.",
    reasoning: "Accurate and concise.",
  },
  {
    name: "Classification 1",
    input: "Classify the sentiment: I absolutely loved this product!",
    output: "positive",
    sampleVariableValue:
      "The label should correctly reflect the sentiment of the text.",
    reasoning: "",
  },
];

function buildSampleCsv(
  linked: LlmGeneralLinkedEvaluator[],
  includeAnnotations: boolean,
): string {
  const variableColumns: { evalName: string; varName: string }[] = [];
  for (const e of linked) {
    for (const v of e.variables) {
      variableColumns.push({ evalName: e.name, varName: v.name });
    }
  }
  const headerCells = [
    "name",
    "input",
    "output",
    ...variableColumns.map((c) =>
      csvEscape(variableColumnName(c.evalName, c.varName)),
    ),
    ...(includeAnnotations
      ? linked.flatMap((e) => [
          csvEscape(evaluatorValueColumn(e.name)),
          csvEscape(evaluatorReasoningColumn(e.name)),
        ])
      : []),
  ];
  const lines = SAMPLE_BASE_ROWS.map((r) =>
    [
      csvEscape(r.name),
      csvEscape(r.input),
      csvEscape(r.output),
      ...variableColumns.map(() => csvEscape(r.sampleVariableValue)),
      ...(includeAnnotations
        ? linked.flatMap((e) => [
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
  input: string;
  output: string;
  evaluators: EvaluatorRef[];
  annotations: ParsedAnnotation[];
};

type BulkUploadLlmGeneralItemsDialogProps = {
  isOpen: boolean;
  accessToken: string;
  taskUuid: string;
  linkedEvaluators?: LlmGeneralLinkedEvaluator[];
  onClose: () => void;
  onSuccess: (count: number, withAnnotations: boolean) => void;
};

export function BulkUploadLlmGeneralItemsDialog({
  isOpen,
  accessToken,
  taskUuid,
  linkedEvaluators = [],
  onClose,
  onSuccess,
}: BulkUploadLlmGeneralItemsDialogProps) {
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

  // Evaluators without a usable output_type can't be annotated here — the
  // parser would silently drop their column and produce a half-labelled
  // batch. Block the annotation flow rather than failing later.
  const evaluatorsMissingOutputType = annotationEvaluatorsMeta.filter(
    (e) => e.output_type !== "binary" && e.output_type !== "rating",
  );

  // Two linked evaluators with the same name produce duplicate CSV headers —
  // this also breaks the `<evalName>/<varName>` variable columns, so it has
  // to block regardless of whether the user is uploading annotations.
  const duplicateNames = duplicateEvaluatorNames(annotationEvaluatorsMeta);

  const evaluatorsWithVariables = linkedEvaluators.filter(
    (e) => e.variables.length > 0,
  );

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
    if (duplicateNames.length > 0) {
      setParseError(
        `Two or more linked evaluators share the same name (${duplicateNames
          .map((n) => `"${n}"`)
          .join(", ")}). Rename one before uploading.`,
      );
      return;
    }
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim(),
      complete: (results) => {
        const headers = results.meta.fields ?? [];
        const nameKey = findHeaderKey(headers, NAME_HEADERS);
        const inputKey = findHeaderKey(headers, INPUT_HEADERS);
        const outputKey = findHeaderKey(headers, OUTPUT_HEADERS);
        if (!nameKey || !inputKey || !outputKey) {
          setParseError(
            `CSV must include "name", "input" and "output" columns. Found: ${headers.join(", ") || "(none)"}`,
          );
          return;
        }

        // Resolve a column for each evaluator variable up front.
        const variableHeaderMap = new Map<
          string,
          {
            evaluator: LlmGeneralLinkedEvaluator;
            varName: string;
            columnKey: string;
          }[]
        >();
        const missingColumns: string[] = [];
        for (const e of evaluatorsWithVariables) {
          const slots: {
            evaluator: LlmGeneralLinkedEvaluator;
            varName: string;
            columnKey: string;
          }[] = [];
          for (const v of e.variables) {
            const expected = variableColumnName(e.name, v.name);
            const key = headers.find((h) => h === expected);
            if (!key) {
              missingColumns.push(expected);
              continue;
            }
            slots.push({ evaluator: e, varName: v.name, columnKey: key });
          }
          variableHeaderMap.set(e.uuid, slots);
        }
        if (missingColumns.length > 0) {
          setParseError(
            `CSV is missing column(s) for evaluator variables: ${missingColumns
              .map((c) => `"${c}"`)
              .join(", ")}. Download the sample CSV above for the exact format.`,
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
          const input = (r[inputKey] ?? "").trim();
          const output = (r[outputKey] ?? "").trim();
          const anyVariableValue = evaluatorsWithVariables.some((e) =>
            (variableHeaderMap.get(e.uuid) ?? []).some(
              (slot) => (r[slot.columnKey] ?? "").trim() !== "",
            ),
          );
          if (!name && !input && !output && !anyVariableValue) continue;
          if (!name) {
            setParseError(`Row ${i + 1}: "name" is required.`);
            return;
          }
          if (!input || !output) {
            setParseError(
              `Row ${i + 1}: both "input" and "output" are required.`,
            );
            return;
          }

          const refs: EvaluatorRef[] = [];
          let rowError: string | null = null;
          for (const e of evaluatorsWithVariables) {
            const slots = variableHeaderMap.get(e.uuid) ?? [];
            const variableValues: Record<string, string> = {};
            for (const slot of slots) {
              const raw = (r[slot.columnKey] ?? "").trim();
              if (!raw) {
                rowError = `Row ${i + 1}: missing value for "${variableColumnName(
                  e.name,
                  slot.varName,
                )}".`;
                break;
              }
              variableValues[slot.varName] = raw;
            }
            if (rowError) break;
            refs.push({ evaluator_uuid: e.uuid, variable_values: variableValues });
          }
          if (rowError) {
            setParseError(rowError);
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
          items.push({ name, input, output, evaluators: refs, annotations });
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
        const evaluator_variables: Record<
          string,
          Record<string, string>
        > = {};
        for (const ref of p.evaluators) {
          if (ref.variable_values) {
            evaluator_variables[ref.evaluator_uuid] = { ...ref.variable_values };
          }
        }
        const annotationsObj = uploadAnnotations
          ? buildItemAnnotationsPayload(p.annotations)
          : undefined;
        return {
          payload: {
            name: p.name,
            input: p.input,
            output: p.output,
            ...(Object.keys(evaluator_variables).length > 0
              ? { evaluator_variables }
              : {}),
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
        name: "input",
        description: "Required. The prompt or input given to the LLM.",
      },
      {
        name: "output",
        description: "Required. The output the LLM produced for that input.",
      },
    ];

    for (const e of evaluatorsWithVariables) {
      for (const v of e.variables) {
        const desc = v.description ? ` — ${v.description}` : "";
        columns.push({
          name: variableColumnName(e.name, v.name),
          description: `Required. Used for the "${e.name}" evaluator${desc}`,
        });
      }
    }

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
      title: "Bulk upload — LLM response labelling items",
      intro:
        "Upload a CSV with the following columns. Each row creates one non-conversational LLM evaluation item.",
      columns,
    };
  };

  const variableColumns = evaluatorsWithVariables.flatMap((e) =>
    e.variables.map((v) => ({
      evaluatorUuid: e.uuid,
      varName: v.name,
      header: variableColumnName(e.name, v.name),
    })),
  );
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
  const gridStyle = {
    gridTemplateColumns: [
      "minmax(80px, 140px)",
      "minmax(120px, 220px)",
      "minmax(120px, 220px)",
      ...variableColumns.map(() => "minmax(120px, 200px)"),
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
        style={gridStyle}
      >
        <div className="text-xs font-medium text-muted-foreground">Name</div>
        <div className="text-xs font-medium text-muted-foreground">Input</div>
        <div className="text-xs font-medium text-muted-foreground">Output</div>
        {variableColumns.map((c) => (
          <div
            key={`h-${c.evaluatorUuid}-${c.varName}`}
            className="text-xs font-medium text-muted-foreground font-mono truncate"
            title={c.header}
          >
            {c.header}
          </div>
        ))}
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
        {parsedItems.slice(0, 50).map((p, idx) => {
          const valuesByKey = new Map<string, string>();
          for (const ref of p.evaluators) {
            if (!ref.variable_values) continue;
            for (const [varName, value] of Object.entries(
              ref.variable_values,
            )) {
              valuesByKey.set(`${ref.evaluator_uuid}/${varName}`, value);
            }
          }
          return (
            <div
              key={idx}
              className={`grid gap-2 px-3 py-2 text-xs items-start ${bulkUploadAnnotatedRowBgClass(idx, annotatedCheck)}`}
              style={gridStyle}
            >
              <div className="truncate text-foreground" title={p.name}>
                {p.name || <span className="text-muted-foreground">—</span>}
              </div>
              <div
                className="min-w-0 max-h-24 overflow-y-auto pr-1 leading-snug text-foreground break-words whitespace-pre-wrap"
                title={p.input}
              >
                {p.input}
              </div>
              <div
                className="min-w-0 max-h-24 overflow-y-auto pr-1 leading-snug text-foreground break-words whitespace-pre-wrap"
                title={p.output}
              >
                {p.output}
              </div>
              {variableColumns.map((c) => {
                const value =
                  valuesByKey.get(`${c.evaluatorUuid}/${c.varName}`) ?? "";
                return (
                  <div
                    key={`${idx}-${c.evaluatorUuid}-${c.varName}`}
                    className="min-w-0 max-h-24 overflow-y-auto pr-1 leading-snug text-foreground break-words whitespace-pre-wrap"
                  >
                    {value}
                  </div>
                );
              })}
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
          );
        })}
        {parsedItems.length > 50 && (
          <div className="px-4 py-2 text-xs text-muted-foreground">
            + {parsedItems.length - 50} more rows
          </div>
        )}
      </div>
    </BulkUploadItemsPreviewShell>
  );

  const annotationOptIn =
    linkedEvaluators.length > 0 || duplicateNames.length > 0 ? (
      <div className="space-y-3">
        {linkedEvaluators.length > 0 && (
          <AnnotationOptIn
            annotators={annotatorsState.annotators}
            loading={annotatorsState.loading}
            error={annotatorsState.error}
            uploadAnnotations={uploadAnnotations}
            onToggle={setUploadAnnotations}
            selectedAnnotatorId={selectedAnnotatorId}
            onSelectAnnotator={setSelectedAnnotatorId}
          />
        )}
        {duplicateNames.length > 0 && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-600 dark:text-red-400">
            Two or more linked evaluators share the same name (
            {duplicateNames.map((n) => `"${n}"`).join(", ")}). Their variable
            and annotation columns would collide in the CSV — rename one on the
            evaluators page before uploading.
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
    duplicateNames.length > 0 ||
    (uploadAnnotations &&
      (annotatorsState.annotators.length === 0 ||
        !selectedAnnotatorId ||
        evaluatorsMissingOutputType.length > 0));

  return (
    <BulkUploadDialogShell
      isOpen={isOpen}
      title="Bulk upload items"
      buildSampleCsv={() => buildSampleCsv(linkedEvaluators, uploadAnnotations)}
      sampleFilename={() =>
        uploadAnnotations
          ? "sample_llm_response_items_with_annotations.csv"
          : "sample_llm_response_items.csv"
      }
      buildGuidelines={buildGuidelines}
      guidelinesFilename={() =>
        uploadAnnotations
          ? "llm_response_items_csv_guidelines_with_annotations.pdf"
          : "llm_response_items_csv_guidelines.pdf"
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
        duplicateNames.length > 0 ||
        (uploadAnnotations &&
          (!selectedAnnotatorId || evaluatorsMissingOutputType.length > 0))
      }
    />
  );
}
