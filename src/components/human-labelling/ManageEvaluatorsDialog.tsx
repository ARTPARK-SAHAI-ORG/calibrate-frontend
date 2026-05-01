"use client";

import { useEffect, useMemo, useState } from "react";
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
  const [search, setSearch] = useState("");

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
  };

  const currentSet = useMemo(
    () => new Set(currentEvaluatorIds),
    [currentEvaluatorIds],
  );

  const toAdd = useMemo(
    () => Array.from(selectedIds).filter((id) => !currentSet.has(id)),
    [selectedIds, currentSet],
  );
  const toRemove = useMemo(
    () => currentEvaluatorIds.filter((id) => !selectedIds.has(id)),
    [currentEvaluatorIds, selectedIds],
  );

  const hasChanges = toAdd.length > 0 || toRemove.length > 0;
  const wouldRemoveAll = selectedIds.size === 0;
  const canSave = hasChanges && !wouldRemoveAll;

  const handleSave = async () => {
    if (!canSave || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const adds = toAdd.map((evaluator_id) =>
        apiClient<{ message: string }>(
          `/annotation-tasks/${taskUuid}/evaluators`,
          accessToken,
          { method: "POST", body: { evaluator_id } },
        ),
      );
      const removes = toRemove.map((evaluatorUuid) =>
        apiClient<{ message: string }>(
          `/annotation-tasks/${taskUuid}/evaluators/${evaluatorUuid}`,
          accessToken,
          { method: "DELETE" },
        ),
      );
      await Promise.all([...adds, ...removes]);
      onSaved();
    } catch (err) {
      setSaveError(parseApiError(err, "Failed to update evaluators"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={() => {
        if (!saving) onClose();
      }}
    >
      <div
        className="bg-background border border-border rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 md:px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-foreground">
              Manage evaluators
            </h2>
            <p className="text-xs md:text-sm text-muted-foreground mt-1">
              {taskType ? (
                <span className="inline-flex flex-wrap items-center gap-1.5">
                  Choose which
                  <EvaluatorTypePill evaluatorType={taskType} />
                  evaluators need to be aligned with humans
                </span>
              ) : (
                "Choose which evaluators need to be aligned with humans"
              )}
            </p>
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
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span>{selectedIds.size} selected</span>
            </div>
            {hasChanges && (
              <span className="text-xs flex items-center gap-2">
                {toAdd.length > 0 && (
                  <span className="text-emerald-600">
                    +{toAdd.length} to add
                  </span>
                )}
                {toRemove.length > 0 && (
                  <span className="text-red-500">
                    −{toRemove.length} to remove
                  </span>
                )}
              </span>
            )}
          </div>

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
