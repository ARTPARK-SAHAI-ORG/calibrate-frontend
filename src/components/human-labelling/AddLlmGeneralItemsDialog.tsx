"use client";

import { useEffect, useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { humaniseDetailObject } from "./bulk-upload-shared";

export type LlmGeneralEvaluatorDef = {
  uuid: string;
  name: string;
  variables: { name: string; description?: string; default?: string }[];
};

// Per-evaluator, per-variable values: { [evaluatorUuid]: { [varName]: value } }.
type VarValues = Record<string, Record<string, string>>;

type LlmGeneralRowDraft = {
  id: string;
  uuid?: string; // present in edit mode; undefined for new rows
  name: string;
  input: string;
  output: string;
  varValues: VarValues;
};

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
  initialRows?: {
    uuid: string;
    name: string;
    input: string;
    output: string;
    varValues?: VarValues;
  }[];
  onClose: () => void;
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

function makeId(): string {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
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
  const hasVariables = evaluatorsWithVariables.length > 0;

  // Build the variable-value map for a row, seeding each variable from a
  // provided value (edit/duplicate) or the variable's default.
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

  const newRow = (): LlmGeneralRowDraft => ({
    id: makeId(),
    name: "",
    input: "",
    output: "",
    varValues: seedVarValues(),
  });

  const buildRows = (): LlmGeneralRowDraft[] =>
    initialRows && initialRows.length > 0
      ? initialRows.map((r) => ({
          id: r.uuid,
          uuid: r.uuid,
          name: r.name,
          input: r.input,
          output: r.output,
          varValues: seedVarValues(r.varValues),
        }))
      : [newRow()];

  const [rows, setRows] = useState<LlmGeneralRowDraft[]>(buildRows);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset rows whenever the dialog opens (so a fresh edit starts from the
  // latest selected items, and a reopened add starts blank).
  useEffect(() => {
    if (isOpen) {
      setRows(buildRows());
      setError(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, initialRows]);

  if (!isOpen) return null;

  const updateRow = (id: string, patch: Partial<LlmGeneralRowDraft>) => {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const updateVar = (
    id: string,
    evaluatorUuid: string,
    varName: string,
    value: string,
  ) => {
    setRows((prev) =>
      prev.map((r) =>
        r.id === id
          ? {
              ...r,
              varValues: {
                ...r.varValues,
                [evaluatorUuid]: {
                  ...(r.varValues[evaluatorUuid] ?? {}),
                  [varName]: value,
                },
              },
            }
          : r,
      ),
    );
  };

  const removeRow = (id: string) => {
    setRows((prev) =>
      prev.length === 1 ? prev : prev.filter((r) => r.id !== id),
    );
  };

  const addRow = () => {
    setRows((prev) => [...prev, newRow()]);
  };

  // A row's variable values are complete when every variable on every
  // evaluator has a non-empty value (mirrors the bulk CSV requirement).
  const rowVarsComplete = (r: LlmGeneralRowDraft): boolean =>
    evaluatorsWithVariables.every((e) =>
      e.variables.every((v) => (r.varValues[e.uuid]?.[v.name] ?? "").trim()),
    );

  const validRows: LlmGeneralItemRowSubmission[] = rows
    .filter(
      (r) =>
        r.name.trim() &&
        r.input.trim() &&
        r.output.trim() &&
        rowVarsComplete(r),
    )
    .map((r) => {
      const evaluator_variables: VarValues = {};
      for (const e of evaluatorsWithVariables) {
        const evVals: Record<string, string> = {};
        for (const v of e.variables) {
          evVals[v.name] = (r.varValues[e.uuid]?.[v.name] ?? "").trim();
        }
        evaluator_variables[e.uuid] = evVals;
      }
      return {
        uuid: r.uuid,
        name: r.name.trim(),
        input: r.input.trim(),
        output: r.output.trim(),
        evaluator_variables,
      };
    });

  const handleClose = () => {
    if (!submitting) {
      setError(null);
      onClose();
    }
  };

  const handleSubmit = async () => {
    if (validRows.length === 0 || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onSubmit(validRows);
    } catch (err) {
      setError(
        extractApiError(
          err,
          isEdit ? "Failed to save items" : "Failed to add items",
        ),
      );
    } finally {
      setSubmitting(false);
    }
  };

  const inputClasses =
    "w-full min-h-9 px-3 py-2 rounded-md text-sm border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 resize-y";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={handleClose}
    >
      <div
        className="bg-background border border-border rounded-xl w-full max-w-3xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 md:px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-foreground">
              {isEdit ? "Edit items" : "Add items"}
            </h2>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              {isEdit
                ? "Update the name, input, and output for each item"
                : "Annotators will judge the output produced for the given input"}
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

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-4">
          {rows.map((row, idx) => (
            <div
              key={row.id}
              className="rounded-xl border border-border p-4 space-y-3 relative"
            >
              {!isEdit && rows.length > 1 && (
                <button
                  onClick={() => removeRow(row.id)}
                  disabled={submitting}
                  className="absolute top-3 right-3 w-7 h-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                  aria-label={`Remove item ${idx + 1}`}
                  title="Remove this item"
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
              )}

              <div className="space-y-1">
                <label className="block text-xs font-medium text-muted-foreground">
                  Name
                </label>
                <input
                  type="text"
                  value={row.name}
                  onChange={(e) => updateRow(row.id, { name: e.target.value })}
                  placeholder="e.g. Case 1"
                  disabled={submitting}
                  className="w-full h-9 px-3 rounded-md text-sm border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-muted-foreground">
                    Input
                  </label>
                  <textarea
                    value={row.input}
                    onChange={(e) =>
                      updateRow(row.id, { input: e.target.value })
                    }
                    placeholder="The prompt or input given to the LLM"
                    disabled={submitting}
                    rows={3}
                    className={inputClasses}
                  />
                </div>
                <div className="space-y-1">
                  <label className="block text-xs font-medium text-muted-foreground">
                    Output
                  </label>
                  <textarea
                    value={row.output}
                    onChange={(e) =>
                      updateRow(row.id, { output: e.target.value })
                    }
                    placeholder="The output the LLM produced"
                    disabled={submitting}
                    rows={3}
                    className={inputClasses}
                  />
                </div>
              </div>

              {hasVariables && (
                <div className="space-y-3 border-t border-border pt-3">
                  <p className="text-xs font-medium text-muted-foreground">
                    Evaluator variables
                  </p>
                  {evaluatorsWithVariables.map((e) => (
                    <div key={e.uuid} className="space-y-2">
                      <p className="text-xs font-semibold text-foreground">
                        {e.name}
                      </p>
                      {e.variables.map((v) => (
                        <div key={v.name} className="space-y-1">
                          <label className="block text-[11px] font-mono text-muted-foreground">
                            {`{{${v.name}}}`}
                            {v.description ? ` — ${v.description}` : ""}
                          </label>
                          <textarea
                            value={row.varValues[e.uuid]?.[v.name] ?? ""}
                            onChange={(ev) =>
                              updateVar(row.id, e.uuid, v.name, ev.target.value)
                            }
                            placeholder={`Value for ${v.name}`}
                            disabled={submitting}
                            rows={2}
                            className={inputClasses}
                          />
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}

          {!isEdit && (
            <button
              onClick={addRow}
              disabled={submitting}
              className="w-full h-10 rounded-md text-sm font-medium border border-dashed border-border bg-background hover:bg-muted/50 text-muted-foreground hover:text-foreground transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-1.5"
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
                  d="M12 4.5v15m7.5-7.5h-15"
                />
              </svg>
              Add another item
            </button>
          )}

          {error && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
              {error}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 md:gap-3 px-5 md:px-6 py-4 border-t border-border">
          <div className="flex items-center gap-2 md:gap-3">
            <button
              onClick={handleClose}
              disabled={submitting}
              className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium border border-border bg-background dark:bg-muted hover:bg-muted/50 dark:hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmit}
              disabled={validRows.length === 0 || submitting}
              className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {submitting
                ? isEdit
                  ? "Saving..."
                  : "Adding..."
                : isEdit
                  ? validRows.length > 1
                    ? `Save ${validRows.length} items`
                    : "Save item"
                  : validRows.length > 1
                    ? `Add ${validRows.length} items`
                    : "Add item"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
