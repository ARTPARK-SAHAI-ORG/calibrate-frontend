"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { apiClient } from "@/lib/api";
import { Tooltip } from "@/components/Tooltip";
import { MultiSelectPicker, type PickerItem } from "@/components/MultiSelectPicker";
import { type Item } from "@/components/human-labelling/AnnotationJobView";
import {
  ItemDetailPane,
  extractEvaluatorVariables,
  type EvaluatorRunRow,
  type HumanAgreementItem,
  type HumanAnnotation,
  type JobEvaluator,
} from "@/components/human-labelling/EvaluatorRunDetailView";

type SummaryAnnotator = { uuid: string; name: string };
type SummaryAnnotation = {
  value: boolean | number | null;
  reasoning?: string | null;
};
type SummaryRow = {
  item_id: string;
  payload: Record<string, unknown> | null;
  evaluator_id: string;
  evaluator_version_id?: string | null;
  evaluator_value: boolean | number | null;
  // Backend-resolved label for the row's score (e.g. "Helpful" for a
  // rating of 4 against a custom-labelled rating evaluator).
  evaluator_value_name?: string | null;
  evaluator_reasoning?: string | null;
  human_agreement: number | null;
  evaluator_agreement: number | null;
  annotations: Record<string, SummaryAnnotation | null>;
};
// Top-level evaluator entry — carries name / description / output_type
// and the full version history. Per-version scale + output_config live
// inside `versions[]`; the row's `evaluator_version_id` keys back in.
type SummaryEvaluatorVersion = {
  uuid: string;
  version_number: number;
  output_config?: {
    scale?: {
      value: boolean | number | string;
      name?: string | null;
      description?: string | null;
      color?: string | null;
    }[];
  } | null;
  scale_min?: number | null;
  scale_max?: number | null;
  is_live?: boolean;
};
type SummaryEvaluator = {
  uuid: string;
  name: string;
  description?: string | null;
  output_type: "binary" | "rating";
  evaluator_type?: string;
  data_type?: string;
  live_version_id?: string | null;
  live_version_index?: number | null;
  versions?: SummaryEvaluatorVersion[];
  // Total runs for this evaluator across every version, restricted to the
  // items in scope. Unaffected by `live_only`.
  run_count?: number;
};
type TaskSummaryResponse = {
  annotators: SummaryAnnotator[];
  evaluators?: SummaryEvaluator[];
  rows: SummaryRow[];
};

type TaskEvaluatorDef = {
  uuid: string;
  description?: string | null;
  output_type?: "binary" | "rating" | null;
  scale_min?: number | boolean | null;
  scale_max?: number | boolean | null;
  output_config?: {
    scale?: {
      value: boolean | number | string;
      name?: string | null;
      description?: string | null;
      color?: string | null;
    }[];
  } | null;
};

function itemTitle(item: Item | null): string {
  if (!item) return "Item";
  const payload =
    item.payload && typeof item.payload === "object"
      ? (item.payload as Record<string, unknown>)
      : null;
  const name =
    payload && typeof payload.name === "string" ? payload.name.trim() : "";
  return name || "Item";
}

export type ItemDetailDialogTask = {
  uuid: string;
  name: string;
  type: "llm" | "stt" | "simulation";
  evaluators?: TaskEvaluatorDef[];
};

export function ItemDetailDialog({
  isOpen,
  onClose,
  task,
  item,
  accessToken,
  onPrev,
  onNext,
  hasPrev = false,
  hasNext = false,
  position,
}: {
  isOpen: boolean;
  onClose: () => void;
  task: ItemDetailDialogTask | null;
  item: Item | null;
  accessToken: string | null;
  onPrev?: () => void;
  onNext?: () => void;
  hasPrev?: boolean;
  hasNext?: boolean;
  position?: { index: number; total: number };
}) {
  const [summary, setSummary] = useState<TaskSummaryResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Restricts the per-evaluator version pills to each evaluator's live
  // version. Default on (matches the previous overview filter default).
  const [liveOnly, setLiveOnly] = useState(true);
  // Annotator filter: when non-empty, the per-evaluator pills + selection
  // restrict to these annotators. Empty array = show all annotators.
  const [selectedAnnotators, setSelectedAnnotators] = useState<PickerItem[]>(
    [],
  );

  const taskUuid = task?.uuid;
  const itemUuid = item?.uuid;

  const fetchSummary = useCallback(async () => {
    if (!accessToken || !taskUuid || !itemUuid) return;
    setLoading(true);
    setError(null);
    try {
      const qs = `?item_id=${encodeURIComponent(itemUuid)}${liveOnly ? "&live_only=true" : ""}`;
      const data = await apiClient<TaskSummaryResponse>(
        `/annotation-tasks/${taskUuid}/summary${qs}`,
        accessToken,
      );
      setSummary(data);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load item";
      setError(msg);
    } finally {
      setLoading(false);
    }
  }, [accessToken, taskUuid, itemUuid, liveOnly]);

  useEffect(() => {
    if (isOpen) fetchSummary();
  }, [isOpen, fetchSummary]);

  // Reset toggle when modal closes so it opens fresh next time.
  useEffect(() => {
    if (!isOpen) {
      setLiveOnly(true);
      setSelectedAnnotators([]);
    }
  }, [isOpen]);

  // Drop stale summary when the modal switches to a different item so we
  // never flash the previous item's data while the new fetch is in flight.
  useEffect(() => {
    setSummary(null);
  }, [taskUuid, itemUuid]);

  // Close on Escape; navigate with arrow keys.
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
        return;
      }
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          target.isContentEditable
        ) {
          return;
        }
      }
      if (e.key === "ArrowLeft" && hasPrev && onPrev) {
        e.preventDefault();
        onPrev();
      } else if (e.key === "ArrowRight" && hasNext && onNext) {
        e.preventDefault();
        onNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen, onClose, hasPrev, hasNext, onPrev, onNext]);

  const evaluatorVariables = useMemo(
    () => (item ? extractEvaluatorVariables(item.payload) : {}),
    [item],
  );

  // Annotators who actually labelled this item across any evaluator/version.
  // We only surface the filter when this list is non-empty.
  const availableAnnotators = useMemo<PickerItem[]>(() => {
    if (!summary) return [];
    const seen = new Set<string>();
    for (const row of summary.rows) {
      for (const [annUuid, ann] of Object.entries(row.annotations ?? {})) {
        if (ann && ann.value !== null && ann.value !== undefined) {
          seen.add(annUuid);
        }
      }
    }
    return (summary.annotators ?? [])
      .filter((a) => seen.has(a.uuid))
      .map((a) => ({ uuid: a.uuid, name: a.name }));
  }, [summary]);

  // Drop selections that no longer correspond to an annotator with data
  // (e.g. after the modal re-fetches with different filters) at render
  // time so we don't have to round-trip through setState.
  const effectiveSelectedAnnotators = useMemo<PickerItem[]>(() => {
    if (selectedAnnotators.length === 0) return [];
    const valid = new Set(availableAnnotators.map((a) => a.uuid));
    return selectedAnnotators.filter((a) => valid.has(a.uuid));
  }, [availableAnnotators, selectedAnnotators]);

  // Hide the live-versions toggle when no evaluator has ever been run
  // against this item — across every version, not just the live one.
  // Backend's per-evaluator `run_count` is unaffected by the `live_only`
  // query param, so this works even while the toggle is on.
  const hasAnyEvaluatorRun = useMemo(() => {
    if (!summary) return false;
    return (summary.evaluators ?? []).some((e) => (e.run_count ?? 0) > 0);
  }, [summary]);

  const annotatorFilter = useMemo<Set<string> | null>(() => {
    if (effectiveSelectedAnnotators.length === 0) return null;
    return new Set(effectiveSelectedAnnotators.map((a) => a.uuid));
  }, [effectiveSelectedAnnotators]);

  const hasAnyLabel = useMemo(() => {
    if (!summary) return false;
    for (const row of summary.rows) {
      if (row.evaluator_value !== null) return true;
      for (const ann of Object.values(row.annotations ?? {})) {
        if (ann && ann.value !== null && ann.value !== undefined) return true;
      }
    }
    return false;
  }, [summary]);

  const adapted = useMemo(() => {
    if (!summary || !task || !item) return null;
    const taskEvaluatorByUuid = new Map(
      (task.evaluators ?? []).map((e) => [e.uuid, e]),
    );
    // Top-level evaluators block from the new summary response. Each
    // entry carries the full version history; per-row evaluator metadata
    // (name, output_type, version_number, scale) is resolved by uuid
    // (and evaluator_version_id for version-level fields).
    const summaryEvaluatorByUuid = new Map(
      (summary.evaluators ?? []).map((e) => [e.uuid, e]),
    );
    const annotatorNameById = new Map(
      (summary.annotators ?? []).map((a) => [a.uuid, a.name]),
    );

    const evaluators: {
      evaluator_id: string;
      evaluator_version_id?: string;
      name?: string;
    }[] = [];
    const seenEvKey = new Set<string>();
    const runs: EvaluatorRunRow[] = [];
    const versionLabels: Record<string, string> = {};
    const evaluatorNamesById: Record<string, string> = {};
    const haEvaluators: HumanAgreementItem["evaluators"] = [];
    // Per-(evaluator_id, version_id) JobEvaluator entry. The dialog
    // synthesises a one-entry scale from the per-row `evaluator_value_name`
    // so different versions of the same evaluator render their own labels.
    const jobEvaluators: JobEvaluator[] = [];

    for (const row of summary.rows) {
      const human_annotations: HumanAnnotation[] = [];
      for (const [annUuid, ann] of Object.entries(row.annotations ?? {})) {
        if (!ann || ann.value === null || ann.value === undefined) continue;
        if (annotatorFilter && !annotatorFilter.has(annUuid)) continue;
        human_annotations.push({
          annotation_id: `${row.evaluator_id}:${row.evaluator_version_id ?? ""}:${annUuid}`,
          annotator_id: annUuid,
          annotator_name: annotatorNameById.get(annUuid) ?? null,
          job_id: "",
          value: { value: ann.value, reasoning: ann.reasoning ?? null },
          reasoning: ann.reasoning ?? null,
          updated_at: "",
        });
      }

      // When the annotator filter is active, suppress evaluator-produced
      // values entirely (no version pill, no verdict card content) and
      // drop rows that have no matching annotations.
      if (annotatorFilter && human_annotations.length === 0) continue;

      // Resolve per-evaluator metadata from the top-level evaluators[]
      // block. Falls back to the task-level evaluator def for description
      // / scale (which the summary used to inline).
      const summaryEv = summaryEvaluatorByUuid.get(row.evaluator_id);
      const taskEv = taskEvaluatorByUuid.get(row.evaluator_id);
      const evName =
        summaryEv?.name ?? taskEv?.uuid ? (summaryEv?.name ?? "") : "";
      const evDescription =
        summaryEv?.description ?? taskEv?.description ?? null;
      const evOutputType =
        summaryEv?.output_type ?? (taskEv?.output_type as
          | "binary"
          | "rating"
          | undefined);
      const evVersion = row.evaluator_version_id
        ? summaryEv?.versions?.find(
            (v) => v.uuid === row.evaluator_version_id,
          )
        : undefined;

      const evKey = `${row.evaluator_id}-${row.evaluator_version_id ?? ""}`;
      if (!seenEvKey.has(evKey)) {
        seenEvKey.add(evKey);
        evaluators.push({
          evaluator_id: row.evaluator_id,
          evaluator_version_id: row.evaluator_version_id ?? undefined,
          name: evName,
        });
      }
      if (
        row.evaluator_version_id &&
        typeof evVersion?.version_number === "number"
      ) {
        versionLabels[row.evaluator_version_id] =
          `v${evVersion.version_number}`;
      }
      if (evName && !evaluatorNamesById[row.evaluator_id]) {
        evaluatorNamesById[row.evaluator_id] = evName;
      }

      // Prefer the per-version scale; fall back to the task-level snapshot.
      const scaleMin =
        typeof evVersion?.scale_min === "number"
          ? evVersion.scale_min
          : typeof taskEv?.scale_min === "number"
            ? taskEv.scale_min
            : null;
      const scaleMax =
        typeof evVersion?.scale_max === "number"
          ? evVersion.scale_max
          : typeof taskEv?.scale_max === "number"
            ? taskEv.scale_max
            : null;

      const suppressEvaluator = annotatorFilter !== null;
      const effectiveValue = suppressEvaluator ? null : row.evaluator_value;
      const effectiveReasoning = suppressEvaluator
        ? null
        : row.evaluator_reasoning;

      runs.push({
        uuid: `${row.item_id}:${row.evaluator_id}:${row.evaluator_version_id ?? ""}`,
        job_id: "",
        item_id: row.item_id,
        evaluator_id: row.evaluator_id,
        evaluator_version_id: row.evaluator_version_id ?? "",
        value:
          effectiveValue === null && !effectiveReasoning
            ? null
            : {
                value: effectiveValue,
                reasoning: effectiveReasoning ?? null,
              },
        status: effectiveValue !== null ? "completed" : "pending",
        created_at: "",
        completed_at: null,
      });

      // One JobEvaluator per (evaluator_id, version_id). The per-row
      // `evaluator_value_name` becomes a one-entry scale so the verdict
      // card surfaces THIS version's label for THIS row's score; rows
      // without a resolved name fall back to the version-level
      // output_config or the task-level snapshot.
      jobEvaluators.push({
        uuid: row.evaluator_id,
        name: evName,
        description: evDescription,
        output_type: evOutputType,
        evaluator_version_id: row.evaluator_version_id ?? undefined,
        version_number: evVersion?.version_number,
        scale_min: scaleMin,
        scale_max: scaleMax,
        output_config:
          row.evaluator_value !== null &&
          typeof row.evaluator_value_name === "string" &&
          row.evaluator_value_name.length > 0
            ? {
                scale: [
                  {
                    value: row.evaluator_value,
                    name: row.evaluator_value_name,
                  },
                ],
              }
            : evVersion?.output_config ??
              taskEv?.output_config ??
              null,
      });
      haEvaluators.push({
        evaluator_id: row.evaluator_id,
        agreement: row.evaluator_agreement,
        pair_count: human_annotations.length,
        human_annotations,
        human_agreement: row.human_agreement,
        evaluator_agreement: row.evaluator_agreement,
      });
    }

    const humanAgreementForItem: HumanAgreementItem = {
      item_id: item.uuid,
      annotator_count: (summary.annotators ?? []).length,
      evaluators: haEvaluators,
    };

    // Build a lookup keyed by (evaluator_id, evaluator_version_id) so the
    // verdict card resolves THIS version's labels/scale, not a sibling
    // version's. Falls back to any entry with a matching evaluator_id.
    const byComposite = new Map<string, JobEvaluator>();
    const byEvaluatorId = new Map<string, JobEvaluator>();
    for (const e of jobEvaluators) {
      if (e.evaluator_version_id) {
        byComposite.set(`${e.uuid}:${e.evaluator_version_id}`, e);
      }
      if (!byEvaluatorId.has(e.uuid)) byEvaluatorId.set(e.uuid, e);
    }
    const getJobEvaluator = (key: {
      evaluator_id: string;
      evaluator_version_id?: string;
    }): JobEvaluator | null => {
      if (key.evaluator_version_id) {
        const hit = byComposite.get(
          `${key.evaluator_id}:${key.evaluator_version_id}`,
        );
        if (hit) return hit;
      }
      return byEvaluatorId.get(key.evaluator_id) ?? null;
    };

    return {
      evaluators,
      evaluatorNamesById,
      getJobEvaluator,
      runs,
      versionLabels,
      humanAgreementForItem,
    };
  }, [summary, task, item, annotatorFilter]);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-black/50 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-background rounded-none md:rounded-xl w-full max-w-[92rem] h-full md:h-[92vh] flex flex-col shadow-2xl overflow-hidden"
      >
        <div className="relative flex items-center justify-between gap-3 px-4 md:px-6 py-3 md:py-4 border-b border-border">
          <div
            className="flex-1 min-w-0 flex items-center gap-2 md:max-w-[calc(50%-6rem)]"
            title={itemTitle(item)}
          >
            <h2 className="text-base md:text-lg font-semibold text-foreground truncate min-w-0">
              {itemTitle(item)}
            </h2>
          </div>
          {(onPrev || onNext) && (
            <div className="hidden md:flex absolute left-1/2 -translate-x-1/2 items-center gap-2 pointer-events-none">
              <div className="pointer-events-auto">
                <Tooltip position="bottom" content="Previous item">
                  <button
                    type="button"
                    onClick={onPrev}
                    disabled={!hasPrev}
                    aria-label="Previous item"
                    className="flex items-center justify-center w-8 h-8 rounded-md border border-border hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
                        d="M15 19l-7-7 7-7"
                      />
                    </svg>
                  </button>
                </Tooltip>
              </div>
              {position && position.total > 0 ? (
                <span className="text-xs text-muted-foreground tabular-nums min-w-[4rem] text-center">
                  {position.index + 1} of {position.total}
                </span>
              ) : (
                <span className="min-w-[4rem]" />
              )}
              <div className="pointer-events-auto">
                <Tooltip position="bottom" content="Next item">
                  <button
                    type="button"
                    onClick={onNext}
                    disabled={!hasNext}
                    aria-label="Next item"
                    className="flex items-center justify-center w-8 h-8 rounded-md border border-border hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
                        d="M9 5l7 7-7 7"
                      />
                    </svg>
                  </button>
                </Tooltip>
              </div>
            </div>
          )}
          <div className="flex items-center gap-2 shrink-0">
            {loading && summary && (
              <svg
                className="w-4 h-4 animate-spin text-muted-foreground"
                fill="none"
                viewBox="0 0 24 24"
                aria-label="Refreshing"
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
            )}
            {!loading && !error && summary && !hasAnyLabel && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
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
                    d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                  />
                </svg>
                No labels yet
              </span>
            )}
            {availableAnnotators.length > 0 && (
              <div className="w-56">
                <MultiSelectPicker
                  items={availableAnnotators}
                  selectedItems={effectiveSelectedAnnotators}
                  onSelectionChange={setSelectedAnnotators}
                  placeholder="All annotators"
                  searchPlaceholder="Search annotators"
                />
              </div>
            )}
            {hasAnyEvaluatorRun && (
            <Tooltip
              position="bottom"
              content="Show results for only the live versions of each evaluator. Toggle to see the results for all versions."
            >
              <button
                type="button"
                onClick={() => setLiveOnly((v) => !v)}
                aria-pressed={liveOnly}
                className={`h-11 px-4 inline-flex items-center gap-1.5 rounded-xl text-sm font-medium border transition-colors cursor-pointer ${
                  liveOnly
                    ? "bg-foreground text-background border-foreground"
                    : "bg-transparent text-muted-foreground border-border hover:border-muted-foreground hover:text-foreground"
                }`}
              >
                {liveOnly ? (
                  <svg
                    className="w-3.5 h-3.5"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.5 12.75l6 6 9-13.5"
                    />
                  </svg>
                ) : (
                  <span
                    className="inline-block w-1.5 h-1.5 rounded-full bg-muted-foreground"
                    aria-hidden
                  />
                )}
                Live versions only
              </button>
            </Tooltip>
            )}
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer"
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

        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          {error && !adapted ? (
            <div className="m-4 rounded-md border border-border bg-muted/20 p-4 text-sm text-red-500">
              {error}
            </div>
          ) : !task || !item || !adapted ? (
            <div className="flex-1 flex items-center justify-center gap-2 text-sm text-muted-foreground">
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
              Loading item
            </div>
          ) : (
            <ItemDetailPane
              item={item}
              taskType={task.type}
              evaluators={adapted.evaluators}
              evaluatorNamesById={adapted.evaluatorNamesById}
              getJobEvaluator={adapted.getJobEvaluator}
              runs={adapted.runs}
              versionLabels={adapted.versionLabels}
              jobStatus="completed"
              humanAgreementForItem={adapted.humanAgreementForItem}
              evaluatorVariablesByEvaluatorId={evaluatorVariables}
              filterDisagreements={false}
              linkEvaluators
              hideAgreementGlyph
              alwaysShowSourcePills
              showVersionInSourcePill
              groupVersionsByEvaluator
              annotatorFilterActive={annotatorFilter !== null}
            />
          )}
        </div>
      </div>
    </div>
  );
}
