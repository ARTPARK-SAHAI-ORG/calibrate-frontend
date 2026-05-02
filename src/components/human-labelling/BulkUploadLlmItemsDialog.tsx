"use client";

import { useEffect, useState } from "react";
import Papa from "papaparse";
import { apiClient } from "@/lib/api";
import {
  BulkUploadDialogShell,
  ChatHistoryPreview,
  ConversationFormatDetails,
  type TurnObject,
  findHeaderKey,
  parseApiError,
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

function buildSampleCsv(linked: LinkedEvaluator[]): string {
  const fallback: LinkedEvaluator[] = [
    {
      uuid: "",
      name: "Correctness",
      slug: null,
      variables: [{ name: "criteria" }],
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
    },
    {
      name: "Refund flow",
      conversation: [{ role: "user", content: "I was charged twice" }],
      response:
        "I'm sorry to hear that. Can you confirm the order ID so I can investigate?",
      sampleVariableValue:
        "The agent should apologize for the duplicate charge and offer to investigate the order.",
    },
  ];

  const headerCells = [
    "name",
    "conversation_history",
    "agent_response",
    ...variableColumns.map((c) =>
      csvEscape(variableColumnName(c.evalName, c.varName)),
    ),
  ];
  const lines = rows.map((r) =>
    [
      csvEscape(r.name),
      csvEscape(JSON.stringify(r.conversation)),
      csvEscape(r.response),
      ...variableColumns.map(() => csvEscape(r.sampleVariableValue)),
    ].join(","),
  );
  return `${headerCells.join(",")}\n${lines.join("\n")}\n`;
}

function AgentReplyPreview({ agentResponse }: { agentResponse: string }) {
  return (
    <div className="max-h-24 overflow-y-auto pr-1 leading-snug text-foreground break-words whitespace-pre-wrap">
      {agentResponse || (
        <span className="text-muted-foreground italic">(empty)</span>
      )}
    </div>
  );
}

type BulkUploadLlmItemsDialogProps = {
  isOpen: boolean;
  accessToken: string;
  taskUuid: string;
  linkedEvaluators: LinkedEvaluator[];
  onClose: () => void;
  onSuccess: (count: number) => void;
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

  const reset = () => {
    setCsvFile(null);
    setParsedItems([]);
    setParseError(null);
    setUploadError(null);
  };

  useEffect(() => {
    if (isOpen) reset();
  }, [isOpen]);

  const evaluatorsWithVariables = linkedEvaluators.filter(
    (e) => e.variables.length > 0,
  );

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

          items.push({
            name,
            chat_history: turns,
            agent_response: responseRaw,
            evaluators: refs,
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
    setIsUploading(true);
    setUploadError(null);
    try {
      await apiClient(`/annotation-tasks/${taskUuid}/items`, accessToken, {
        method: "POST",
        body: {
          items: parsedItems.map((p) => {
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
            return {
              payload: {
                name: p.name,
                chat_history: p.chat_history,
                agent_response: p.agent_response,
                evaluator_variables,
              },
            };
          }),
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
      <p>Each row creates one LLM annotation item:</p>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>
          <code className="font-mono text-foreground">name</code> — a unique
          item name
        </li>
        <li>
          <code className="font-mono text-foreground">conversation_history</code>{" "}
          — JSON array representing a conversation up to (but not including)
          the agent response being judged.
          <ConversationFormatDetails
            example={
              '[{"role":"user","content":"What is your return policy?"},{"role":"assistant","content":"You can return any item within 30 days."},{"role":"user","content":"What about defective items?"}]'
            }
          />
        </li>
        <li>
          <code className="font-mono text-foreground">agent_response</code> —
          the agent response being judged
        </li>
        {evaluatorsWithVariables.flatMap((e) =>
          e.variables.map((v) => (
            <li key={`${e.uuid}-${v.name}`}>
              <code className="font-mono text-foreground">
                {variableColumnName(e.name, v.name)}
              </code>
              {v.description ? ` — ${v.description}` : ""} (used for{" "}
              <a
                href={`/evaluators/${e.uuid}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-1.5 py-0.5 rounded-full bg-accent text-accent-foreground text-[10px] font-medium hover:opacity-80 transition-opacity cursor-pointer"
              >
                {e.name}
              </a>
              )
            </li>
          )),
        )}
      </ul>
    </>
  );

  const variableColumns = evaluatorsWithVariables.flatMap((e) =>
    e.variables.map((v) => ({
      evaluatorUuid: e.uuid,
      varName: v.name,
      header: variableColumnName(e.name, v.name),
    })),
  );
  // Use fixed minimum widths per column so the table can grow wider than
  // the dialog and scroll horizontally when there are many variables.
  const gridStyle = {
    gridTemplateColumns: [
      "160px",
      "minmax(220px,1fr)",
      "minmax(220px,1fr)",
      ...variableColumns.map(() => "minmax(220px,1fr)"),
    ].join(" "),
  };

  const itemsPreview = (
    <div className="space-y-2">
      <p className="text-sm font-medium text-foreground">
        {parsedItems.length}{" "}
        {parsedItems.length === 1 ? "item" : "items"} ready to upload
      </p>
      <div className="border border-border rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <div
            className="grid gap-3 px-4 py-2 border-b border-border bg-muted/30"
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
          </div>
          <div className="max-h-[15rem] overflow-y-auto divide-y divide-border">
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
                        {value || (
                          <span className="text-muted-foreground italic">
                            (empty)
                          </span>
                        )}
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

  return (
    <BulkUploadDialogShell
      isOpen={isOpen}
      title="Bulk upload items"
      buildSampleCsv={() => buildSampleCsv(linkedEvaluators)}
      sampleFilename="sample_llm_items.csv"
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
