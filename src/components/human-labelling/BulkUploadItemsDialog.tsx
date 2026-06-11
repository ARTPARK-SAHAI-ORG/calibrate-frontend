"use client";

import React, { useEffect, useState } from "react";
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

export type EvaluatorVariableDef = {
  name: string;
  description?: string;
  default?: string;
};

export type BulkLinkedEvaluator = {
  uuid: string;
  name: string;
  slug: string | null;
  variables: EvaluatorVariableDef[];
  output_type: "binary" | "rating" | null;
  scale_min: number | null;
  scale_max: number | null;
};

// Describes one item-content column (the parts that differ between task types,
// e.g. conversation_history + agent_response for LLM, or input + output for
// LLM-response). Everything else — name, description, evaluator-variable
// columns, annotation columns, upload, preview shell — is handled generically.
export type BulkContentColumn = {
  // Key written into the item payload (e.g. "chat_history", "input").
  payloadKey: string;
  // Canonical CSV header — shown in guidelines, required-errors, and the
  // sample CSV (may differ from payloadKey, e.g. "conversation_history").
  csvColumn: string;
  // Accepted CSV header aliases.
  headerCandidates: string[];
  // Preview column header.
  previewLabel: string;
  // Preview grid column width.
  previewWidth: string;
  // Guidelines copy.
  guidelineDescription: string;
  guidelineExample?: string;
  // Parse a non-empty trimmed cell into the payload value (or an error).
  parse: (raw: string, rowIndex: number) => { value: unknown } | { error: string };
  // Render the parsed value in the preview grid.
  renderPreview: (value: unknown) => React.ReactNode;
};

export type BulkSampleRow = {
  name: string;
  description: string;
  // Keyed by content column `csvColumn`.
  content: Record<string, string>;
  variableValue: string;
  reasoning: string;
};

type EvaluatorRef = {
  evaluator_uuid: string;
  variable_values?: Record<string, string>;
};

type ParsedItem = {
  name: string;
  description: string;
  content: Record<string, unknown>;
  evaluators: EvaluatorRef[];
  annotations: ParsedAnnotation[];
};

const NAME_HEADERS = ["name", "title", "label", "item_name"];
const DESCRIPTION_HEADERS = ["description", "desc", "notes"];

function csvEscape(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

// Column header for an evaluator variable, e.g. "Correctness/criteria". One
// column per variable per evaluator — keeps the CSV flat instead of asking
// users to hand-author JSON in a single cell.
function variableColumnName(evalName: string, varName: string): string {
  return `${evalName}/${varName}`;
}

export type BulkUploadItemsDialogProps = {
  isOpen: boolean;
  accessToken: string;
  taskUuid: string;
  linkedEvaluators?: BulkLinkedEvaluator[];
  contentColumns: BulkContentColumn[];
  sampleRows: BulkSampleRow[];
  // Used when there are no linked evaluators, so the sample CSV still shows an
  // example variable column. Optional.
  sampleFallbackEvaluators?: BulkLinkedEvaluator[];
  guidelinesTitle: string;
  guidelinesIntro: string;
  sampleFilenameBase: string; // e.g. "llm_items"
  onClose: () => void;
  onSuccess: (count: number, withAnnotations: boolean) => void;
};

export function BulkUploadItemsDialog({
  isOpen,
  accessToken,
  taskUuid,
  linkedEvaluators = [],
  contentColumns,
  sampleRows,
  sampleFallbackEvaluators = [],
  guidelinesTitle,
  guidelinesIntro,
  sampleFilenameBase,
  onClose,
  onSuccess,
}: BulkUploadItemsDialogProps) {
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
  // this also breaks the `<evalName>/<varName>` variable columns, so it has to
  // block regardless of whether the user is uploading annotations.
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

  // Re-parse when the annotation toggle changes (column requirements differ).
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
        const descriptionKey = findHeaderKey(headers, DESCRIPTION_HEADERS);
        const contentKeys = contentColumns.map((col) => ({
          col,
          key: findHeaderKey(headers, col.headerCandidates),
        }));
        const missingContent = contentKeys.filter((ck) => !ck.key);
        if (!nameKey || missingContent.length > 0) {
          const required = ["name", ...contentColumns.map((c) => c.csvColumn)]
            .map((c) => `"${c}"`)
            .join(", ");
          setParseError(
            `CSV must include ${required} columns. Found: ${headers.join(", ") || "(none)"}`,
          );
          return;
        }

        // Resolve a column for each evaluator variable up front.
        const variableHeaderMap = new Map<
          string,
          {
            evaluator: BulkLinkedEvaluator;
            varName: string;
            columnKey: string;
          }[]
        >();
        const missingColumns: string[] = [];
        for (const e of evaluatorsWithVariables) {
          const slots: {
            evaluator: BulkLinkedEvaluator;
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
          const missingAnnotationCols: string[] = [];
          for (const meta of annotationEvaluatorsMeta) {
            const valueHeader = evaluatorValueColumn(meta.name);
            if (!headers.includes(valueHeader)) {
              missingAnnotationCols.push(valueHeader);
            }
          }
          if (missingAnnotationCols.length > 0) {
            setParseError(
              `CSV is missing annotation column(s): ${missingAnnotationCols
                .map((c) => `"${c}"`)
                .join(", ")}. Download the sample CSV above for the exact format.`,
            );
            return;
          }
        }

        const items: ParsedItem[] = [];

        for (let i = 0; i < results.data.length; i++) {
          const row = results.data[i];
          const name = (row[nameKey] ?? "").trim();
          const description = descriptionKey
            ? (row[descriptionKey] ?? "").trim()
            : "";
          const contentRaws = contentKeys.map((ck) =>
            (row[ck.key as string] ?? "").trim(),
          );

          const anyVariableValue = evaluatorsWithVariables.some((e) =>
            (variableHeaderMap.get(e.uuid) ?? []).some(
              (slot) => (row[slot.columnKey] ?? "").trim() !== "",
            ),
          );
          if (
            !name &&
            contentRaws.every((c) => !c) &&
            !anyVariableValue
          )
            continue;

          if (!name) {
            setParseError(`Row ${i + 1}: "name" is required.`);
            return;
          }

          // Content columns (all required).
          const content: Record<string, unknown> = {};
          let contentError: string | null = null;
          for (let c = 0; c < contentColumns.length; c++) {
            const col = contentColumns[c];
            const raw = contentRaws[c];
            if (!raw) {
              contentError = `Row ${i + 1}: "${col.csvColumn}" is required.`;
              break;
            }
            const parsed = col.parse(raw, i);
            if ("error" in parsed) {
              contentError = parsed.error;
              break;
            }
            content[col.payloadKey] = parsed.value;
          }
          if (contentError) {
            setParseError(contentError);
            return;
          }

          const refs: EvaluatorRef[] = [];
          let rowError: string | null = null;
          for (const e of evaluatorsWithVariables) {
            const slots = variableHeaderMap.get(e.uuid) ?? [];
            const variableValues: Record<string, string> = {};
            for (const slot of slots) {
              const raw = (row[slot.columnKey] ?? "").trim();
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
              const rawValue = (row[valueHeader] ?? "").trim();
              const rawReasoning = (row[reasoningHeader] ?? "").trim();
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

          items.push({ name, description, content, evaluators: refs, annotations });
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
        const evaluator_variables: Record<string, Record<string, string>> = {};
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
            ...(p.description ? { description: p.description } : {}),
            ...p.content,
            evaluator_variables,
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

  const buildSampleCsv = (): string => {
    const evaluators =
      linkedEvaluators.length > 0 ? linkedEvaluators : sampleFallbackEvaluators;
    const variableColumns: { evalName: string; varName: string }[] = [];
    for (const e of evaluators) {
      for (const v of e.variables) {
        variableColumns.push({ evalName: e.name, varName: v.name });
      }
    }
    const headerCells = [
      "name",
      "description",
      ...contentColumns.map((c) => csvEscape(c.csvColumn)),
      ...variableColumns.map((c) =>
        csvEscape(variableColumnName(c.evalName, c.varName)),
      ),
      ...(uploadAnnotations
        ? evaluators.flatMap((e) => [
            csvEscape(evaluatorValueColumn(e.name)),
            csvEscape(evaluatorReasoningColumn(e.name)),
          ])
        : []),
    ];
    const lines = sampleRows.map((r) =>
      [
        csvEscape(r.name),
        csvEscape(r.description),
        ...contentColumns.map((c) => csvEscape(r.content[c.csvColumn] ?? "")),
        ...variableColumns.map(() => csvEscape(r.variableValue)),
        ...(uploadAnnotations
          ? evaluators.flatMap((e) => [
              csvEscape(sampleEvaluatorValue(e)),
              csvEscape(r.reasoning),
            ])
          : []),
      ].join(","),
    );
    return `${headerCells.join(",")}\n${lines.join("\n")}\n`;
  };

  const buildGuidelines = (): GuidelineDoc => {
    const columns: GuidelineColumn[] = [
      { name: "name", description: "Required. A unique name for the item." },
      ...contentColumns.map((c) => ({
        name: c.csvColumn,
        description: c.guidelineDescription,
        ...(c.guidelineExample ? { example: c.guidelineExample } : {}),
      })),
    ];

    for (const e of evaluatorsWithVariables) {
      for (const v of e.variables) {
        const desc = v.description ? ` — ${v.description}` : "";
        columns.push({
          name: variableColumnName(e.name, v.name),
          description: `Used for the "${e.name}" evaluator${desc}`,
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

    columns.push({
      name: "description",
      description:
        "(optional) A description of this item. Shown to annotators alongside the evaluators while they label.",
    });

    return { title: guidelinesTitle, intro: guidelinesIntro, columns };
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
  // Surface a Description column in the preview only when at least one row
  // carries a non-empty description — keeps the preview tight for the common
  // case where descriptions aren't used.
  const showDescriptionColumn = parsedItems.some(
    (p) => p.description.trim().length > 0,
  );
  const gridStyle = {
    gridTemplateColumns: [
      "minmax(96px, 140px)",
      ...(showDescriptionColumn ? ["minmax(120px, 200px)"] : []),
      ...contentColumns.map((c) => c.previewWidth),
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
        {showDescriptionColumn && (
          <div className="text-xs font-medium text-muted-foreground">
            Description
          </div>
        )}
        {contentColumns.map((c) => (
          <div
            key={`h-${c.payloadKey}`}
            className="text-xs font-medium text-muted-foreground"
          >
            {c.previewLabel}
          </div>
        ))}
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
              {showDescriptionColumn && (
                <div
                  className="min-w-0 max-h-24 overflow-y-auto pr-1 leading-snug text-foreground break-words whitespace-pre-wrap"
                  title={p.description || undefined}
                >
                  {p.description}
                </div>
              )}
              {contentColumns.map((c) => (
                <div key={`c-${idx}-${c.payloadKey}`} className="min-w-0">
                  {c.renderPreview(p.content[c.payloadKey])}
                </div>
              ))}
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
      buildSampleCsv={buildSampleCsv}
      sampleFilename={() =>
        uploadAnnotations
          ? `sample_${sampleFilenameBase}_with_annotations.csv`
          : `sample_${sampleFilenameBase}.csv`
      }
      buildGuidelines={buildGuidelines}
      guidelinesFilename={() =>
        uploadAnnotations
          ? `${sampleFilenameBase}_csv_guidelines_with_annotations.pdf`
          : `${sampleFilenameBase}_csv_guidelines.pdf`
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
