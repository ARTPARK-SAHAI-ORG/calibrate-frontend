"use client";

import React, { useEffect, useRef, useState } from "react";
import Papa from "papaparse";
import { useHideFloatingButton } from "@/components/AppLayout";
import { apiClient } from "@/lib/api";

// Slug used by BulkUploadTestsModal for the plain-string evaluators
// shortcut. We follow the same convention here so the CSV format the
// user already knows from the Tests page works in this dialog too.
const DEFAULT_NEXT_REPLY_EVALUATOR_SLUG = "default-llm-next-reply";

// One CSV may mix next-reply rows (with `evaluators`) and tool-call rows
// (with `tool_calls`) freely; either column is optional, but every row
// must populate at least one of them.

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

type TurnObject = {
  role: string;
  content?: unknown;
  tool_calls?: unknown;
  [key: string]: unknown;
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
const EVALUATORS_HEADERS = ["evaluators"];

// CSV-escape: wrap in double quotes and double any inner double quotes.
function csvEscape(s: string): string {
  return `"${s.replace(/"/g, '""')}"`;
}

// Build a sample CSV that uses the *actual* evaluators linked to the
// current task in JSON-array form, so users can edit one of the rows
// instead of figuring the format out from scratch. Both rows share the
// same evaluator set; only the variable values differ.
function buildSampleCsv(linked: LinkedEvaluator[]): string {
  const fallback: LinkedEvaluator[] = [
    {
      uuid: "",
      name: "Correctness",
      slug: DEFAULT_NEXT_REPLY_EVALUATOR_SLUG,
      variables: [{ name: "criteria" }],
    },
  ];
  const evaluators = linked.length > 0 ? linked : fallback;

  const rows = [
    {
      name: "Greeting reply",
      conversation: [
        { role: "user", content: "What is your return policy?" },
      ],
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

  const rowEvaluatorsCell = (rowIdx: number): string => {
    const sampleValue = rows[rowIdx].sampleVariableValue;
    const arr = evaluators.map((e) => {
      if (e.variables.length === 0) return { name: e.name };
      const variables: Record<string, string> = {};
      for (const v of e.variables) {
        variables[v.name] = sampleValue;
      }
      return { name: e.name, variables };
    });
    return JSON.stringify(arr);
  };

  const header = "name,conversation_history,agent_response,evaluators";
  const lines = rows.map((r, i) =>
    [
      csvEscape(r.name),
      csvEscape(JSON.stringify(r.conversation)),
      csvEscape(r.response),
      csvEscape(rowEvaluatorsCell(i)),
    ].join(","),
  );
  return `${header}\n${lines.join("\n")}\n`;
}


type BulkUploadLlmItemsDialogProps = {
  isOpen: boolean;
  accessToken: string;
  taskUuid: string;
  linkedEvaluators: LinkedEvaluator[];
  onClose: () => void;
  onSuccess: (count: number) => void;
};

function parseApiError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const m = err.message.match(/Request failed: \d+ - (.+)$/);
  if (m) {
    try {
      const parsed = JSON.parse(m[1]);
      if (parsed && typeof parsed.detail === "string") return parsed.detail;
    } catch {
      // ignore
    }
    return m[1];
  }
  return err.message || fallback;
}

function findHeaderKey(headers: string[], candidates: string[]): string | null {
  const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, "_");
  const normalized = headers.map(norm);
  for (const cand of candidates) {
    const idx = normalized.indexOf(cand);
    if (idx >= 0) return headers[idx];
  }
  return null;
}

function turnContentString(t: TurnObject): string {
  if (typeof t.content === "string") return t.content;
  if (t.content === undefined || t.content === null) return "";
  try {
    return JSON.stringify(t.content);
  } catch {
    return String(t.content);
  }
}

function roleLabel(role: string): string {
  if (role === "user") return "User";
  if (role === "assistant") return "AI";
  if (role === "system") return "System";
  if (role === "tool") return "Tool";
  return role;
}

function rolePillClass(role: string): string {
  if (role === "user") {
    return "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20";
  }
  if (role === "assistant") {
    return "bg-purple-500/10 text-purple-600 dark:text-purple-400 border border-purple-500/20";
  }
  if (role === "system") {
    return "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/20";
  }
  if (role === "tool") {
    return "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20";
  }
  return "bg-muted text-muted-foreground border border-border";
}

// Resolve a row's `evaluators` cell to UUID-keyed refs, mirroring the
// semantics of BulkUploadTestsModal but validating against the
// evaluators linked to *this* annotation task (not the tenant-wide list).
function resolveEvaluatorsCell(
  cell: string,
  linked: LinkedEvaluator[],
): { refs: EvaluatorRef[]; errors: string[] } {
  const trimmed = cell.trim();
  const errors: string[] = [];

  if (trimmed.startsWith("[")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      return { refs: [], errors: ["evaluators is not valid JSON"] };
    }
    if (!Array.isArray(parsed)) {
      return { refs: [], errors: ["evaluators must be a JSON array"] };
    }
    if (parsed.length === 0) {
      return {
        refs: [],
        errors: ["evaluators array must contain at least one evaluator"],
      };
    }

    const refs: EvaluatorRef[] = [];
    const seenUuids = new Set<string>();
    parsed.forEach((entry, i) => {
      const label = `evaluator #${i + 1}`;
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) {
        errors.push(`${label}: must be a JSON object`);
        return;
      }
      const obj = entry as Record<string, unknown>;
      const name = typeof obj.name === "string" ? obj.name.trim() : "";
      if (!name) {
        errors.push(`${label}: missing "name"`);
        return;
      }
      const evaluator = linked.find((e) => e.name === name);
      if (!evaluator) {
        errors.push(
          `evaluator "${name}" is not linked to this task — link it first or remove it from the CSV`,
        );
        return;
      }
      if (seenUuids.has(evaluator.uuid)) {
        errors.push(`evaluator "${name}" listed more than once`);
        return;
      }
      seenUuids.add(evaluator.uuid);

      let providedVars: Record<string, unknown> = {};
      if (obj.variables !== undefined && obj.variables !== null) {
        if (typeof obj.variables !== "object" || Array.isArray(obj.variables)) {
          errors.push(`evaluator "${name}": "variables" must be an object`);
          return;
        }
        providedVars = obj.variables as Record<string, unknown>;
      }
      const expectedNames = evaluator.variables.map((v) => v.name);
      const variableValues: Record<string, string> = {};
      const missing: string[] = [];
      for (const v of evaluator.variables) {
        const raw = providedVars[v.name];
        if (typeof raw !== "string" || !raw.trim()) {
          missing.push(v.name);
          continue;
        }
        variableValues[v.name] = raw;
      }
      if (missing.length > 0) {
        errors.push(
          `evaluator "${name}": missing variable value(s) for ${missing
            .map((n) => `"${n}"`)
            .join(", ")}`,
        );
      }
      const extras = Object.keys(providedVars).filter(
        (k) => !expectedNames.includes(k),
      );
      if (extras.length > 0) {
        errors.push(
          `evaluator "${name}": unknown variable(s) ${extras
            .map((n) => `"${n}"`)
            .join(", ")}`,
        );
      }

      const ref: EvaluatorRef = { evaluator_uuid: evaluator.uuid };
      if (evaluator.variables.length > 0) {
        ref.variable_values = variableValues;
      }
      refs.push(ref);
    });
    return { refs, errors };
  }

  // Plain-string form → default LLM next-reply evaluator (resolved by
  // slug). Must be linked to this task.
  const correctness = linked.find(
    (e) => e.slug === DEFAULT_NEXT_REPLY_EVALUATOR_SLUG,
  );
  if (!correctness) {
    return {
      refs: [],
      errors: [
        `default LLM next-reply evaluator (slug "${DEFAULT_NEXT_REPLY_EVALUATOR_SLUG}") is not linked to this task — link it or use the JSON-array form`,
      ],
    };
  }
  return {
    refs: [
      {
        evaluator_uuid: correctness.uuid,
        variable_values: { criteria: trimmed },
      },
    ],
    errors: [],
  };
}

function ChatHistoryPreview({ turns }: { turns: TurnObject[] }) {
  return (
    <div className="max-h-24 overflow-y-auto pr-1 space-y-2">
      {turns.map((t, i) => {
        const role = typeof t.role === "string" ? t.role : "?";
        const content = turnContentString(t);
        return (
          <div key={`h-${i}`} className="space-y-1 leading-snug">
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

function AgentReplyPreview({ agentResponse }: { agentResponse: string }) {
  return (
    <div className="max-h-24 overflow-y-auto pr-1 leading-snug text-foreground break-words whitespace-pre-wrap">
      {agentResponse || (
        <span className="text-muted-foreground italic">(empty)</span>
      )}
    </div>
  );
}

export function BulkUploadLlmItemsDialog({
  isOpen,
  accessToken,
  taskUuid,
  linkedEvaluators,
  onClose,
  onSuccess,
}: BulkUploadLlmItemsDialogProps) {
  useHideFloatingButton(isOpen);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [parseError, setParseError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [formatHelpOpen, setFormatHelpOpen] = useState(true);

  const reset = () => {
    setCsvFile(null);
    setParsedItems([]);
    setParseError(null);
    setUploadError(null);
    setFormatHelpOpen(true);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  useEffect(() => {
    if (isOpen) reset();
  }, [isOpen]);

  useEffect(() => {
    setFormatHelpOpen(parsedItems.length === 0);
  }, [parsedItems.length]);

  if (!isOpen) return null;

  const downloadSampleCsv = () => {
    const blob = new Blob([buildSampleCsv(linkedEvaluators)], {
      type: "text/csv",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sample_llm_items.csv";
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
        const nameKey = findHeaderKey(headers, NAME_HEADERS);
        const conversationKey = findHeaderKey(headers, CONVERSATION_HEADERS);
        const responseKey = findHeaderKey(headers, RESPONSE_HEADERS);
        const evaluatorsKey = findHeaderKey(headers, EVALUATORS_HEADERS);

        if (!nameKey || !conversationKey || !responseKey || !evaluatorsKey) {
          setParseError(
            `CSV must include "name", "conversation_history", "agent_response" and "evaluators" columns. Found: ${headers.join(", ") || "(none)"}`,
          );
          return;
        }

        const items: ParsedItem[] = [];

        for (let i = 0; i < results.data.length; i++) {
          const row = results.data[i];
          const name = (row[nameKey] ?? "").trim();
          const conversationRaw = (row[conversationKey] ?? "").trim();
          const responseRaw = row[responseKey] ?? "";
          const evaluatorsRaw = (row[evaluatorsKey] ?? "").trim();

          if (!name && !conversationRaw && !responseRaw && !evaluatorsRaw)
            continue;
          if (!name) {
            setParseError(`Row ${i + 1}: "name" is required.`);
            return;
          }
          if (!conversationRaw) {
            setParseError(`Row ${i + 1}: "conversation_history" is required.`);
            return;
          }
          if (!evaluatorsRaw) {
            setParseError(`Row ${i + 1}: "evaluators" is required.`);
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

          const resolved = resolveEvaluatorsCell(
            evaluatorsRaw,
            linkedEvaluators,
          );
          if (resolved.errors.length > 0) {
            setParseError(`Row ${i + 1}: ${resolved.errors[0]}`);
            return;
          }

          items.push({
            name,
            chat_history: turns,
            agent_response:
              typeof responseRaw === "string"
                ? responseRaw
                : String(responseRaw),
            evaluators: resolved.refs,
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

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const f = e.dataTransfer.files?.[0];
    if (f) handleFile(f);
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
              <button
                type="button"
                onClick={() => setFormatHelpOpen((o) => !o)}
                className="mb-3 inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                aria-expanded={formatHelpOpen}
              >
                <svg
                  className={`w-3.5 h-3.5 transition-transform ${
                    formatHelpOpen ? "rotate-90" : ""
                  }`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.25 4.5l7.5 7.5-7.5 7.5"
                  />
                </svg>
                {formatHelpOpen
                  ? "Hide CSV format details"
                  : "Show CSV format details"}
              </button>
            )}

            {formatHelpOpen && (
              <div className="text-xs text-muted-foreground mb-3 leading-relaxed space-y-2">
                <p>Each row creates one LLM annotation item:</p>
                <ul className="list-disc pl-5 space-y-1.5">
                  <li>
                    <code className="font-mono text-foreground">name</code> — a
                    unique item name
                  </li>
                  <li>
                    <code className="font-mono text-foreground">
                      conversation_history
                    </code>{" "}
                    — JSON array representing a conversation up to (but not
                    including) the agent response being judged. Each turn should
                    have <code className="font-mono text-foreground">role</code>{" "}
                    and{" "}
                    <code className="font-mono text-foreground">content</code>{" "}
                    fields.
                  </li>
                  <li>
                    <code className="font-mono text-foreground">
                      agent_response
                    </code>{" "}
                    — the agent response being judged
                  </li>
                  <li>
                    <code className="font-mono text-foreground">
                      evaluators
                    </code>{" "}
                    — a JSON array{" "}
                    <code className="font-mono text-foreground">
                      {`[{"name":"...","variables":{...}}]`}
                    </code>{" "}
                    attaching evaluators by name. Evaluator names must match
                    evaluators linked to this task and if any evaluator requires
                    variables, the{" "}
                    <code className="font-mono text-foreground">variables</code>{" "}
                    must be filled for each such evaluator for each row.
                  </li>
                </ul>
              </div>
            )}

            {/* Drop zone */}
            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer ${
                csvFile
                  ? "border-foreground/30 bg-muted/30"
                  : "border-border hover:border-muted-foreground"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                onChange={(e) => handleFile(e.target.files?.[0] || null)}
                className="hidden"
              />
              {csvFile ? (
                <div className="flex items-center justify-center gap-2">
                  <svg
                    className="w-5 h-5 text-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z"
                    />
                  </svg>
                  <span className="text-sm font-medium text-foreground">
                    {csvFile.name}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCsvFile(null);
                      setParsedItems([]);
                      setParseError(null);
                      setUploadError(null);
                      if (fileInputRef.current) fileInputRef.current.value = "";
                    }}
                    aria-label="Remove file"
                    className="ml-1 text-muted-foreground hover:text-foreground"
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
                        d="M6 18L18 6M6 6l12 12"
                      />
                    </svg>
                  </button>
                </div>
              ) : (
                <>
                  <svg
                    className="w-8 h-8 text-muted-foreground mx-auto mb-2"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                    />
                  </svg>
                  <p className="text-sm text-foreground font-medium">
                    Drop a CSV here or click to browse
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Up to a few thousand rows is fine
                  </p>
                </>
              )}
            </div>

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
                <div className="grid grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)] gap-3 px-4 py-2 border-b border-border bg-muted/30">
                  <div className="text-xs font-medium text-muted-foreground">
                    Name
                  </div>
                  <div className="text-xs font-medium text-muted-foreground">
                    Chat history
                  </div>
                  <div className="text-xs font-medium text-muted-foreground">
                    AI reply
                  </div>
                </div>
                <div className="max-h-[15rem] overflow-y-auto divide-y divide-border">
                  {parsedItems.slice(0, 50).map((p, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-[160px_minmax(0,1fr)_minmax(0,1fr)] gap-3 px-4 py-2 text-xs items-start"
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
