"use client";

import { useEffect, useMemo, useState, type DragEvent } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import {
  EVALUATOR_TYPE_LABELS,
  EvaluatorTypePill,
  type EvaluatorType,
} from "@/components/EvaluatorPills";
import { apiClient } from "@/lib/api";

type EvaluatorListItem = {
  uuid: string;
  name: string;
  description?: string;
  evaluator_type?: EvaluatorType;
};

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

type ManageEvaluatorsDialogProps = {
  accessToken: string;
  taskUuid: string;
  taskType?: EvaluatorType;
  currentEvaluatorIds: string[];
  onClose: () => void;
  onSaved: () => void;
};

export function ManageEvaluatorsDialog({
  accessToken,
  taskUuid,
  taskType,
  currentEvaluatorIds,
  onClose,
  onSaved,
}: ManageEvaluatorsDialogProps) {
  useHideFloatingButton(true);

  const [selectedIds, setSelectedIds] = useState<Set<string>>(
    new Set(currentEvaluatorIds),
  );
  // Right-column ordered list of selected uuids. Initialized from the
  // current server-side order so opening the dialog mirrors what's on
  // the task header. Stays in sync with `selectedIds` as the user
  // toggles checkboxes (additions append; removals splice out).
  const [orderedSelected, setOrderedSelected] = useState<string[]>(() => [
    ...currentEvaluatorIds,
  ]);
  const [search, setSearch] = useState("");
  const [dragSourceIdx, setDragSourceIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  const [evaluators, setEvaluators] = useState<EvaluatorListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const data = await apiClient<EvaluatorListItem[]>(
          "/evaluators?include_defaults=true",
          accessToken,
        );
        if (!cancelled) setEvaluators(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled)
          setLoadError(parseApiError(err, "Failed to load evaluators"));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const filteredEvaluators = useMemo(() => {
    const q = search.trim().toLowerCase();
    return evaluators
      .filter((ev) => (taskType ? ev.evaluator_type === taskType : true))
      .filter((ev) => (q ? ev.name.toLowerCase().includes(q) : true));
  }, [evaluators, taskType, search]);

  const toggle = (uuid: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
    // Keep the right-column ordered list in sync: append on add,
    // splice out on remove. Preserves whatever order the user has
    // already arranged in the right column.
    setOrderedSelected((prev) => {
      if (prev.includes(uuid)) return prev.filter((id) => id !== uuid);
      return [...prev, uuid];
    });
  };

  const currentSet = useMemo(
    () => new Set(currentEvaluatorIds),
    [currentEvaluatorIds],
  );

  const toAdd = useMemo(
    () => orderedSelected.filter((id) => !currentSet.has(id)),
    [orderedSelected, currentSet],
  );
  const toRemove = useMemo(
    () => currentEvaluatorIds.filter((id) => !selectedIds.has(id)),
    [currentEvaluatorIds, selectedIds],
  );

  // True when the user has reordered the (kept-plus-added) evaluators
  // versus the order the server would land on after just running the
  // adds/removes. Drives whether we need a separate PUT /order call.
  const orderChanged = useMemo(() => {
    const removeSet = new Set(toRemove);
    const serverOrderAfterLinkOps = [
      ...currentEvaluatorIds.filter((id) => !removeSet.has(id)),
      ...toAdd,
    ];
    if (serverOrderAfterLinkOps.length !== orderedSelected.length) return false;
    return serverOrderAfterLinkOps.some((id, i) => id !== orderedSelected[i]);
  }, [currentEvaluatorIds, toAdd, toRemove, orderedSelected]);

  const hasChanges = toAdd.length > 0 || toRemove.length > 0 || orderChanged;
  const wouldRemoveAll = orderedSelected.length === 0;
  const canSave = hasChanges && !wouldRemoveAll;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      // Removes first so the order PUT only has to deal with the final
      // set. Adds + removes can run in parallel — the backend treats
      // them as independent link mutations.
      const removes = toRemove.map((evaluatorUuid) =>
        apiClient<{ message: string }>(
          `/annotation-tasks/${taskUuid}/evaluators/${evaluatorUuid}`,
          accessToken,
          { method: "DELETE" },
        ),
      );
      const adds = toAdd.map((evaluator_id) =>
        apiClient<{ message: string }>(
          `/annotation-tasks/${taskUuid}/evaluators`,
          accessToken,
          { method: "POST", body: { evaluator_id } },
        ),
      );
      await Promise.all([...removes, ...adds]);

      // After link mutations, the server's order is
      // (kept-from-original) followed by (new adds, in append order).
      // PUT only when the user's desired order differs from that — or
      // when there were no link changes at all (pure reorder).
      const removeSet = new Set(toRemove);
      const serverOrderAfterLinkOps = [
        ...currentEvaluatorIds.filter((id) => !removeSet.has(id)),
        ...toAdd,
      ];
      const needsOrderPut =
        serverOrderAfterLinkOps.length === orderedSelected.length &&
        serverOrderAfterLinkOps.some((id, i) => id !== orderedSelected[i]);
      if (needsOrderPut) {
        await apiClient<{ message: string }>(
          `/annotation-tasks/${taskUuid}/evaluators/order`,
          accessToken,
          {
            method: "PUT",
            body: { evaluator_ids: orderedSelected },
          },
        );
      }
      onSaved();
    } catch (err) {
      setSaveError(parseApiError(err, "Failed to update evaluators"));
    } finally {
      setSaving(false);
    }
  };

  const evaluatorByUuid = useMemo(() => {
    const m = new Map<string, EvaluatorListItem>();
    for (const ev of evaluators) m.set(ev.uuid, ev);
    return m;
  }, [evaluators]);

  const handleCardDragStart = (idx: number, e: DragEvent) => {
    setDragSourceIdx(idx);
    e.dataTransfer.effectAllowed = "move";
    // Firefox needs data set or the drag is cancelled.
    e.dataTransfer.setData("text/plain", String(idx));
  };

  const handleCardDragOver = (idx: number, e: DragEvent) => {
    if (dragSourceIdx === null) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverIdx !== idx) setDragOverIdx(idx);
  };

  const handleCardDrop = (idx: number, e: DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const source = dragSourceIdx;
    setDragSourceIdx(null);
    setDragOverIdx(null);
    if (source === null || source === idx) return;
    setOrderedSelected((prev) => {
      const next = [...prev];
      const [moved] = next.splice(source, 1);
      next.splice(idx, 0, moved);
      return next;
    });
  };

  const handleCardDragEnd = () => {
    setDragSourceIdx(null);
    setDragOverIdx(null);
  };

  const handleRemoveSelected = (uuid: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(uuid);
      return next;
    });
    setOrderedSelected((prev) => prev.filter((id) => id !== uuid));
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="bg-background border border-border rounded-xl w-full max-w-5xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 md:px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-foreground">
              Manage evaluators
            </h2>
            <div className="text-xs md:text-sm text-muted-foreground mt-1">
              {taskType ? (
                <div className="inline-flex flex-wrap items-center gap-1.5">
                  Choose
                  <EvaluatorTypePill evaluatorType={taskType} />
                  evaluators to align with humans
                </div>
              ) : (
                "Choose evaluators to align with humans"
              )}
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={saving}
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

        <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
              <span>{orderedSelected.length} selected</span>
              {toAdd.length > 0 && (
                <span className="text-emerald-600">+{toAdd.length} to add</span>
              )}
              {toRemove.length > 0 && (
                <span className="text-red-500">
                  −{toRemove.length} to remove
                </span>
              )}
            </div>
            {orderChanged && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border border-amber-500/40 bg-amber-500/15 text-amber-700 dark:text-amber-300 uppercase tracking-wide flex-shrink-0">
                Order Changed
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 md:gap-10">
            {/* Left column: catalogue with checkboxes */}
            <div className="flex flex-col gap-2 min-w-0">
              <div className="relative">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <svg
                    className="w-4 h-4 text-muted-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                    />
                  </svg>
                </div>
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search evaluators"
                  className="w-full h-9 pl-9 pr-3 rounded-md text-sm border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div className="border border-border rounded-md max-h-80 overflow-y-auto divide-y divide-border">
                {loading ? (
                  <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
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
                    Loading evaluators
                  </div>
                ) : loadError ? (
                  <div className="p-4 text-sm text-red-500">{loadError}</div>
                ) : filteredEvaluators.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">
                    {search.trim()
                      ? "No matching evaluators."
                      : taskType
                        ? `No ${EVALUATOR_TYPE_LABELS[taskType]} evaluators yet.`
                        : "No evaluators yet."}
                  </div>
                ) : (
                  filteredEvaluators.map((ev) => {
                    const checked = selectedIds.has(ev.uuid);
                    return (
                      <label
                        key={ev.uuid}
                        className="flex items-start gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggle(ev.uuid)}
                          className="mt-0.5 w-4 h-4 cursor-pointer accent-foreground"
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
                  })
                )}
              </div>
            </div>

            {/* Right column: ordered selected list (drag to reorder) */}
            <div className="flex flex-col gap-2 min-w-0">
              {/* Match the h-9 search input height on the left so the
                  cards below line up with the catalogue list. */}
              <p className="h-9 flex items-center text-xs text-muted-foreground">
                Drag the cards to set the order evaluators appear in across the
                task
              </p>
              <div className="max-h-80 overflow-y-auto space-y-2">
                {orderedSelected.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground text-center">
                    Pick an evaluator on the left to add it here.
                  </div>
                ) : (
                  orderedSelected.map((uuid, idx) => {
                    const ev = evaluatorByUuid.get(uuid);
                    const isDragging = dragSourceIdx === idx;
                    const isDropTarget =
                      dragOverIdx === idx &&
                      dragSourceIdx !== null &&
                      dragSourceIdx !== idx;
                    return (
                      <div
                        key={uuid}
                        draggable={!saving}
                        onDragStart={(e) => handleCardDragStart(idx, e)}
                        onDragOver={(e) => handleCardDragOver(idx, e)}
                        onDragLeave={() => {
                          if (dragOverIdx === idx) setDragOverIdx(null);
                        }}
                        onDrop={(e) => handleCardDrop(idx, e)}
                        onDragEnd={handleCardDragEnd}
                        className={`flex items-start gap-2 px-3 py-2.5 rounded-md border bg-background select-none transition-all ${
                          isDropTarget
                            ? "border-foreground/60 ring-2 ring-foreground/20"
                            : "border-border"
                        } ${isDragging ? "opacity-50" : ""} ${
                          saving
                            ? "cursor-not-allowed"
                            : "cursor-grab active:cursor-grabbing"
                        }`}
                      >
                        <svg
                          className="w-4 h-4 text-muted-foreground mt-0.5 flex-shrink-0"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                          aria-hidden="true"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M4 6h16M4 12h16M4 18h16"
                          />
                        </svg>
                        <span className="text-xs text-muted-foreground tabular-nums mt-0.5 w-5 flex-shrink-0">
                          {idx + 1}.
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">
                            {ev?.name ?? uuid.slice(0, 8)}
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveSelected(uuid)}
                          aria-label={`Remove ${ev?.name ?? "evaluator"}`}
                          title="Remove from selection"
                          disabled={saving}
                          className="flex-shrink-0 w-6 h-6 flex items-center justify-center rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
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
                    );
                  })
                )}
              </div>
            </div>
          </div>

          {wouldRemoveAll && (
            <p className="text-xs text-red-500">
              A task must have at least one evaluator.
            </p>
          )}

          {saveError && (
            <div className="rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
              {saveError}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 md:gap-3 px-5 md:px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            disabled={saving}
            className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium border border-border bg-background dark:bg-muted hover:bg-muted/50 dark:hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!canSave || saving}
            title={
              wouldRemoveAll
                ? "A task must have at least one evaluator"
                : undefined
            }
            className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </div>
  );
}
