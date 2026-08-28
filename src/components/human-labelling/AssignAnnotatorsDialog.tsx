"use client";

import { useEffect, useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { SearchInput } from "@/components/ui/SearchInput";
import { apiClient } from "@/lib/api";
import {
  createAnnotator,
  renameAnnotator,
  type NewAnnotator,
} from "@/lib/annotatorApi";
import { AddAnnotatorDialog } from "./AddAnnotatorDialog";

type Annotator = {
  uuid: string;
  name: string;
};

type TaskEvaluator = {
  uuid: string;
  name: string;
  description?: string | null;
  evaluator_type?: string | null;
};

/** Returns a new Set with `id` toggled in or out. */
function toggleInSet(set: Set<string>, id: string): Set<string> {
  const next = new Set(set);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function parseApiError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const match = err.message.match(/Request failed: \d+ - (.+)$/);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && typeof parsed.detail === "string") return parsed.detail;
    } catch {
      // not JSON
    }
    return match[1];
  }
  return err.message || fallback;
}

export type ReasoningMode = "optional" | "required" | "hidden";

export type LabellingJobSettings = {
  comments_enabled: boolean;
  reasoning_mode: ReasoningMode;
};

/**
 * One choice out of a short list, laid out like the checkbox rows above it.
 * The fieldset names the group for screen readers and disables every option
 * in it at once.
 */
function SettingChoice<T extends string>({
  label,
  help,
  name,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  help: string;
  name: string;
  value: T;
  options: { value: T; label: string }[];
  disabled: boolean;
  onChange: (value: T) => void;
}) {
  return (
    <fieldset className="space-y-1" disabled={disabled}>
      <legend className="text-sm font-medium">{label}</legend>
      <p className="text-xs text-muted-foreground">{help}</p>
      <div className="pt-1">
        {options.map((option) => (
          <label
            key={option.value}
            className="flex items-center gap-3 py-1 cursor-pointer select-none"
          >
            <input
              type="radio"
              name={name}
              value={option.value}
              checked={value === option.value}
              onChange={() => onChange(option.value)}
              className="w-4 h-4 cursor-pointer accent-foreground disabled:cursor-not-allowed disabled:opacity-50"
            />
            <span className="text-sm">{option.label}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}

type AssignAnnotatorsDialogProps = {
  isOpen: boolean;
  accessToken: string;
  /** Evaluators linked to the task — the pool the job can show in labelling. */
  evaluators: TaskEvaluator[];
  /** True when at least one of the chosen items is answered by a tool call.
   * Tool call correctness is then shown ticked and cannot be unticked, since
   * such an item is always answered by it. With no such item it is not shown
   * at all. */
  hasToolCallItems: boolean;
  /** True when at least one of the chosen items is answered by written text
   * rather than a tool call. The AI-judge labels only apply to such an item,
   * so with none chosen they are left out entirely — there is nothing for
   * them to judge. */
  hasNonToolCallItems: boolean;
  onClose: () => void;
  /** The evaluators to show in the created labelling jobs. */
  onConfirm: (
    annotatorIds: string[],
    evaluatorIds: string[],
    settings: LabellingJobSettings,
  ) => Promise<void> | void;
};

export function AssignAnnotatorsDialog({
  isOpen,
  accessToken,
  evaluators,
  hasToolCallItems,
  hasNonToolCallItems,
  onClose,
  onConfirm,
}: AssignAnnotatorsDialogProps) {
  useHideFloatingButton(isOpen);

  const [annotators, setAnnotators] = useState<Annotator[]>([]);
  const [search, setSearch] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [editingUuid, setEditingUuid] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");
  const [savingEdit, setSavingEdit] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [picked, setPicked] = useState<Set<string>>(new Set());
  // Every label is shown in a job unless the user narrows it down.
  const [pickedEvaluators, setPickedEvaluators] = useState<Set<string>>(
    new Set(),
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [commentsEnabled, setCommentsEnabled] = useState(true);
  const [reasoningMode, setReasoningMode] = useState<ReasoningMode>("optional");

  useEffect(() => {
    if (!isOpen) return;
    setPicked(new Set());
    setCommentsEnabled(true);
    setReasoningMode("optional");
    setSubmitError(null);
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await apiClient<Annotator[]>("/annotators", accessToken);
        if (!cancelled) setAnnotators(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled)
          setLoadError(parseApiError(err, "Failed to load annotators"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [isOpen, accessToken]);

  // Start with every label picked, and re-seed if the task's labels arrive
  // (or change) while the dialog is open.
  // Tool call correctness is never a choice. It comes with a tool-call item
  // and is added by the backend whether or not it is ticked here, so it is
  // shown as already on when such an item is in the selection, and left out
  // entirely when none is.
  const toolCallEvaluators = evaluators.filter(
    (ev) => ev.evaluator_type === "tool-call",
  );
  // The AI-judge labels only apply to an item answered in writing. With no
  // such item in the selection none of them belong in the picker at all —
  // this is what was missing before: the full task list showed here no
  // matter which items were actually chosen.
  const choosableEvaluators = hasNonToolCallItems
    ? evaluators.filter((ev) => ev.evaluator_type !== "tool-call")
    : [];
  const shownToolCallEvaluators = hasToolCallItems ? toolCallEvaluators : [];

  const evaluatorIdsKey = choosableEvaluators.map((ev) => ev.uuid).join(",");
  useEffect(() => {
    if (!isOpen) return;
    setPickedEvaluators(
      new Set(evaluatorIdsKey ? evaluatorIdsKey.split(",") : []),
    );
  }, [isOpen, evaluatorIdsKey]);

  if (!isOpen) return null;

  const toggle = (id: string) => setPicked((prev) => toggleInSet(prev, id));

  // Select all and the list itself work on what the search leaves visible.
  const visible = annotators.filter((a) =>
    a.name.toLowerCase().includes(search.trim().toLowerCase()),
  );
  const allPicked =
    visible.length > 0 && visible.every((a) => picked.has(a.uuid));
  const somePicked = visible.some((a) => picked.has(a.uuid)) && !allPicked;
  // Anything picked (all or just some) → clearing is the useful action.
  const toggleSelectAll = () => {
    setPicked((prev) => {
      const next = new Set(prev);
      const anyPicked = visible.some((a) => next.has(a.uuid));
      visible.forEach((a) => {
        if (anyPicked) next.delete(a.uuid);
        else next.add(a.uuid);
      });
      return next;
    });
  };

  // A freshly added annotator is almost always one the user wants to assign,
  // so select it straight away.
  const handleAnnotatorAdded = (a: NewAnnotator) => {
    setAnnotators((prev) =>
      [...prev.filter((x) => x.uuid !== a.uuid), a].sort((x, y) =>
        x.name.localeCompare(y.name),
      ),
    );
    setPicked((prev) => new Set(prev).add(a.uuid));
    setLoadError(null);
  };

  const startEdit = (a: Annotator) => {
    setEditingUuid(a.uuid);
    setEditingName(a.name);
    setEditError(null);
  };

  const cancelEdit = () => {
    setEditingUuid(null);
    setEditError(null);
  };

  const saveEdit = async () => {
    if (!editingUuid || savingEdit) return;
    const name = editingName.trim();
    const current = annotators.find((a) => a.uuid === editingUuid);
    if (!name || !current || name === current.name) {
      cancelEdit();
      return;
    }
    setSavingEdit(true);
    setEditError(null);
    try {
      await renameAnnotator(accessToken, editingUuid, name);
      setAnnotators((prev) =>
        prev
          .map((a) => (a.uuid === editingUuid ? { ...a, name } : a))
          .sort((x, y) => x.name.localeCompare(y.name)),
      );
      setEditingUuid(null);
    } catch (err) {
      setEditError(
        err instanceof Error ? err.message : "Failed to rename annotator",
      );
    } finally {
      setSavingEdit(false);
    }
  };

  // The dialog is short in this state, so it gets tighter outer spacing.
  const noAnnotators = !loading && !loadError && annotators.length === 0;

  const toggleEvaluator = (id: string) =>
    setPickedEvaluators((prev) => toggleInSet(prev, id));

  // A task with no labels at all can still be assigned; one with labels needs
  // at least one picked.
  const evaluatorSelectionValid =
    choosableEvaluators.length === 0 || pickedEvaluators.size > 0;
  const allEvaluatorsPicked =
    choosableEvaluators.length > 0 &&
    pickedEvaluators.size === choosableEvaluators.length;

  // Only worth showing the column when there is more than one label on
  // screen in total (choosable ones plus the locked tool-call one). With
  // just one — a single choosable label, or only the tool-call label because
  // every chosen item is a tool call — there is nothing to weigh, so the
  // column is left out, same as the original one-label rule.
  const totalShownLabels =
    choosableEvaluators.length + shownToolCallEvaluators.length;
  const showEvaluatorChoice = totalShownLabels > 1;

  const handleConfirm = async () => {
    if (picked.size === 0 || !evaluatorSelectionValid || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const evaluatorIds = [
        ...pickedEvaluators,
        ...shownToolCallEvaluators.map((ev) => ev.uuid),
      ];
      await onConfirm(Array.from(picked), evaluatorIds, {
        comments_enabled: commentsEnabled,
        reasoning_mode: reasoningMode,
      });
    } catch (err) {
      setSubmitError(parseApiError(err, "Failed to create jobs"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        className={`bg-background border border-border rounded-xl shadow-2xl w-full flex flex-col max-h-[90vh] ${
          showEvaluatorChoice ? "max-w-6xl" : "max-w-4xl"
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold">Assign annotators</h2>
            <p className="text-xs text-muted-foreground mt-1">
              One labelling job will be created for each selected annotator
            </p>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="w-8 h-8 flex items-center justify-center rounded-md hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
        <div className="p-4 md:p-6 overflow-y-auto">
          <div
            className={`grid grid-cols-1 gap-x-10 gap-y-4 ${
              showEvaluatorChoice ? "md:grid-cols-3" : "md:grid-cols-2"
            }`}
          >
            <div
              className={`space-y-2 flex flex-col min-h-0 ${
                noAnnotators ? "-my-2" : ""
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-medium text-muted-foreground">
                  Annotators
                </p>
                <button
                  type="button"
                  onClick={() => setAddOpen(true)}
                  // Disabled until the list has loaded, otherwise the in-flight
                  // fetch would land afterwards and drop the new annotator.
                  disabled={submitting || loading}
                  className="h-8 px-3 rounded-md text-xs font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Add annotator
                </button>
              </div>
              {annotators.length > 1 && (
                <SearchInput
                  value={search}
                  onChange={setSearch}
                  placeholder="Search annotators"
                />
              )}
              <div className="space-y-2 overflow-y-auto pr-1 max-h-[55vh]">
                {loading ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <svg
                      className="w-4 h-4 animate-spin"
                      fill="none"
                      viewBox="0 0 24 24"
                    >
                      <circle
                        className="opacity-25"
                        cx="12"
                        cy="12"
                        r="10"
                        stroke="currentColor"
                        strokeWidth="4"
                      />
                      <path
                        className="opacity-75"
                        fill="currentColor"
                        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                      />
                    </svg>
                    Loading annotators
                  </div>
                ) : loadError ? (
                  <p className="text-sm text-red-500">{loadError}</p>
                ) : (
                  <>
                    {visible.length > 1 && (
                      <label className="flex items-center gap-3 px-3 py-2 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={allPicked}
                          ref={(el) => {
                            if (el) el.indeterminate = somePicked;
                          }}
                          onChange={toggleSelectAll}
                          aria-label={
                            picked.size > 0
                              ? "Unselect all annotators"
                              : "Select all annotators"
                          }
                          className="w-4 h-4 cursor-pointer accent-foreground"
                        />
                        <span className="text-xs font-medium text-muted-foreground">
                          {picked.size > 0 ? "Unselect all" : "Select all"}
                        </span>
                      </label>
                    )}
                    {visible.map((a) =>
                      editingUuid === a.uuid ? (
                        <div
                          key={a.uuid}
                          className="flex items-start gap-2 px-3 py-2 rounded-md border border-border"
                        >
                          <div className="flex-1 min-w-0 flex flex-col gap-1">
                            <input
                              type="text"
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") saveEdit();
                                else if (e.key === "Escape") cancelEdit();
                              }}
                              disabled={savingEdit}
                              autoFocus
                              aria-label="Annotator name"
                              className={`min-w-0 text-sm font-medium bg-background border rounded-md px-2 py-1 outline-none focus:border-foreground disabled:opacity-50 ${
                                editError ? "border-red-500" : "border-border"
                              }`}
                            />
                            {editError && (
                              <p className="text-xs text-red-500">
                                {editError}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              type="button"
                              onClick={saveEdit}
                              disabled={savingEdit || !editingName.trim()}
                              aria-label="Save name"
                              className="w-8 h-8 flex items-center justify-center rounded-md text-emerald-600 hover:text-emerald-700 hover:bg-emerald-500/10 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
                                  d="M4.5 12.75l6 6 9-13.5"
                                />
                              </svg>
                            </button>
                            <button
                              type="button"
                              onClick={cancelEdit}
                              disabled={savingEdit}
                              aria-label="Cancel rename"
                              className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
                        </div>
                      ) : (
                        <div
                          key={a.uuid}
                          className="flex items-center gap-3 px-3 py-2 rounded-md border border-border hover:bg-muted/30 transition-colors"
                        >
                          <label className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={picked.has(a.uuid)}
                              onChange={() => toggle(a.uuid)}
                              className="w-4 h-4 cursor-pointer accent-foreground"
                            />
                            <span className="text-sm font-medium truncate">
                              {a.name}
                            </span>
                          </label>
                          <button
                            type="button"
                            onClick={() => startEdit(a)}
                            disabled={submitting}
                            aria-label={`Rename ${a.name}`}
                            className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <svg
                              className="w-4 h-4"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                              strokeWidth={1.8}
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125"
                              />
                            </svg>
                          </button>
                        </div>
                      ),
                    )}
                    {!noAnnotators && visible.length === 0 && (
                      <p className="rounded-md border border-dashed border-border bg-muted/10 px-3 py-6 text-center text-sm text-muted-foreground">
                        No annotators match your search
                      </p>
                    )}
                    {noAnnotators && (
                      <p className="rounded-md border border-dashed border-border bg-muted/10 px-3 py-6 text-center text-sm text-muted-foreground">
                        No annotators added yet
                      </p>
                    )}
                  </>
                )}
              </div>
            </div>

            {showEvaluatorChoice && (
              <div className="space-y-2 flex flex-col min-h-0">
                <p className="text-xs font-medium text-muted-foreground">
                  Labels
                </p>
                <p className="text-xs text-muted-foreground">
                  Pick one or more labels to show in the labelling jobs created
                </p>
                {choosableEvaluators.length > 1 && (
                  <label className="flex items-center gap-3 px-3 py-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={allEvaluatorsPicked}
                      ref={(el) => {
                        if (el)
                          el.indeterminate =
                            pickedEvaluators.size > 0 && !allEvaluatorsPicked;
                      }}
                      onChange={() =>
                        setPickedEvaluators(
                          pickedEvaluators.size > 0
                            ? new Set()
                            : new Set(choosableEvaluators.map((ev) => ev.uuid)),
                        )
                      }
                      aria-label={
                        pickedEvaluators.size > 0
                          ? "Unselect all labels"
                          : "Select all labels"
                      }
                      className="w-4 h-4 cursor-pointer accent-foreground"
                    />
                    <span className="text-xs font-medium text-muted-foreground">
                      {pickedEvaluators.size > 0
                        ? "Unselect all"
                        : "Select all"}
                    </span>
                  </label>
                )}
                <div className="grid grid-cols-1 gap-2 overflow-y-auto pr-1 max-h-[50vh]">
                  {choosableEvaluators.map((ev) => {
                    const checked = pickedEvaluators.has(ev.uuid);
                    return (
                      <label
                        key={ev.uuid}
                        className="flex items-start gap-3 px-3 py-2 rounded-md border border-border hover:bg-muted/30 transition-colors cursor-pointer"
                      >
                        <span className="flex h-5 items-center flex-shrink-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleEvaluator(ev.uuid)}
                            className="w-4 h-4 accent-foreground cursor-pointer"
                          />
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">
                            {ev.name}
                          </div>
                          {ev.description && (
                            <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                              {ev.description}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })}
                  {/* Always on, never a choice: a tool-call item is answered
                      by this one and the backend adds it either way. */}
                  {shownToolCallEvaluators.map((ev) => (
                    <div
                      key={ev.uuid}
                      className="flex items-start gap-3 px-3 py-2 rounded-md border border-border bg-muted/30"
                    >
                      <span className="flex h-5 items-center flex-shrink-0">
                        <input
                          type="checkbox"
                          checked
                          disabled
                          readOnly
                          aria-label={`${ev.name} is always included`}
                          className="w-4 h-4 accent-foreground cursor-not-allowed"
                        />
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium truncate">
                          {ev.name}
                        </div>
                        {ev.description && (
                          <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                            {ev.description}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Always its own column, beside annotators (and labels, when
                the task has more than one label to pick between). */}
            <div className="space-y-4 flex flex-col min-h-0">
              <p className="text-xs font-medium text-muted-foreground">
                Settings
              </p>
              <div className="space-y-5">
                <SettingChoice
                  label="Comments on each item"
                  help="The box where annotators write notes about an item."
                  name="comments-on-each-item"
                  value={commentsEnabled ? "show" : "hide"}
                  options={[
                    { value: "show", label: "Show" },
                    { value: "hide", label: "Do not show" },
                  ]}
                  disabled={submitting}
                  onChange={(v) => setCommentsEnabled(v === "show")}
                />
                <SettingChoice<ReasoningMode>
                  label="Reasoning on each label"
                  help="The box where annotators explain the score they gave."
                  name="reasoning-on-each-label"
                  value={reasoningMode}
                  options={[
                    { value: "optional", label: "Optional" },
                    { value: "required", label: "Required" },
                    { value: "hidden", label: "Do not show" },
                  ]}
                  disabled={submitting}
                  onChange={setReasoningMode}
                />
              </div>
            </div>
          </div>

          {submitError && (
            <p className="text-sm text-red-500 mt-3">{submitError}</p>
          )}
        </div>
        <div className="px-6 py-4 border-t border-border flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            disabled={submitting}
            className="h-10 px-4 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleConfirm}
            disabled={
              picked.size === 0 || !evaluatorSelectionValid || submitting
            }
            className="h-10 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Assigning..." : "Assign"}
          </button>
        </div>

        <AddAnnotatorDialog
          isOpen={addOpen}
          onClose={() => setAddOpen(false)}
          onCreate={async (name) => {
            handleAnnotatorAdded(await createAnnotator(accessToken, name));
          }}
        />
      </div>
    </div>
  );
}
