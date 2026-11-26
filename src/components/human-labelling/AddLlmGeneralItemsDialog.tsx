"use client";

import { PendingToolCallEvaluatorCard } from "./PendingToolCallEvaluatorCard";
import {
  TextVersionsEditor,
  sameExtras,
  versionsComplete,
} from "./TextVersionsEditor";
import type { TurnExtras } from "@/lib/messageVersions";
import { useEffect, useRef, useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { Tooltip } from "@/components/Tooltip";
import { TrashIcon } from "@/components/icons";
import { FieldError } from "@/components/ui/FieldError";
import {
  DialogNavHeader,
  ErrorNote,
  type MetadataEntry,
} from "@/components/ui";
import {
  ToolPicker,
  getToolParams,
  type ToolCallParam,
} from "@/components/ToolPicker";
import type { AvailableTool } from "@/components/ToolPicker";
import { CreateToolFlow } from "@/components/tools/CreateToolFlow";
import {
  ToolCallExpectationsEditor,
  selectedToolsHaveInvalidParams,
  selectedToolsToCalls,
  toolCallsToSelectedTools,
  useToolCallExpectations,
  type ExpectedToolCall,
} from "@/components/ToolCallExpectationsEditor";
import { OpenToolButton } from "@/components/tools/OpenToolButton";
import { mergeFlatParams } from "@/lib/toolEditsInForm";
import { evaluatorFitsItem } from "@/lib/labellingItem";
import { getDefaultHeaders } from "@/lib/api";
import { useAccessToken } from "@/hooks/useAccessToken";
import { reportError } from "@/lib/reportError";
import {
  ResizeHandle,
  normalizeToolCall,
} from "@/components/test-results/shared";
import { useSavedColumnWidth } from "@/hooks/useSavedColumnWidth";
import { humaniseDetailObject } from "./bulk-upload-shared";
import {
  MetadataFieldsEditor,
  metadataRowErrors,
  metadataToRows,
  rowsToMetadata,
  type MetadataRow,
} from "./MetadataFieldsEditor";
import { parseItemNameConflictFromError } from "./itemNameConflict";
import {
  argumentRows,
  isPlainObject,
  paramsToArgs,
  restoreToolCalls,
  typeArguments,
  EXPECTED_TOOL_CALLS_HELP,
} from "./itemConversation";
import {
  DiscardChangesDialog,
  useUnsavedCloseGuard,
  type ItemStepProps,
  ViewItemButton,
} from "./unsavedCloseGuard";

export type LlmGeneralEvaluatorDef = {
  uuid: string;
  name: string;
  description?: string | null;
  evaluator_type?: string;
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
  /** The heading and other versions of the input and of the output. */
  inputExtras: TurnExtras;
  outputExtras: TurnExtras;
  /** The tool calls the agent made. Empty means the answer was text. */
  toolCalls: {
    tool: string;
    arguments: Record<string, unknown>;
    output?: unknown;
  }[];
  /** The tool calls the agent should have made. Empty means none given. */
  expectedToolCalls: ExpectedToolCall[];
  evaluator_variables: VarValues;
  metadata: MetadataEntry[];
};

/** One tool call while it is being edited: values are held as the text in
 * the boxes and only turned back into real values on save. */
type DraftToolCall = {
  id: string;
  tool: string;
  params: ToolCallParam[];
};

/** Inputs read as a webhook's query and body only because of how their saved
 * arguments looked, put back as the two inputs `query` and `body` they are
 * on a tool that is not a webhook. */
function ungroupParams(params: ToolCallParam[]): ToolCallParam[] {
  if (!params.some((p) => p.group)) return params;
  return argumentRows(paramsToArgs(params), false);
}

let draftIdCounter = 0;
function nextDraftId(): number {
  draftIdCounter += 1;
  return draftIdCounter;
}

/** A tool-call item saved with no text reply opens without the text box. */
function seedHidesText(
  s:
    | { output: string; toolCalls?: unknown[]; expectedToolCalls?: unknown[] }
    | undefined,
  storesEmptyToolCallList: boolean,
): boolean {
  if (!s || s.output.trim()) return false;
  return (
    storesEmptyToolCallList ||
    (s.toolCalls?.length ?? 0) > 0 ||
    (s.expectedToolCalls?.length ?? 0) > 0
  );
}

function seedToolCalls(raw: unknown): DraftToolCall[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((tc, i) => {
    const { toolName, args } = normalizeToolCall(tc);
    const params = argumentRows(isPlainObject(args) ? args : {}, true);
    return { id: `seed-${i}`, tool: toolName, params };
  });
}

type AddLlmGeneralItemsDialogProps = {
  isOpen: boolean;
  mode?: "add" | "edit";
  // Linked evaluators with their variable definitions, used to render the
  // per-item variable inputs and seed defaults.
  evaluators?: LlmGeneralEvaluatorDef[];
  /** The item being edited or duplicated stores an empty tool call list,
   * which keeps it a tool-call item on save. */
  storesEmptyToolCallList?: boolean;
  // A single item to seed the dialog with (edit / duplicate). Kept as an
  // array for backwards-compatible call sites; only the first entry is used
  // since the dialog edits one item at a time.
  initialRows?: {
    uuid: string;
    name: string;
    description?: string;
    input: string;
    output: string;
    inputExtras?: TurnExtras;
    outputExtras?: TurnExtras;
    /** The tool calls the agent made, when its answer was a tool call rather
     * than text. Editable under Output. */
    toolCalls?: unknown[];
    expectedToolCalls?: ExpectedToolCall[];
    varValues?: VarValues;
    metadata?: MetadataEntry[] | null;
  }[];
  onClose: () => void;
  // Receives the single edited/added item wrapped in an array so existing
  // POST/PUT call sites that map over `rows` keep working unchanged.
  onSubmit: (rows: LlmGeneralItemRowSubmission[]) => Promise<void> | void;
} & ItemStepProps;

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
  storesEmptyToolCallList = false,
  initialRows,
  onClose,
  onSubmit,
  onPrev,
  onNext,
  hasPrev,
  hasNext,
  onView,
  position,
}: AddLlmGeneralItemsDialogProps) {
  useHideFloatingButton(isOpen);
  const accessToken = useAccessToken();
  // The left column and the evaluators column can be dragged wider or
  // narrower; the input and output take what is left, at least a quarter.
  const leftColumn = useSavedColumnWidth(
    "calibrate:one-shot-item-form-left-width",
    32,
    15,
    50,
    "left",
  );
  const rightColumn = useSavedColumnWidth(
    "calibrate:one-shot-item-form-right-width",
    25,
    15,
    40,
  );
  const sideColumnPercent = Math.min(
    rightColumn.percent,
    75 - leftColumn.percent,
  );

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
  const [metadataRows, setMetadataRows] = useState<MetadataRow[]>(() =>
    metadataToRows(seed?.metadata),
  );
  const [input, setInput] = useState(seed?.input ?? "");
  const [output, setOutput] = useState(seed?.output ?? "");
  const [inputExtras, setInputExtras] = useState<TurnExtras>(
    seed?.inputExtras ?? {},
  );
  const [outputExtras, setOutputExtras] = useState<TurnExtras>(
    seed?.outputExtras ?? {},
  );
  const [inputPending, setInputPending] = useState(false);
  const [outputPending, setOutputPending] = useState(false);
  const [toolCalls, setToolCalls] = useState<DraftToolCall[]>(() =>
    seedToolCalls(seed?.toolCalls),
  );
  // A tool-call item can drop its text box and keep only the tool calls.
  const [textRemoved, setTextRemoved] = useState(() =>
    seedHidesText(seed, storesEmptyToolCallList),
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  // Which list a tool made in the new-tool flow is added to.
  const [createToolFor, setCreateToolFor] = useState<
    "output" | "expected" | null
  >(null);
  const expected = useToolCallExpectations();
  // What the expected tool calls were when the dialog opened, to tell edits
  // apart from the rows being rebuilt once the tool list arrives.
  const [expectedBaseline, setExpectedBaseline] = useState("[]");
  const [expectedAttempted, setExpectedAttempted] = useState(false);
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
      setMetadataRows(metadataToRows(s?.metadata));
      setInput(s?.input ?? "");
      setOutput(s?.output ?? "");
      setInputExtras(s?.inputExtras ?? {});
      setOutputExtras(s?.outputExtras ?? {});
      setToolCalls(seedToolCalls(s?.toolCalls));
      setTextRemoved(seedHidesText(s, storesEmptyToolCallList));
      const seeded = toolCallsToSelectedTools(
        s?.expectedToolCalls,
        availableTools,
        true,
      );
      expected.reset(seeded);
      setExpectedBaseline(JSON.stringify(selectedToolsToCalls(seeded)));
      setExpectedAttempted(false);
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
      // A tool opened from the list is edited in a side panel the list draws;
      // closing the list there would close the panel and lose the edit.
      if ((e.target as Element | null)?.closest?.("[data-tool-side-panel]"))
        return;
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

  // Rows built before the tool list arrived lack each tool's schema, so
  // rebuild them once it does, unless they were already edited.
  useEffect(() => {
    if (availableTools.length === 0) return;
    const calls = selectedToolsToCalls(expected.selectedTools);
    if (JSON.stringify(calls) !== expectedBaseline) return;
    const rebuilt = toolCallsToSelectedTools(
      seed?.expectedToolCalls,
      availableTools,
      true,
    );
    expected.setSelectedTools(rebuilt);
    setExpectedBaseline(JSON.stringify(selectedToolsToCalls(rebuilt)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableTools]);

  // Unsaved-changes check: any field differs from what the dialog was seeded
  // with (blank for add, the item's values for edit).
  const baseVarValues = seedVarValues(seed?.varValues);
  const isDirty =
    name.trim() !== (seed?.name ?? "").trim() ||
    description.trim() !== (seed?.description ?? "").trim() ||
    JSON.stringify(rowsToMetadata(metadataRows)) !==
      JSON.stringify(rowsToMetadata(metadataToRows(seed?.metadata))) ||
    input.trim() !== (seed?.input ?? "").trim() ||
    output.trim() !== (seed?.output ?? "").trim() ||
    !sameExtras(inputExtras, seed?.inputExtras ?? {}) ||
    !sameExtras(outputExtras, seed?.outputExtras ?? {}) ||
    inputPending ||
    outputPending ||
    JSON.stringify(toolCalls.map(({ tool, params }) => ({ tool, params }))) !==
      JSON.stringify(
        seedToolCalls(seed?.toolCalls).map(({ tool, params }) => ({
          tool,
          params,
        })),
      ) ||
    JSON.stringify(selectedToolsToCalls(expected.selectedTools)) !==
      expectedBaseline ||
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
    navPrev,
    navNext,
    navView,
  } = useUnsavedCloseGuard({
    isOpen,
    isDirty,
    isEdit,
    submitting,
    onClose,
    onPrev,
    onNext,
    hasPrev,
    hasNext,
    onView,
    onBeforeClose: () => {
      setError(null);
      setNameError(null);
    },
  });

  // A tool call added from this form lands at the bottom of the output
  // column, which may be off screen, so bring it into view.
  const scrollToNewToolCall = useRef(false);
  const toolCallListRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!scrollToNewToolCall.current) return;
    scrollToNewToolCall.current = false;
    const cards = toolCallListRef.current?.querySelectorAll("[data-tool-call]");
    cards?.[cards.length - 1]?.scrollIntoView?.({
      block: "nearest",
      behavior: "smooth",
    });
  }, [toolCalls]);

  if (!isOpen) return null;

  // A tool opened from the list or from a tool call card was saved. Tool calls
  // hold the tool by name, so the ones carrying its old name get the new name
  // and its current inputs, keeping what was typed into inputs that remain.
  const handleToolSaved = (
    tool: AvailableTool,
    previousName: string,
    allTools: AvailableTool[],
  ) => {
    setAvailableTools(allTools);
    expected.applyToolSaved(tool, previousName);
    const fresh = getToolParams(tool);
    setToolCalls((prev) =>
      prev.map((tc) =>
        tc.tool === previousName
          ? {
              ...tc,
              tool: tool.name,
              params: mergeFlatParams(
                tool.config?.type === "webhook"
                  ? tc.params
                  : ungroupParams(tc.params),
                fresh,
              ),
            }
          : tc,
      ),
    );
  };

  const addToolCall = (toolName: string, params: ToolCallParam[]) => {
    scrollToNewToolCall.current = true;
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

  const updateToolCallParam = (
    id: string,
    param: ToolCallParam,
    value: string,
  ) =>
    setToolCalls((prev) =>
      prev.map((tc) =>
        tc.id === id
          ? {
              ...tc,
              params: tc.params.map((prm) =>
                prm.name === param.name && prm.group === param.group
                  ? { ...prm, value }
                  : prm,
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

  // Only tool-call evaluators score a tool-call item, and only the others
  // score the rest, so values are required only for the evaluators that
  // score this item.
  const isToolCallItem =
    storesEmptyToolCallList ||
    toolCalls.length > 0 ||
    expected.selectedTools.length > 0;
  const evaluatorFits = (e: LlmGeneralEvaluatorDef) =>
    evaluatorFitsItem(e.evaluator_type, isToolCallItem);
  // An item needs a text reply or a tool call, so the box comes back once
  // the last tool call goes.
  const showsText = !textRemoved || !isToolCallItem;
  const removeText = () => {
    setOutput("");
    setOutputExtras({});
    setTextRemoved(true);
  };
  const varsComplete = evaluatorsWithVariables
    .filter(evaluatorFits)
    .every((e) =>
      e.variables.every((v) => (varValues[e.uuid]?.[v.name] ?? "").trim()),
    );
  // A tool-call item may have no output: its agent can have made no call,
  // which its expected calls grade.
  const valid =
    !!name.trim() &&
    !!input.trim() &&
    (!!output.trim() || isToolCallItem) &&
    varsComplete &&
    versionsComplete(inputExtras) &&
    (!output.trim() || versionsComplete(outputExtras)) &&
    Object.keys(metadataRowErrors(metadataRows)).length === 0;

  const handleSubmit = async () => {
    if (!valid || submitting) return;
    if (selectedToolsHaveInvalidParams(expected.selectedTools)) {
      setExpectedAttempted(true);
      setError(null);
      // A tool shown as JSON has no field to point at, so show them as forms.
      expected.showFormViews();
      // Each field says what is wrong under it. The highlight lands on the
      // next render, so look for it after that.
      requestAnimationFrame(() => {
        const bad = document.querySelector<HTMLElement>("[data-param-error]");
        if (!bad) {
          // A tool edited as JSON has no field to point at.
          setError(
            "Some expected tool call values are missing or invalid. Switch to Form to see which",
          );
          return;
        }
        bad.scrollIntoView?.({ block: "center", behavior: "smooth" });
        bad.focus();
      });
      return;
    }
    const evaluator_variables: VarValues = {};
    for (const e of evaluatorsWithVariables) {
      if (!evaluatorFits(e)) {
        const stored = seed?.varValues?.[e.uuid];
        if (stored) evaluator_variables[e.uuid] = stored;
        continue;
      }
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
          inputExtras,
          // Versions beside an empty output would be refused on save.
          outputExtras: output.trim() ? outputExtras : {},
          toolCalls: restoreToolCalls(
            toolCalls.map((tc) => ({
              tool: tc.tool,
              arguments: typeArguments(
                paramsToArgs(tc.params),
                availableTools.find((t) => t.name === tc.tool),
              ),
            })),
            seed?.toolCalls,
            toolCalls.map((tc) => {
              const match = tc.id.match(/^seed-(\d+)$/);
              return match ? Number(match[1]) : undefined;
            }),
          ),
          expectedToolCalls: selectedToolsToCalls(expected.selectedTools),
          evaluator_variables,
          metadata: rowsToMetadata(metadataRows),
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
      // Only a click on the dark area itself. Clicks inside the windows this
      // form opens on top of it (Create tool, discard changes) reach here
      // too, and must not close the form.
      onClick={(e) => {
        if (e.target === e.currentTarget) handleBackdropClick();
      }}
    >
      <div
        className="bg-background border border-border rounded-xl md:rounded-2xl w-full max-w-[90rem] h-[95vh] md:h-[85vh] mx-2 md:mx-4 shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="relative flex items-center justify-between gap-3 px-5 md:px-6 py-3 border-b border-border">
          {/* Previous / next item, centred in the header row. */}
          <DialogNavHeader
            noun="item"
            onPrev={navPrev}
            onNext={navNext}
            hasPrev={hasPrev}
            hasNext={hasNext}
            position={position}
          />
          <div className="min-w-0">
            <h2 className="text-base md:text-lg font-semibold text-foreground">
              {isEdit ? "Edit item" : "Add item"}
            </h2>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            {navView && (
              <ViewItemButton onClick={navView} disabled={submitting} />
            )}
            <button
              aria-label="Close"
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
        </div>

        {/* Body: name, description and metadata on the left, input and
            output in the middle, evaluators on the right. */}
        <div className="flex-1 min-h-0 flex flex-col md:flex-row overflow-hidden">
          {/* Left column mirrors the AddTestDialog left column. */}
          <div
            style={
              {
                "--form-column-width": `${leftColumn.percent}%`,
              } as React.CSSProperties
            }
            className="w-full md:w-[var(--form-column-width)] md:shrink-0 flex flex-col border-b md:border-b-0 border-border overflow-y-auto hide-scrollbar [scrollbar-width:none] p-4 md:p-6 space-y-6"
          >
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
              <label className="block text-base font-medium text-foreground">
                Description
              </label>
              <p className="text-xs text-muted-foreground mt-1 mb-2">
                Any details about this item to help annotators while labelling
              </p>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Mother asks when her baby's next vaccine is due"
                disabled={submitting}
                rows={3}
                className="w-full px-4 py-2.5 rounded-lg text-base bg-background text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-accent resize-y disabled:opacity-50"
              />
            </div>

            <MetadataFieldsEditor
              rows={metadataRows}
              onRowsChange={setMetadataRows}
              disabled={submitting}
            />

            {/* Below metadata, the same place the next-reply item form has it. */}
            <div className="shrink-0">
              <ToolCallExpectationsEditor
                editor={expected}
                heading="Expected tool calls"
                emptyText={EXPECTED_TOOL_CALLS_HELP}
                availableTools={availableTools}
                availableToolsLoading={toolsLoading}
                accessToken={accessToken ?? undefined}
                onToolSaved={handleToolSaved}
                onCreateTool={() => setCreateToolFor("expected")}
                showErrors={expectedAttempted}
                createToolLabel="Create tool for expected tool calls"
              />
            </div>
          </div>

          <ResizeHandle
            onMouseDown={leftColumn.startDrag}
            label="Resize the form column"
          />

          {/* Middle: input + output boxes shown side by side, each filling
              the full dialog height. */}
          <div className="w-full md:flex-1 md:min-w-0 flex flex-col md:flex-row bg-muted/30 min-h-0">
            <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-y-auto hide-scrollbar [scrollbar-width:none] p-4 md:p-6 border-b md:border-b-0 md:border-r border-border">
              <TextVersionsEditor
                field="input"
                extras={inputExtras}
                onChange={setInputExtras}
                onPendingChange={setInputPending}
                disabled={submitting}
              >
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="The prompt or input given to the LLM"
                  disabled={submitting}
                  className="flex-1 min-h-[10rem] w-full px-4 py-3 rounded-lg text-base bg-background text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-accent resize-none disabled:opacity-50"
                />
              </TextVersionsEditor>
            </div>
            <div className="flex-1 min-w-0 flex flex-col min-h-0 p-4 md:p-6">
              <div
                ref={toolCallListRef}
                className="flex-1 min-h-0 overflow-y-auto hide-scrollbar [scrollbar-width:none] space-y-3 flex flex-col"
              >
                <TextVersionsEditor
                  field="output"
                  headingAside={
                    !showsText && (
                      <button
                        type="button"
                        onClick={() => setTextRemoved(false)}
                        disabled={submitting}
                        className="h-7 px-3 rounded-md text-sm font-medium whitespace-nowrap border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Add text reply
                      </button>
                    )
                  }
                  extras={outputExtras}
                  onChange={setOutputExtras}
                  onPendingChange={setOutputPending}
                  disabled={submitting || !output.trim()}
                >
                  {showsText && (
                    <>
                      {/* Remove sits beside the box, the same as on a tool
                          call below it. The box fills the column under its
                          heading (3.25rem), or half of it once the item has
                          a tool call; either way a fixed height, so tool
                          calls below scroll the column, never shrink it. */}
                      <div
                        data-testid="output-text-box"
                        className={`flex shrink-0 w-full gap-2 min-h-[10rem] ${
                          isToolCallItem ? "h-1/2" : "h-[calc(100%-3.25rem)]"
                        }`}
                      >
                        {isToolCallItem && (
                          <Tooltip
                            content="Remove text reply"
                            position="top"
                            className="flex-shrink-0 self-start"
                          >
                            <button
                              type="button"
                              onClick={removeText}
                              disabled={submitting}
                              aria-label="Remove text reply"
                              className="w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer transition-colors bg-red-500/10 border-red-500/40 text-red-500 hover:bg-red-500/20 hover:border-red-500/60 disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </Tooltip>
                        )}
                        <textarea
                          value={output}
                          onChange={(e) => setOutput(e.target.value)}
                          placeholder="The output the LLM produced"
                          disabled={submitting}
                          className="flex-1 min-w-0 min-h-[10rem] w-full px-4 py-3 rounded-lg text-base bg-background text-foreground placeholder:text-muted-foreground border border-border focus:outline-none focus:ring-2 focus:ring-accent resize-none disabled:opacity-50"
                        />
                      </div>
                    </>
                  )}
                </TextVersionsEditor>
                {toolCalls.map((tc) => (
                  // Same card the test dialog draws a tool call with, in the
                  // conversation tab: header row with the wrench and the tool
                  // name, remove button on the left, parameters below.
                  <div
                    key={tc.id}
                    data-tool-call
                    className="flex w-full items-start gap-2"
                  >
                    <Tooltip
                      content="Remove tool call"
                      position="top"
                      className="flex-shrink-0"
                    >
                      <button
                        type="button"
                        onClick={() => removeToolCall(tc.id)}
                        disabled={submitting}
                        aria-label={`Remove ${tc.tool}`}
                        className="w-8 h-8 rounded-lg border flex items-center justify-center cursor-pointer transition-colors bg-red-500/10 border-red-500/40 text-red-500 hover:bg-red-500/20 hover:border-red-500/60 disabled:opacity-50 disabled:cursor-not-allowed"
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
                    </Tooltip>
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
                          <span className="flex-1 min-w-0 text-sm font-medium text-foreground">
                            {tc.tool}
                          </span>
                          {(() => {
                            const tool = availableTools.find(
                              (t) => t.name === tc.tool,
                            );
                            return tool ? (
                              <OpenToolButton
                                tool={tool}
                                accessToken={accessToken ?? undefined}
                                onToolSaved={handleToolSaved}
                              />
                            ) : null;
                          })()}
                        </div>
                        {tc.params.length > 0 && (
                          <div className="space-y-3 mt-3">
                            {tc.params.map((prm, i) => (
                              <div key={`${prm.group ?? ""}-${prm.name}`}>
                                {/* A webhook's inputs sit under the part of
                                    its request they go in, as in the test
                                    editor. */}
                                {prm.group &&
                                  prm.group !== tc.params[i - 1]?.group && (
                                    <h5 className="text-xs font-medium text-muted-foreground mb-3 uppercase tracking-wide">
                                      {prm.group === "query" ? "Query" : "Body"}
                                    </h5>
                                  )}
                                <label
                                  htmlFor={`${tc.id}-${prm.group ?? ""}-${prm.name}`}
                                  className="block text-sm font-medium text-foreground mb-1.5"
                                >
                                  {prm.name}
                                </label>
                                <input
                                  id={`${tc.id}-${prm.group ?? ""}-${prm.name}`}
                                  type="text"
                                  value={prm.value}
                                  onChange={(e) =>
                                    updateToolCallParam(
                                      tc.id,
                                      prm,
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
              {/* Below the output, so the Input and Output headings sit alone on
                their rows and match. Outside the scrolling list, so the tool
                list is never cut off. */}
              <div className="shrink-0 flex items-center justify-end gap-2 mt-3">
                <button
                  type="button"
                  onClick={() => setCreateToolFor("output")}
                  disabled={submitting}
                  className="h-9 px-3 rounded-md text-sm font-medium whitespace-nowrap border border-border bg-background hover:bg-muted/50 transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Create tool
                </button>
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setPickerOpen((open) => !open)}
                    disabled={submitting}
                    className="h-9 px-3 rounded-md text-sm font-medium whitespace-nowrap bg-foreground text-background hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
                      <div className="absolute right-0 bottom-full z-50 mb-2 min-w-[280px] rounded-xl border border-border bg-background shadow-xl overflow-hidden">
                        <ToolPicker
                          availableTools={availableTools}
                          isLoading={toolsLoading}
                          onSelectInbuiltTool={(toolId) =>
                            addToolCall(toolId, [])
                          }
                          onSelectCustomTool={(tool) =>
                            addToolCall(tool.name, getToolParams(tool))
                          }
                          accessToken={accessToken ?? undefined}
                          onToolSaved={handleToolSaved}
                        />
                      </div>
                    </>
                  )}
                </div>
              </div>
            </div>
          </div>

          <ResizeHandle
            onMouseDown={rightColumn.startDrag}
            label="Resize the right column"
          />

          {/* Always drawn, so the columns do not move as the item switches
              between a text output and a tool call. */}
          <div
            data-testid="label-item-evaluators-column"
            style={
              {
                "--side-column-width": `${sideColumnPercent}%`,
              } as React.CSSProperties
            }
            className="w-full md:w-[var(--side-column-width)] md:shrink-0 flex flex-col min-h-0 overflow-y-auto hide-scrollbar [scrollbar-width:none] border-t md:border-t-0 border-border p-4 md:p-6"
          >
            <label className="block text-base font-medium text-foreground mb-2">
              Evaluators
            </label>
            <div className="space-y-4">
              {isToolCallItem && !evaluators.some(evaluatorFits) && (
                <PendingToolCallEvaluatorCard />
              )}
              {!isToolCallItem && !evaluators.some(evaluatorFits) && (
                <p className="text-sm text-muted-foreground">
                  No evaluator on this task scores this item
                </p>
              )}
              {evaluators.filter(evaluatorFits).map((e) => (
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
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-5 md:px-6 py-4 border-t border-border">
          {error && <ErrorNote className="mr-auto">{error}</ErrorNote>}
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
        isOpen={createToolFor !== null}
        onClose={() => setCreateToolFor(null)}
        accessToken={accessToken ?? undefined}
        knownTools={availableTools}
        onCreated={(tool, allTools) => {
          setAvailableTools(allTools);
          if (createToolFor === "expected") {
            expected.addToolFromSelection(tool);
          } else {
            addToolCall(tool.name, getToolParams(tool));
          }
          setCreateToolFor(null);
        }}
      />
    </div>
  );
}
