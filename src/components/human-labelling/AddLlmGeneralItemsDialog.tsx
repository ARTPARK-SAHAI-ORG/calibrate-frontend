"use client";

import { useEffect, useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { humaniseDetailObject } from "./bulk-upload-shared";

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
  input: string;
  output: string;
  evaluator_variables: VarValues;
};

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
    input: string;
    output: string;
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
  const [input, setInput] = useState(seed?.input ?? "");
  const [output, setOutput] = useState(seed?.output ?? "");
  const [varValues, setVarValues] = useState<VarValues>(() =>
    seedVarValues(seed?.varValues),
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset whenever the dialog opens so a fresh edit/add starts from the
  // current seed item.
  useEffect(() => {
    if (isOpen) {
      const s = initialRows?.[0];
      setUuid(s?.uuid);
      setName(s?.name ?? "");
      setInput(s?.input ?? "");
      setOutput(s?.output ?? "");
      setVarValues(seedVarValues(s?.varValues));
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialRows]);

  if (!isOpen) return null;

  const updateVar = (
    evaluatorUuid: string,
    varName: string,
    value: string,
  ) => {
    setVarValues((prev) => ({
      ...prev,
      [evaluatorUuid]: { ...(prev[evaluatorUuid] ?? {}), [varName]: value },
    }));
  };

  // Every variable on every evaluator must have a non-empty value.
  const varsComplete = evaluatorsWithVariables.every((e) =>
    e.variables.every((v) => (varValues[e.uuid]?.[v.name] ?? "").trim()),
  );
  const valid =
    !!name.trim() && !!input.trim() && !!output.trim() && varsComplete;

  const handleClose = () => {
    if (!submitting) {
      setError(null);
      onClose();
    }
  };

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
    try {
      await onSubmit([
        {
          uuid,
          name: name.trim(),
          input: input.trim(),
          output: output.trim(),
          evaluator_variables,
        },
      ]);
    } catch (err) {
      setError(
        extractApiError(
          err,
          isEdit ? "Failed to save item" : "Failed to add item",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={handleClose}
    >
      <div
        className="bg-background border border-border rounded-xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[90vh]"
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
            onClick={handleClose}
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
          <div className="w-full md:w-1/2 flex flex-col border-b md:border-b-0 md:border-r border-border overflow-y-auto p-4 md:p-6 space-y-6">
            <div>
              <label className="block text-base font-medium text-foreground mb-2">
                Name
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your item name"
                disabled={submitting}
                className="w-full h-11 px-4 rounded-lg text-base bg-background text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
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

          {/* Right: input + output boxes */}
          <div className="w-full md:w-1/2 flex flex-col bg-muted/30 overflow-y-auto p-4 md:p-6 space-y-6">
            <div>
              <label className="block text-base font-medium text-foreground mb-2">
                Input
              </label>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="The prompt or input given to the LLM"
                disabled={submitting}
                rows={8}
                className="w-full px-4 py-3 rounded-lg text-base bg-background text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-accent resize-y disabled:opacity-50"
              />
            </div>
            <div>
              <label className="block text-base font-medium text-foreground mb-2">
                Output
              </label>
              <textarea
                value={output}
                onChange={(e) => setOutput(e.target.value)}
                placeholder="The output the LLM produced"
                disabled={submitting}
                rows={8}
                className="w-full px-4 py-3 rounded-lg text-base bg-background text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-accent resize-y disabled:opacity-50"
              />
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
    </div>
  );
}
