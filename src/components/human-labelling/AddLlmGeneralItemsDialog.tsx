"use client";

import { useEffect, useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { FieldError } from "@/components/ui/FieldError";
import { ToolPicker, getToolParams } from "@/components/ToolPicker";
import type { AvailableTool } from "@/components/ToolPicker";
import { CreateToolFlow } from "@/components/tools/CreateToolFlow";
import { getDefaultHeaders } from "@/lib/api";
import { useAccessToken } from "@/hooks/useAccessToken";
import { reportError } from "@/lib/reportError";
import { normalizeToolCall } from "@/components/test-results/shared";
import { humaniseDetailObject } from "./bulk-upload-shared";
import { parseItemNameConflictFromError } from "./itemNameConflict";
import {
  DiscardChangesDialog,
  useUnsavedCloseGuard,
} from "./unsavedCloseGuard";

export type LlmGeneralEvaluatorDef = {
  uuid: string;
  name: string;
  description?: string | null;
  variables: { name: string; description?: string; default?: string }[];
};

// Per-evaluator, per-variable values: { [evaluatorUuid]: { [varName]: value } }.
type VarValues = Record<string, Record<string, string>>;

export type LlmGeneralItemRowSubmission = {
  uuid?: string;
  name: string;
  description: string;
  input: string;
  output: string;
  /** The tool calls the agent made. Empty means the answer was text. */
  toolCalls: { tool: string; arguments: Record<string, unknown> }[];
  evaluator_variables: VarValues;
};

/** One tool call while it is being edited: values are held as the text in
 * the boxes and only turned back into real values on save. */
type DraftToolCall = {
  id: string;
  tool: string;
  params: { name: string; value: string }[];
};

/** A typed-in argument, back to a real value. Only the three words that
 * cannot be anything else are converted: true, false and null. Digits stay
 * text, because a phone number, a postcode and an account number are all
 * digits and all text, and turning them into numbers loses leading zeros
 * and breaks the match against what the agent really sent. */
function parseArgValue(text: string): unknown {
  const t = text.trim();
  if (t === "true") return true;
  if (t === "false") return false;
  if (t === "null") return null;
  return text;
}

function argValueToText(value: unknown): string {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  return JSON.stringify(value);
}

let draftIdCounter = 0;
function nextDraftId(): number {
  draftIdCounter += 1;
  return draftIdCounter;
}

function seedToolCalls(raw: unknown): DraftToolCall[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((tc, i) => {
    const { toolName, args } = normalizeToolCall(tc);
    const entries =
      args && typeof args === "object" && !Array.isArray(args)
        ? Object.entries(args as Record<string, unknown>)
        : [];
    return {
      id: `seed-${i}`,
      tool: toolName,
      params: entries.map(([name, value]) => ({
        name,
        value: argValueToText(value),
      })),
    };
  });
}

type AddLlmGeneralItemsDialogProps = {
  isOpen: boolean;
  mode?: "add" | "edit";
  // Linked evaluators with their variable definitions, used to render the
  // per-item variable inputs and seed defaults.
  evaluators?: LlmGeneralEvaluatorDef[];
  // A single item to seed the dialog with (edit / duplicate). Kept as an
  // array for backwards-compatible call sites; only the first entry is used
  // since the dialog edits one item at a time.
  initialRows?: {
    uuid: string;
    name: string;
    description?: string;
    input: string;
    output: string;
    /** The tool calls the agent made, when its answer was a tool call rather
     * than text. Editable under Output. */
    toolCalls?: unknown[];
    varValues?: VarValues;
  }[];
  onClose: () => void;
  // Receives the single edited/added item wrapped in an array so existing
  // POST/PUT call sites that map over `rows` keep working unchanged.
  onSubmit: (rows: LlmGeneralItemRowSubmission[]) => Promise<void> | void;
};

function extractApiError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const m = err.message.match(/Request failed: \d+ - ([\s\S]+)$/);
  if (m) {
    try {
      const parsed = JSON.parse(m[1]);
      if (parsed?.detail && typeof parsed.detail === "object") {
        const msg = humaniseDetailObject(parsed.detail);
        if (msg) return msg;
      }
    } catch {
      /* ignore */
    }
    return m[1];
  }
  return err.message || fallback;
}

export function AddLlmGeneralItemsDialog({
  isOpen,
  mode = "add",
  evaluators = [],
  initialRows,
  onClose,
  onSubmit,
}: AddLlmGeneralItemsDialogProps) {
  useHideFloatingButton(isOpen);
  const accessToken = useAccessToken();

  const isEdit = mode === "edit";
  const evaluatorsWithVariables = evaluators.filter(
    (e) => e.variables.length > 0,
  );

  // Seed each variable from a provided value (edit / duplicate) or its default.
  const seedVarValues = (provided?: VarValues): VarValues => {
    const out: VarValues = {};
    for (const e of evaluatorsWithVariables) {
      const evOut: Record<string, string> = {};
      for (const v of e.variables) {
        evOut[v.name] = provided?.[e.uuid]?.[v.name] ?? v.default ?? "";
      }
      out[e.uuid] = evOut;
    }
    return out;
  };

  const seed = initialRows?.[0];
  const [uuid, setUuid] = useState<string | undefined>(seed?.uuid);
  const [name, setName] = useState(seed?.name ?? "");
  const [description, setDescription] = useState(seed?.description ?? "");
  const [input, setInput] = useState(seed?.input ?? "");
  const [output, setOutput] = useState(seed?.output ?? "");
  const [toolCalls, setToolCalls] = useState<DraftToolCall[]>(() =>
    seedToolCalls(seed?.toolCalls),
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [createToolOpen, setCreateToolOpen] = useState(false);
  const [availableTools, setAvailableTools] = useState<AvailableTool[]>([]);
  const [toolsLoading, setToolsLoading] = useState(false);
  const [varValues, setVarValues] = useState<VarValues>(() =>
    seedVarValues(seed?.varValues),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);

  // Reset whenever the dialog opens so a fresh edit/add starts from the
  // current seed item.
  useEffect(() => {
    if (isOpen) {
      const s = initialRows?.[0];
      setUuid(s?.uuid);
      setName(s?.name ?? "");
      setDescription(s?.description ?? "");
      setInput(s?.input ?? "");
      setOutput(s?.output ?? "");
      setToolCalls(seedToolCalls(s?.toolCalls));
      setPickerOpen(false);
      setVarValues(seedVarValues(s?.varValues));
      setError(null);
      setNameError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialRows]);

  // Escape closes the tool list, the same as every other menu in the app.
  useEffect(() => {
    if (!pickerOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        setPickerOpen(false);
      }
    };
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [pickerOpen]);

  // The workspace tool catalogue, same source the test dialog picks from.
  // Fetched only once the dialog is open.
  useEffect(() => {
    if (!isOpen || availableTools.length > 0 || toolsLoading) return;
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    // Without the signed-in token the request is refused and the list comes
    // back empty, so wait for it rather than fetching anonymously.
    if (!backendUrl || !accessToken) return;
    let cancelled = false;
    setToolsLoading(true);
    fetch(`${backendUrl}/tools`, {
      headers: getDefaultHeaders(accessToken),
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((data: AvailableTool[]) => {
        if (!cancelled && Array.isArray(data)) setAvailableTools(data);
      })
      .catch((err) => reportError("Error fetching tools", err))
      .finally(() => {
        if (!cancelled) setToolsLoading(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, accessToken]);

  // Unsaved-changes check: any field differs from what the dialog was seeded
  // with (blank for add, the item's values for edit).
  const baseVarValues = seedVarValues(seed?.varValues);
  const isDirty =
    name.trim() !== (seed?.name ?? "").trim() ||
    description.trim() !== (seed?.description ?? "").trim() ||
    input.trim() !== (seed?.input ?? "").trim() ||
    output.trim() !== (seed?.output ?? "").trim() ||
    JSON.stringify(toolCalls.map(({ tool, params }) => ({ tool, params }))) !==
      JSON.stringify(
        seedToolCalls(seed?.toolCalls).map(({ tool, params }) => ({
          tool,
          params,
        })),
      ) ||
    evaluatorsWithVariables.some((e) =>
      e.variables.some(
        (v) =>
          (varValues[e.uuid]?.[v.name] ?? "").trim() !==
          (baseVarValues[e.uuid]?.[v.name] ?? "").trim(),
      ),
    );

  const {
    discardConfirmOpen,
    closeDiscardConfirm,
    doClose,
    attemptClose,
    handleBackdropClick,
  } = useUnsavedCloseGuard({
    isOpen,
    isDirty,
    isEdit,
    submitting,
    onClose,
    onBeforeClose: () => {
      setError(null);
      setNameError(null);
    },
  });

  if (!isOpen) return null;

  const addToolCall = (
    toolName: string,
    params: { name: string; value: string }[],
  ) => {
    setToolCalls((prev) => [
      ...prev,
      {
        id: `${toolName}-${prev.length}-${nextDraftId()}`,
        tool: toolName,
        params,
      },
    ]);
    setPickerOpen(false);
  };

  const removeToolCall = (id: string) =>
    setToolCalls((prev) => prev.filter((tc) => tc.id !== id));

  const updateToolCallParam = (id: string, paramName: string, value: string) =>
    setToolCalls((prev) =>
      prev.map((tc) =>
        tc.id === id
          ? {
              ...tc,
              params: tc.params.map((prm) =>
                prm.name === paramName ? { ...prm, value } : prm,
              ),
            }
          : tc,
      ),
    );

  const updateVar = (evaluatorUuid: string, varName: string, value: string) => {
    setVarValues((prev) => ({
      ...prev,
      [evaluatorUuid]: { ...(prev[evaluatorUuid] ?? {}), [varName]: value },
    }));
  };

  // Every variable on every evaluator must have a non-empty value.
  const varsComplete = evaluatorsWithVariables.every((e) =>
    e.variables.every((v) => (varValues[e.uuid]?.[v.name] ?? "").trim()),
  );
  // An item's answer is either text or one or more tool calls, so either
  // one satisfies Output.
  const valid =
    !!name.trim() &&
    !!input.trim() &&
    (!!output.trim() || toolCalls.length > 0) &&
    varsComplete;

  const handleSubmit = async () => {
    if (!valid || submitting) return;
    const evaluator_variables: VarValues = {};
    for (const e of evaluatorsWithVariables) {
      const evVals: Record<string, string> = {};
      for (const v of e.variables) {
        evVals[v.name] = (varValues[e.uuid]?.[v.name] ?? "").trim();
      }
      evaluator_variables[e.uuid] = evVals;
    }
    setSubmitting(true);
    setError(null);
    setNameError(null);
    try {
      await onSubmit([
        {
          uuid,
          name: name.trim(),
          description: description.trim(),
          input: input.trim(),
          output: output.trim(),
          toolCalls: toolCalls.map((tc) => ({
            tool: tc.tool,
            arguments: Object.fromEntries(
              tc.params.map((prm) => [prm.name, parseArgValue(prm.value)]),
            ),
          })),
          evaluator_variables,
        },
      ]);
    } catch (err) {
      const conflict = parseItemNameConflictFromError(err);
      if (conflict) {
        setNameError(conflict.message);
      } else {
        setError(
          extractApiError(
            err,
            isEdit ? "Failed to save item" : "Failed to add item",
          ),
        );
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={handleBackdropClick}
    >
      <div
        className="bg-background border border-border rounded-xl md:rounded-2xl w-full max-w-[90rem] h-[95vh] md:h-[85vh] mx-2 md:mx-4 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between gap-3 px-5 md:px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-foreground">
              {isEdit ? "Edit item" : "Add item"}
            </h2>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              Annotators will judge the output produced for the given input
            </p>
          </div>
          <button
            onClick={attemptClose}
            disabled={submitting}
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
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

        {/* Body — two panes: form on the left, input/output on the right. */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          {/* Left: name + evaluators (with variable inputs) — mirrors the
              AddTestDialog left column. */}
          <div className="w-full md:w-[30%] flex flex-col border-b md:border-b-0 md:border-r border-border overflow-y-auto p-4 md:p-6 space-y-6">
            <div>
              <label className="block text-base font-medium text-foreground mb-2">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (nameError) setNameError(null);
                }}
                placeholder="Your item name"
                disabled={submitting}
                className={`w-full h-11 px-4 rounded-lg text-base bg-background text-foreground placeholder:text-muted-foreground border focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 ${
                  nameError
                    ? "border-red-500 ring-1 ring-red-500/30"
                    : "border-border"
                }`}
              />
              <FieldError show={!!nameError}>{nameError}</FieldError>
            </div>

            <div>
              <label className="block text-base font-medium text-foreground mb-2">
                Description
              </label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="(Optional) What is this item about? Shown to annotators alongside the evaluators."
                disabled={submitting}
                rows={3}
                className="w-full px-4 py-2.5 rounded-lg text-base bg-background text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-accent resize-y disabled:opacity-50"
              />
            </div>

            {evaluators.length > 0 && (
              <div>
                <label className="block text-base font-medium text-foreground mb-2">
                  Evaluators
                </label>
                <div className="space-y-4">
                  {evaluators.map((e) => (
                    <div
                      key={e.uuid}
                      className="border border-border rounded-lg p-4 bg-background"
                    >
                      <div className="min-w-0 mb-3">
                        <div className="text-sm font-semibold text-foreground">
                          {e.name}
                        </div>
                        {e.description && (
                          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
                            {e.description}
                          </div>
                        )}
                      </div>
                      {e.variables.length > 0 && (
                        <div className="space-y-3">
                          {e.variables.map((v) => {
                            const placeholder =
                              v.description && v.description.length > 0
                                ? v.description
                                : v.default && v.default.length > 0
                                  ? v.default
                                  : `Enter value for {{${v.name}}}`;
                            return (
                              <div key={v.name}>
                                <div className="text-xs text-muted-foreground mb-1.5">
                                  <code className="font-mono">{`{{${v.name}}}`}</code>
                                </div>
                                <textarea
                                  value={varValues[e.uuid]?.[v.name] ?? ""}
                                  onChange={(ev) =>
                                    updateVar(e.uuid, v.name, ev.target.value)
                                  }
                                  placeholder={placeholder}
                                  disabled={submitting}
                                  rows={4}
                                  className="w-full px-4 py-3 rounded-lg text-base bg-background text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-accent resize-none disabled:opacity-50"
                                />
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right: input + output boxes shown side by side, each filling
              the full dialog height. */}
          <div className="w-full md:flex-1 flex flex-col md:flex-row bg-muted/30 min-h-0">
            <div className="flex-1 flex flex-col min-h-0 p-4 md:p-6 border-b md:border-b-0 md:border-r border-border">
              <label className="block text-base font-medium text-foreground mb-2">
                Input
              </label>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="The prompt or input given to the LLM"
                disabled={submitting}
                className="flex-1 min-h-[10rem] w-full px-4 py-3 rounded-lg text-base bg-background text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-accent resize-none disabled:opacity-50"
              />
            </div>
            <div className="flex-1 flex flex-col min-h-0 p-4 md:p-6">
              <div className="flex items-center justify-between gap-2 mb-2">
                <label className="block text-base font-medium text-foreground">
                  Output
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateToolOpen(true)}
                    disabled={submitting}
                    className="h-9 px-3 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Create tool
                  </button>
                  <div className="relative">
                    <button
                      type="button"
                      onClick={() => setPickerOpen((open) => !open)}
                      disabled={submitting}
                      className="h-9 px-3 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M12 4.5v15m7.5-7.5h-15"
                        />
                      </svg>
                      Add tool call
                    </button>
                    {pickerOpen && (
                      <>
                        {/* Click anywhere else to close, the same invisible
                          sheet the test dialog's tool menu uses. */}
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setPickerOpen(false)}
                        />
                        <div className="absolute right-0 z-50 mt-2 min-w-[280px] rounded-xl border border-border bg-background shadow-xl overflow-hidden">
                          <ToolPicker
                            availableTools={availableTools}
                            isLoading={toolsLoading}
                            onSelectInbuiltTool={(toolId) =>
                              addToolCall(toolId, [])
                            }
                            onSelectCustomTool={(tool) =>
                              addToolCall(tool.name, getToolParams(tool))
                            }
                          />
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-y-auto space-y-3 flex flex-col">
                {toolCalls.length === 0 && (
                  <textarea
                    value={output}
                    onChange={(e) => setOutput(e.target.value)}
                    placeholder="The output the LLM produced"
                    disabled={submitting}
                    className="flex-1 min-h-[10rem] w-full px-4 py-3 rounded-lg text-base bg-background text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-accent resize-none disabled:opacity-50"
                  />
                )}
                {toolCalls.map((tc) => (
                  // Same card the test dialog draws a tool call with, in the
                  // conversation tab: header row with the wrench and the tool
                  // name, remove button on the left, parameters below.
                  <div key={tc.id} className="flex w-full items-start gap-2">
                    <button
                      type="button"
                      onClick={() => removeToolCall(tc.id)}
                      disabled={submitting}
                      title="Remove tool call"
                      aria-label={`Remove ${tc.tool}`}
                      className="w-8 h-8 flex-shrink-0 rounded-lg border flex items-center justify-center cursor-pointer transition-colors bg-red-500/10 border-red-500/40 text-red-500 hover:bg-red-500/20 hover:border-red-500/60 disabled:opacity-50 disabled:cursor-not-allowed"
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
                          d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                        />
                      </svg>
                    </button>
                    <div className="flex-1 min-w-0 flex flex-col">
                      <div className="bg-muted border border-border rounded-2xl p-4">
                        <div className="flex items-center gap-2 mb-1.5">
                          <svg
                            className="w-4 h-4 text-muted-foreground"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={1.5}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"
                            />
                          </svg>
                          <span className="text-sm font-medium text-foreground">
                            {tc.tool}
                          </span>
                        </div>
                        {tc.params.length > 0 && (
                          <div className="space-y-3 mt-3">
                            {tc.params.map((prm) => (
                              <div key={prm.name}>
                                <label
                                  htmlFor={`${tc.id}-${prm.name}`}
                                  className="block text-sm font-medium text-foreground mb-1.5"
                                >
                                  {prm.name}
                                </label>
                                <input
                                  id={`${tc.id}-${prm.name}`}
                                  type="text"
                                  value={prm.value}
                                  onChange={(e) =>
                                    updateToolCallParam(
                                      tc.id,
                                      prm.name,
                                      e.target.value,
                                    )
                                  }
                                  placeholder={`Enter ${prm.name}`}
                                  disabled={submitting}
                                  className="w-full h-10 px-4 rounded-lg text-sm bg-background text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed"
                                />
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 md:px-6 py-4 border-t border-border">
          {error && (
            <div className="mr-auto rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
              {error}
            </div>
          )}
          <button
            onClick={handleSubmit}
            disabled={!valid || submitting}
            className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting
              ? isEdit
                ? "Saving..."
                : "Adding..."
              : isEdit
                ? "Save item"
                : "Add item"}
          </button>
        </div>
      </div>

      <DiscardChangesDialog
        open={discardConfirmOpen}
        onKeepEditing={closeDiscardConfirm}
        onDiscard={doClose}
      />

      {/* Writing a new tool from inside this item. It goes into the
          workspace's tool list and straight onto the item's output, the
          same as picking an existing one. */}
      <CreateToolFlow
        isOpen={createToolOpen}
        onClose={() => setCreateToolOpen(false)}
        accessToken={accessToken ?? undefined}
        knownTools={availableTools}
        onCreated={(tool, allTools) => {
          setCreateToolOpen(false);
          setAvailableTools(allTools);
          addToolCall(tool.name, getToolParams(tool));
        }}
      />
    </div>
  );
}
