"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import { apiClient } from "@/lib/api";
import { reportError } from "@/lib/reportError";
import { useAccessToken } from "@/hooks/useAccessToken";
import type { TestCaseResult } from "@/components/TestRunnerDialog";
import type { BenchmarkModelResult } from "@/components/eval-details";
import type {
  TestCaseHistory,
  TestRunEvaluator,
} from "@/components/test-results/shared";

export const SUPPORTED_TARGET_TASK_TYPES = ["llm"] as const;
export type SupportedTaskType = (typeof SUPPORTED_TARGET_TASK_TYPES)[number];

export type AddRunToLabellingTaskSource =
  | {
      type: "test_run";
      runUuid: string;
      runName?: string;
      results: TestCaseResult[];
      evaluators?: TestRunEvaluator[];
    }
  | {
      type: "benchmark_run";
      benchmarkUuid: string;
      benchmarkName?: string;
      modelResults: BenchmarkModelResult[];
      evaluators?: TestRunEvaluator[];
    };

export type AddRunToLabellingTaskDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  source: AddRunToLabellingTaskSource;
  onAdded?: (taskUuid: string, itemsCreated: number) => void;
};

type LabellingTaskEvaluatorRef = {
  uuid: string;
  name?: string;
};

type LabellingTask = {
  uuid: string;
  name: string;
  type?: "llm" | "llm-general" | "stt" | "tts" | "conversation";
  description?: string;
  item_count?: number;
  evaluators?: LabellingTaskEvaluatorRef[];
};

type BuiltItem = {
  payload: {
    name: string;
    description?: string;
    chat_history: TestCaseHistory[];
    agent_response: string;
    evaluator_variables: Record<string, Record<string, string>>;
  };
};

type TransformResult = {
  items: BuiltItem[];
  skippedCount: number;
  evaluatorUuids: Set<string>;
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

type RawTestCaseLike = {
  test_case?: {
    name?: string;
    evaluation?: { type?: string } | null;
    config?: { history?: TestCaseHistory[] } | null;
    evaluators?: Array<{
      evaluator_uuid?: string | null;
      uuid?: string | null;
      variable_values?: Record<string, string> | null;
    }> | null;
  } | null;
  test_name?: string;
  name?: string;
  chat_history?: TestCaseHistory[];
  output?: { response?: string } | null;
};

function buildOneItem(
  raw: RawTestCaseLike,
  nameOverride?: string,
): { item: BuiltItem; evaluatorUuids: string[] } | null {
  const evalType = raw.test_case?.evaluation?.type;
  if (evalType !== "response") return null;

  const name =
    nameOverride ??
    raw.test_case?.name ??
    raw.test_name ??
    raw.name ??
    "Untitled test";

  const chat_history =
    raw.test_case?.config?.history ?? raw.chat_history ?? [];
  const agent_response = raw.output?.response ?? "";

  const evaluator_variables: Record<string, Record<string, string>> = {};
  const evaluatorUuids: string[] = [];
  const evalRefs = raw.test_case?.evaluators ?? [];
  for (const ref of evalRefs) {
    const uuid = ref?.evaluator_uuid ?? ref?.uuid ?? null;
    if (!uuid) continue;
    evaluatorUuids.push(uuid);
    if (ref?.variable_values && typeof ref.variable_values === "object") {
      evaluator_variables[uuid] = { ...ref.variable_values };
    }
  }

  return {
    item: {
      payload: {
        name,
        chat_history,
        agent_response,
        evaluator_variables,
      },
    },
    evaluatorUuids,
  };
}

export function buildItemsFromSource(
  source: AddRunToLabellingTaskSource,
  taskType: SupportedTaskType,
): TransformResult {
  const items: BuiltItem[] = [];
  const evaluatorUuids = new Set<string>();
  let skippedCount = 0;

  switch (taskType) {
    case "llm": {
      if (source.type === "test_run") {
        for (const r of source.results) {
          const raw = r as RawTestCaseLike;
          const baseName =
            raw.test_case?.name ?? raw.test_name ?? raw.name ?? "Untitled test";
          const built = buildOneItem(
            raw,
            `${baseName} — ${source.runUuid}`,
          );
          if (!built) {
            skippedCount += 1;
            continue;
          }
          items.push(built.item);
          for (const id of built.evaluatorUuids) evaluatorUuids.add(id);
        }
      } else if (source.type === "benchmark_run") {
        for (const mr of source.modelResults) {
          const testResults = mr.test_results ?? [];
          for (const r of testResults) {
            const raw = r as RawTestCaseLike;
            const baseName =
              raw.test_case?.name ?? raw.test_name ?? raw.name ?? "Untitled test";
            const built = buildOneItem(
              raw,
              `${baseName} — ${source.benchmarkUuid} — ${mr.model}`,
            );
            if (!built) {
              skippedCount += 1;
              continue;
            }
            items.push(built.item);
            for (const id of built.evaluatorUuids) evaluatorUuids.add(id);
          }
        }
      }
      return { items, skippedCount, evaluatorUuids };
    }
    default:
      return { items: [], skippedCount: 0, evaluatorUuids: new Set() };
  }
}

type Mode = "existing" | "new";

export function AddRunToLabellingTaskDialog({
  isOpen,
  onClose,
  source,
  onAdded,
}: AddRunToLabellingTaskDialogProps): React.ReactElement | null {
  const accessToken = useAccessToken();
  const mountedRef = useRef(true);

  const [tasks, setTasks] = useState<LabellingTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);

  const [mode, setMode] = useState<Mode>("existing");
  const [selectedTaskUuid, setSelectedTaskUuid] = useState<string>("");
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [nameInvalid, setNameInvalid] = useState(false);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    taskUuid: string;
    taskName: string;
    itemsCreated: number;
  } | null>(null);
  const onAddedFiredRef = useRef(false);

  // Always pick the first supported task type for now ("llm"). Widening to more
  // types means picking the right one from `SUPPORTED_TARGET_TASK_TYPES` based
  // on source — that's a future change, the seam is `buildItemsFromSource`.
  const targetTaskType: SupportedTaskType = SUPPORTED_TARGET_TASK_TYPES[0];

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setMode("existing");
    setSelectedTaskUuid("");
    setNewName("");
    setNewDescription("");
    setNameInvalid(false);
    setSubmitting(false);
    setSubmitError(null);
    setSuccess(null);
    onAddedFiredRef.current = false;
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || !accessToken) return;
    let cancelled = false;
    const run = async () => {
      setTasksLoading(true);
      setTasksError(null);
      try {
        const data = await apiClient<LabellingTask[]>(
          "/annotation-tasks",
          accessToken,
        );
        if (cancelled || !mountedRef.current) return;
        setTasks(Array.isArray(data) ? data : []);
      } catch (err) {
        reportError(
          "AddRunToLabellingTaskDialog: failed to load labelling tasks",
          err,
        );
        if (cancelled || !mountedRef.current) return;
        setTasksError(parseApiError(err, "Failed to load labelling tasks"));
      } finally {
        if (!cancelled && mountedRef.current) setTasksLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [isOpen, accessToken]);

  const supportedTasks = useMemo(
    () =>
      tasks.filter((t) =>
        (SUPPORTED_TARGET_TASK_TYPES as readonly string[]).includes(
          t.type ?? "",
        ),
      ),
    [tasks],
  );

  useEffect(() => {
    if (mode !== "existing") return;
    if (supportedTasks.length === 1 && !selectedTaskUuid) {
      setSelectedTaskUuid(supportedTasks[0].uuid);
    }
  }, [mode, supportedTasks, selectedTaskUuid]);

  const transform = useMemo(
    () => buildItemsFromSource(source, targetTaskType),
    [source, targetTaskType],
  );
  const { items, skippedCount, evaluatorUuids } = transform;

  const selectedTask = useMemo(
    () => supportedTasks.find((t) => t.uuid === selectedTaskUuid) ?? null,
    [supportedTasks, selectedTaskUuid],
  );

  const canSubmit = (() => {
    if (submitting || success) return false;
    if (items.length === 0) return false;
    if (mode === "existing") return !!selectedTaskUuid;
    return newName.trim().length > 0;
  })();

  const handleSubmit = async () => {
    if (!canSubmit || !accessToken) return;
    if (mode === "new" && !newName.trim()) {
      setNameInvalid(true);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      let taskUuid: string;
      let taskName: string;

      if (mode === "new") {
        const body: {
          name: string;
          type: SupportedTaskType;
          description?: string;
          evaluator_ids?: string[];
        } = {
          name: newName.trim(),
          type: targetTaskType,
        };
        if (newDescription.trim()) body.description = newDescription.trim();
        if (evaluatorUuids.size > 0)
          body.evaluator_ids = Array.from(evaluatorUuids);
        const created = await apiClient<{ uuid: string; message?: string }>(
          "/annotation-tasks",
          accessToken,
          { method: "POST", body },
        );
        taskUuid = created.uuid;
        taskName = newName.trim();
      } else {
        if (!selectedTask) {
          setSubmitError("Pick a task to add items to.");
          setSubmitting(false);
          return;
        }
        taskUuid = selectedTask.uuid;
        taskName = selectedTask.name;
        const existing = new Set(
          (selectedTask.evaluators ?? []).map((e) => e.uuid),
        );
        const toAttach = Array.from(evaluatorUuids).filter(
          (uuid) => !existing.has(uuid),
        );
        for (const evaluator_id of toAttach) {
          try {
            await apiClient(
              `/annotation-tasks/${taskUuid}/evaluators`,
              accessToken,
              { method: "POST", body: { evaluator_id } },
            );
          } catch (err) {
            reportError(
              "AddRunToLabellingTaskDialog: failed to attach evaluator to task",
              err,
            );
            if (!mountedRef.current) return;
            setSubmitError(parseApiError(err, "Failed to attach evaluator"));
            setSubmitting(false);
            return;
          }
        }
      }

      await apiClient(`/annotation-tasks/${taskUuid}/items`, accessToken, {
        method: "POST",
        body: { items },
      });

      if (!mountedRef.current) return;
      setSuccess({ taskUuid, taskName, itemsCreated: items.length });
      if (onAdded && !onAddedFiredRef.current) {
        onAddedFiredRef.current = true;
        onAdded(taskUuid, items.length);
      }
    } catch (err) {
      reportError(
        "AddRunToLabellingTaskDialog: failed to add items to task",
        err,
      );
      if (!mountedRef.current) return;
      setSubmitError(parseApiError(err, "Failed to add items"));
    } finally {
      if (mountedRef.current) setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const previewText = (() => {
    if (items.length === 0) return "No supported results to add.";
    const itemPart = `${items.length} item${items.length === 1 ? "" : "s"} will be added.`;
    const skipPart = skippedCount
      ? ` ${skippedCount} tool-call result${skippedCount === 1 ? "" : "s"} will be skipped.`
      : "";
    return `${itemPart}${skipPart}`;
  })();

  const actionLabel = mode === "new" ? "Create task & add" : "Add to task";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-lg rounded-xl bg-background border border-border p-6 shadow-xl">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="text-base md:text-lg font-semibold text-foreground">
            Add to labelling task
          </h2>
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
            aria-label="Close"
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

        {success ? (
          <div className="space-y-4">
            <p className="text-sm text-foreground">
              Added {success.itemsCreated} item
              {success.itemsCreated === 1 ? "" : "s"} to{" "}
              <span className="font-medium">{success.taskName}</span>.
            </p>
            <div className="flex items-center justify-end">
              <button
                onClick={onClose}
                className="h-9 md:h-10 px-4 rounded-lg text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="inline-flex rounded-lg border border-border p-0.5 bg-muted/30">
              <button
                type="button"
                onClick={() => setMode("existing")}
                disabled={submitting}
                className={`h-8 px-3 rounded-md text-xs md:text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  mode === "existing"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Use existing task
              </button>
              <button
                type="button"
                onClick={() => setMode("new")}
                disabled={submitting}
                className={`h-8 px-3 rounded-md text-xs md:text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                  mode === "new"
                    ? "bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Create new task
              </button>
            </div>

            {mode === "existing" ? (
              <div>
                <label className="block text-sm font-medium mb-2">
                  Labelling task
                </label>
                {tasksLoading ? (
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
                    Loading tasks
                  </div>
                ) : tasksError ? (
                  <p className="text-sm text-red-500">{tasksError}</p>
                ) : supportedTasks.length === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    No LLM labelling tasks yet. Switch to{" "}
                    <button
                      type="button"
                      onClick={() => setMode("new")}
                      className="underline cursor-pointer"
                    >
                      create new task
                    </button>{" "}
                    to make one.
                  </p>
                ) : (
                  <select
                    value={selectedTaskUuid}
                    onChange={(e) => setSelectedTaskUuid(e.target.value)}
                    disabled={submitting}
                    className="w-full h-10 px-3 rounded-md text-sm border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
                  >
                    <option value="">Select a task…</option>
                    {supportedTasks.map((t) => (
                      <option key={t.uuid} value={t.uuid}>
                        {t.name}
                        {typeof t.item_count === "number"
                          ? ` (${t.item_count} items)`
                          : ""}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            ) : (
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Name <span className="text-red-500">*</span>
                  </label>
                  <input
                    autoFocus
                    value={newName}
                    onChange={(e) => {
                      setNewName(e.target.value);
                      if (nameInvalid) setNameInvalid(false);
                    }}
                    placeholder="e.g. Next-reply review — May batch"
                    disabled={submitting}
                    className={`w-full h-10 px-3 rounded-md text-sm border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed ${
                      nameInvalid ? "border-red-500" : "border-border"
                    }`}
                  />
                  {nameInvalid && (
                    <p className="mt-1 text-sm text-red-500">
                      Name is required.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">
                    Description
                  </label>
                  <textarea
                    value={newDescription}
                    onChange={(e) => setNewDescription(e.target.value)}
                    placeholder="Short description of the labelling task"
                    rows={3}
                    disabled={submitting}
                    className="w-full px-3 py-2 rounded-md text-sm border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent resize-y disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                </div>
              </div>
            )}

            <p className="text-xs text-muted-foreground">{previewText}</p>

            {submitError && (
              <p className="text-sm text-red-500">{submitError}</p>
            )}

            <div className="flex items-center justify-end gap-2 md:gap-3 pt-2">
              <button
                onClick={onClose}
                disabled={submitting}
                className="h-9 md:h-10 px-4 rounded-lg text-sm md:text-base font-medium border border-border bg-background dark:bg-muted hover:bg-muted/50 dark:hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Cancel
              </button>
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="h-9 md:h-10 px-4 rounded-lg text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Adding…" : actionLabel}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
