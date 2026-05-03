"use client";

import { useEffect, useState } from "react";
import Papa from "papaparse";
import { apiClient } from "@/lib/api";
import {
  AnnotationOptIn,
  BulkUploadDialogShell,
  ChatHistoryPreview,
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
  sampleEvaluatorValue,
  useAnnotators,
} from "./bulk-upload-shared";

type EvaluatorVariableDef = {
  name: string;
  description?: string;
  default?: string;
};

export type LinkedEvaluator = {
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

type ParsedItem = {
  name: string;
  chat_history: TurnObject[];
  agent_response: string;
  evaluators: EvaluatorRef[];
  annotations: ParsedAnnotation[];
};

const NAME_HEADERS = ["name", "title"];
const CONVERSATION_HEADERS = [
  "conversation_history",
  "conversation",
  "chat_history",
  "chat_history_json",
];
const RESPONSE_HEADERS = [
  "agent_response",
  "response",
  "assistant_response",
  "ai_response",
];

function csvEscape(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

// Column header for an evaluator variable, e.g. "Correctness/criteria".
// One column per variable per evaluator — keeps the CSV flat instead of
// asking users to hand-author JSON in a single "evaluators" cell.
function variableColumnName(evalName: string, varName: string): string {
  return `${evalName}/${varName}`;
}

function buildSampleCsv(
  linked: LinkedEvaluator[],
  includeAnnotations: boolean,
): string {
  const fallback: LinkedEvaluator[] = [
    {
      uuid: "",
      name: "Correctness",
      slug: null,
      variables: [{ name: "criteria" }],
      output_type: "binary",
      scale_min: null,
      scale_max: null,
    },
  ];
  const evaluators = linked.length > 0 ? linked : fallback;
  const variableColumns: { evalName: string; varName: string }[] = [];
  for (const e of evaluators) {
    for (const v of e.variables) {
      variableColumns.push({ evalName: e.name, varName: v.name });
    }
  }

  const rows = [
    {
      name: "Greeting reply",
      conversation: [{ role: "user", content: "What is your return policy?" }],
      response: "You can return any item within 30 days for a full refund.",
      sampleVariableValue:
        "The agent should clearly explain the return policy in a helpful and friendly tone.",
      sampleReasoning:
        "The agent answered the policy clearly and politely.",
    },
    {
      name: "Refund flow",
      conversation: [{ role: "user", content: "I was charged twice" }],
      response:
        "I'm sorry to hear that. Can you confirm the order ID so I can investigate?",
      sampleVariableValue:
        "The agent should apologize for the duplicate charge and offer to investigate the order.",
      sampleReasoning: "",
    },
  ];

  const headerCells = [
    "name",
    "conversation_history",
    "agent_response",
    ...variableColumns.map((c) =>
      csvEscape(variableColumnName(c.evalName, c.varName)),
    ),
    ...(includeAnnotations
      ? evaluators.flatMap((e) => [
          csvEscape(evaluatorValueColumn(e.name)),
          csvEscape(evaluatorReasoningColumn(e.name)),
        ])
      : []),
  ];
  const lines = rows.map((r) =>
    [
      csvEscape(r.name),
      csvEscape(JSON.stringify(r.conversation)),
      csvEscape(r.response),
      ...variableColumns.map(() => csvEscape(r.sampleVariableValue)),
      ...(includeAnnotations
        ? evaluators.flatMap((e) => [
            csvEscape(sampleEvaluatorValue(e)),
            csvEscape(r.sampleReasoning),
          ])
        : []),
    ].join(","),
  );
  return `${headerCells.join(",")}\n${lines.join("\n")}\n`;
}

function AgentReplyPreview({ agentResponse }: { agentResponse: string }) {
  return (
    <div className="max-h-24 overflow-y-auto pr-1 leading-snug text-foreground break-words whitespace-pre-wrap">
      {agentResponse}
    </div>
  );
}

type BulkUploadLlmItemsDialogProps = {
  isOpen: boolean;
  accessToken: string;
  taskUuid: string;
  linkedEvaluators: LinkedEvaluator[];
  onClose: () => void;
  onSuccess: (count: number, withAnnotations: boolean) => void;
};

export function BulkUploadLlmItemsDialog({
  isOpen,
  accessToken,
  taskUuid,
  linkedEvaluators,
  onClose,
  onSuccess,
}: BulkUploadLlmItemsDialogProps) {
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

  const annotationEvaluatorsMeta: EvaluatorMeta[] = linkedEvaluators.map(
    (e) => ({
      uuid: e.uuid,
      name: e.name,
      output_type: e.output_type,
      scale_min: e.scale_min,
      scale_max: e.scale_max,
    }),
  );

  // Evaluators without a usable output_type (no live version, or live
  // version with neither binary nor rating output) can't be annotated
  // here — the parser would silently drop their column and produce a
  // half-labelled batch. Block the annotation flow until that's fixed
  // upstream rather than failing later.
  const evaluatorsMissingOutputType = annotationEvaluatorsMeta.filter(
    (e) => e.output_type !== "binary" && e.output_type !== "rating",
  );

  // Two linked evaluators with the same name produce duplicate CSV
  // headers — for LLM items this also breaks the always-present
  // `<evalName>/<varName>` variable columns, so it has to block
  // regardless of whether the user is uploading annotations.
  const duplicateNames = duplicateEvaluatorNames(annotationEvaluatorsMeta);

  const evaluatorsWithVariables = linkedEvaluators.filter(
    (e) => e.variables.length > 0,
  );

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
        const conversationKey = findHeaderKey(headers, CONVERSATION_HEADERS);
        const responseKey = findHeaderKey(headers, RESPONSE_HEADERS);

        if (!nameKey || !conversationKey || !responseKey) {
          setParseError(
            `CSV must include "name", "conversation_history" and "agent_response" columns. Found: ${headers.join(", ") || "(none)"}`,
          );
          return;
        }

        const variableHeaderMap = new Map<
          string,
          { evaluator: LinkedEvaluator; varName: string; columnKey: string }[]
        >();
        const missingColumns: string[] = [];
        for (const e of evaluatorsWithVariables) {
          const slots: {
            evaluator: LinkedEvaluator;
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
              .join(
                ", ",
              )}. Download the sample CSV above for the exact format.`,
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
                .join(
                  ", ",
                )}. Download the sample CSV above for the exact format.`,
            );
            return;
          }
        }

        const items: ParsedItem[] = [];

        for (let i = 0; i < results.data.length; i++) {
          const row = results.data[i];
          const name = (row[nameKey] ?? "").trim();
          const conversationRaw = (row[conversationKey] ?? "").trim();
          const responseRaw = (row[responseKey] ?? "").trim();

          const anyVariableValue = evaluatorsWithVariables.some((e) =>
            (variableHeaderMap.get(e.uuid) ?? []).some(
              (slot) => (row[slot.columnKey] ?? "").trim() !== "",
            ),
          );
          if (!name && !conversationRaw && !responseRaw && !anyVariableValue)
            continue;

          if (!name) {
            setParseError(`Row ${i + 1}: "name" is required.`);
            return;
          }
          if (!conversationRaw) {
            setParseError(`Row ${i + 1}: "conversation_history" is required.`);
            return;
          }
          if (!responseRaw) {
            setParseError(`Row ${i + 1}: "agent_response" is required.`);
            return;
          }

          let conversation: unknown;
          try {
            conversation = JSON.parse(conversationRaw);
          } catch {
            setParseError(
              `Row ${i + 1}: "conversation_history" must be valid JSON. Wrap the JSON in double quotes and escape inner double quotes by doubling them.`,
            );
            return;
          }
          if (!Array.isArray(conversation) || conversation.length === 0) {
            setParseError(
              `Row ${i + 1}: "conversation_history" must be a non-empty array of turn objects.`,
            );
            return;
          }
          for (let j = 0; j < conversation.length; j++) {
            const t = conversation[j];
            if (
              !t ||
              typeof t !== "object" ||
              typeof (t as TurnObject).role !== "string"
            ) {
              setParseError(
                `Row ${i + 1}, turn ${j + 1}: each turn must be an object with a string "role".`,
              );
              return;
            }
          }
          const turns = conversation as TurnObject[];

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
            refs.push({
              evaluator_uuid: e.uuid,
              variable_values: variableValues,
            });
          }
          if (rowError) {
            setParseError(rowError);
            return;
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
            name,
            chat_history: turns,
            agent_response: responseRaw,
            evaluators: refs,
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
        const evaluator_variables: Record<
          string,
          Record<string, string>
        > = {};
        for (const ref of p.evaluators) {
          if (ref.variable_values) {
            evaluator_variables[ref.evaluator_uuid] = {
              ...ref.variable_values,
            };
          }
        }
        const annotationsObj = uploadAnnotations
          ? buildItemAnnotationsPayload(p.annotations)
          : undefined;
        return {
          payload: {
            name: p.name,
            chat_history: p.chat_history,
            agent_response: p.agent_response,
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

  const buildGuidelines = (): GuidelineDoc => {
    const columns: GuidelineColumn[] = [
      {
        name: "name",
        description: "A unique item name.",
      },
      {
        name: "conversation_history",
        description:
          'A JSON array of chat messages that represents the conversation that has happened so far, before the agent response being judged. Each message is an object with a "role" and "content" field.\n\nrole — either "user" or "assistant"\ncontent — the message said by that role',
        example: `[
  {"role": "user", "content": "What is your return policy?"},
  {"role": "assistant", "content": "You can return any item within 30 days."}
]`,
      },
      {
        name: "agent_response",
        description: "The agent response being judged.",
      },
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

    return {
      title: "Bulk upload — LLM labelling items",
      intro: "Upload a CSV with the following columns. Each row creates one LLM annotation item.",
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
  // Annotation columns shown only when uploadAnnotations is on. Two columns
  // per evaluator (value + reasoning) so the user can verify everything in
  // the CSV landed correctly before hitting upload.
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
  // Use fixed minimum widths per column so the table can grow wider than
  // the dialog and scroll horizontally when there are many variables.
  const gridStyle = {
    gridTemplateColumns: [
      "160px",
      "minmax(220px,1fr)",
      "minmax(220px,1fr)",
      ...variableColumns.map(() => "minmax(220px,1fr)"),
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
            style={gridStyle}
          >
            <div className="text-xs font-medium text-muted-foreground">
              Name
            </div>
            <div className="text-xs font-medium text-muted-foreground">
              Chat history
            </div>
            <div className="text-xs font-medium text-muted-foreground">
              AI reply
            </div>
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
                  className="grid gap-3 px-4 py-2 text-xs items-start"
                  style={gridStyle}
                >
                  <div className="truncate text-foreground" title={p.name}>
                    {p.name}
                  </div>
                  <div className="min-w-0">
                    <ChatHistoryPreview turns={p.chat_history} />
                  </div>
                  <div className="min-w-0">
                    <AgentReplyPreview agentResponse={p.agent_response} />
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
        </div>
      </div>
    </div>
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
            {duplicateNames.map((n) => `"${n}"`).join(", ")}). Their
            variable and annotation columns would collide in the CSV —
            rename one on the evaluators page before uploading.
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
          ? "sample_llm_items_with_annotations.csv"
          : "sample_llm_items.csv"
      }
      buildGuidelines={buildGuidelines}
      guidelinesFilename={() =>
        uploadAnnotations
          ? "llm_items_csv_guidelines_with_annotations.pdf"
          : "llm_items_csv_guidelines.pdf"
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
