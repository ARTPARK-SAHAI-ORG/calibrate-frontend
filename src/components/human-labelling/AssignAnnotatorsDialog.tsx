"use client";

import { useEffect, useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import { apiClient } from "@/lib/api";
import { AddAnnotatorInline, type NewAnnotator } from "./AddAnnotatorInline";

type Annotator = {
  uuid: string;
  name: string;
};

type TaskEvaluator = {
  uuid: string;
  name: string;
  description?: string | null;
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

type AssignAnnotatorsDialogProps = {
  isOpen: boolean;
  accessToken: string;
  /** Evaluators linked to the task — the pool the job can show in labelling. */
  evaluators: TaskEvaluator[];
  onClose: () => void;
  /** The evaluators to show in the created labelling jobs. */
  onConfirm: (
    annotatorIds: string[],
    evaluatorIds: string[],
  ) => Promise<void> | void;
};

export function AssignAnnotatorsDialog({
  isOpen,
  accessToken,
  evaluators,
  onClose,
  onConfirm,
}: AssignAnnotatorsDialogProps) {
  useHideFloatingButton(isOpen);

  const [annotators, setAnnotators] = useState<Annotator[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [picked, setPicked] = useState<Set<string>>(new Set());
  // Every label is shown in a job unless the user narrows it down.
  const [pickedEvaluators, setPickedEvaluators] = useState<Set<string>>(
    new Set(),
  );
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setPicked(new Set());
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
  const evaluatorIdsKey = evaluators.map((ev) => ev.uuid).join(",");
  useEffect(() => {
    if (!isOpen) return;
    setPickedEvaluators(new Set(evaluatorIdsKey ? evaluatorIdsKey.split(",") : []));
  }, [isOpen, evaluatorIdsKey]);

  if (!isOpen) return null;

  const toggle = (id: string) => setPicked((prev) => toggleInSet(prev, id));

  const allPicked = annotators.length > 0 && picked.size === annotators.length;
  const somePicked = picked.size > 0 && !allPicked;
  // Anything picked (all or just some) → clearing is the useful action.
  const toggleSelectAll = () => {
    if (picked.size > 0) {
      setPicked(new Set());
    } else {
      setPicked(new Set(annotators.map((a) => a.uuid)));
    }
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

  // The dialog is short in this state, so it gets tighter outer spacing.
  const noAnnotators = !loading && !loadError && annotators.length === 0;

  const toggleEvaluator = (id: string) =>
    setPickedEvaluators((prev) => toggleInSet(prev, id));

  // A task with no labels at all can still be assigned; one with labels needs
  // at least one picked.
  const evaluatorSelectionValid =
    evaluators.length === 0 || pickedEvaluators.size > 0;
  const allEvaluatorsPicked =
    evaluators.length > 0 && pickedEvaluators.size === evaluators.length;

  // Only worth offering an evaluator choice (and the wider layout) when the
  // task has more than one evaluator to pick between.
  const showEvaluatorChoice = evaluators.length > 1;

  const handleConfirm = async () => {
    if (picked.size === 0 || !evaluatorSelectionValid || submitting) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onConfirm(Array.from(picked), Array.from(pickedEvaluators));
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
          showEvaluatorChoice ? "max-w-5xl" : "max-w-md"
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
            className={
              showEvaluatorChoice
                ? "grid grid-cols-1 md:grid-cols-3 gap-x-10 gap-y-4"
                : ""
            }
          >
            <div
              className={`space-y-2 flex flex-col min-h-0 ${
                noAnnotators ? "-my-2" : ""
              }`}
            >
              {showEvaluatorChoice && (
                <p className="text-xs font-medium text-muted-foreground">
                  Annotators
                </p>
              )}
              <AddAnnotatorInline
                accessToken={accessToken}
                // Disabled until the list has loaded, otherwise the in-flight
                // fetch would land afterwards and drop the new annotator.
                disabled={submitting || loading}
                onAdded={handleAnnotatorAdded}
              />
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
                    {annotators.length > 1 && (
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
                    {annotators.map((a) => (
                      <label
                        key={a.uuid}
                        className="flex items-center gap-3 px-3 py-2 rounded-md border border-border hover:bg-muted/30 transition-colors cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={picked.has(a.uuid)}
                          onChange={() => toggle(a.uuid)}
                          className="w-4 h-4 cursor-pointer accent-foreground"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium truncate">
                            {a.name}
                          </div>
                        </div>
                      </label>
                    ))}
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
              <div className="space-y-2 md:col-span-2 flex flex-col min-h-0">
                <p className="text-xs font-medium text-muted-foreground">
                  Labels
                </p>
                <p className="text-xs text-muted-foreground">
                  Pick one or more labels to show in the labelling jobs created
                </p>
                {evaluators.length > 1 && (
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
                            : new Set(evaluators.map((ev) => ev.uuid)),
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 overflow-y-auto pr-1 max-h-[50vh]">
                  {evaluators.map((ev) => {
                    const checked = pickedEvaluators.has(ev.uuid);
                    return (
                      <label
                        key={ev.uuid}
                        className="flex items-start gap-3 px-3 py-2 rounded-md border border-border hover:bg-muted/30 transition-colors cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleEvaluator(ev.uuid)}
                          className="mt-0.5 w-4 h-4 accent-foreground cursor-pointer"
                        />
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
                </div>
              </div>
            )}
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
      </div>
    </div>
  );
}
