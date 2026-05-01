"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import {
  ItemPane,
  type Item,
  type Task,
} from "@/components/human-labelling/AnnotationJobView";
import { useAccessToken } from "@/hooks";
import { apiClient } from "@/lib/api";
import { useSidebarState } from "@/lib/sidebar";

type EvaluatorRunRow = {
  uuid: string;
  job_id: string;
  item_id: string;
  evaluator_id: string;
  evaluator_version_id: string;
  value: { value?: unknown; reasoning?: unknown } | null;
  status: string;
  created_at: string;
  completed_at: string | null;
};

type EvaluatorRunJob = {
  uuid: string;
  task_id: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  details: {
    evaluators?: {
      evaluator_id: string;
      evaluator_version_id?: string;
      name?: string;
    }[];
    item_count?: number;
    s3_prefix?: string;
    item_ids?: string[];
  } | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
  runs: EvaluatorRunRow[];
};

type LabellingTaskFull = {
  uuid: string;
  name: string;
  type: "llm" | "stt" | "tts" | "simulation";
  description?: string | null;
  items?: Item[];
};

function parseApiError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  const m = err.message.match(/Request failed: \d+ - (.+)$/);
  if (m) {
    try {
      const parsed = JSON.parse(m[1]);
      if (parsed && typeof parsed.detail === "string") return parsed.detail;
    } catch {
      // ignore
    }
    return m[1];
  }
  return err.message || fallback;
}

function statusPillClass(status: EvaluatorRunJob["status"]): string {
  switch (status) {
    case "completed":
      return "border-green-200 bg-green-100 text-green-700 dark:border-green-500/30 dark:bg-green-500/20 dark:text-green-400";
    case "failed":
      return "border-red-200 bg-red-100 text-red-700 dark:border-red-500/30 dark:bg-red-500/20 dark:text-red-400";
    case "in_progress":
      return "border-yellow-200 bg-yellow-100 text-yellow-700 dark:border-yellow-500/30 dark:bg-yellow-500/20 dark:text-yellow-400";
    default:
      return "border-gray-200 bg-gray-100 text-gray-700 dark:border-gray-500/30 dark:bg-gray-500/20 dark:text-gray-300";
  }
}

function statusLabel(status: EvaluatorRunJob["status"]): string {
  if (status === "queued") return "Queued";
  if (status === "in_progress") return "In progress";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  return status;
}

function formatValueDisplay(v: unknown): string {
  if (v === true) return "Correct";
  if (v === false) return "Wrong";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return v;
  return "—";
}

function valuePillClass(v: unknown): string {
  if (v === true)
    return "border-green-200 bg-green-100 text-green-700 dark:border-green-500/30 dark:bg-green-500/20 dark:text-green-400";
  if (v === false)
    return "border-red-200 bg-red-100 text-red-700 dark:border-red-500/30 dark:bg-red-500/20 dark:text-red-400";
  return "border-border bg-muted/40 text-foreground";
}

export default function EvaluatorRunDetailPage() {
  const router = useRouter();
  const params = useParams();
  const accessToken = useAccessToken();
  const [sidebarOpen, setSidebarOpen] = useSidebarState();

  const taskUuid =
    typeof params?.uuid === "string"
      ? params.uuid
      : Array.isArray(params?.uuid)
        ? params.uuid[0]
        : "";
  const runUuid =
    typeof params?.runUuid === "string"
      ? params.runUuid
      : Array.isArray(params?.runUuid)
        ? params.runUuid[0]
        : "";

  const [job, setJob] = useState<EvaluatorRunJob | null>(null);
  const [task, setTask] = useState<LabellingTaskFull | null>(null);
  const [versionLabels, setVersionLabels] = useState<Record<string, string>>(
    {},
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const startTime = useRef(Date.now());

  useEffect(() => {
    document.title = "Evaluation run | Calibrate";
  }, []);

  const fetchJob = useCallback(async () => {
    if (!accessToken || !taskUuid || !runUuid) return null;
    try {
      const data = await apiClient<EvaluatorRunJob>(
        `/annotation-tasks/${taskUuid}/evaluator-runs/${runUuid}`,
        accessToken,
      );
      setJob(data);
      setError(null);
      setLoading(false);
      return data;
    } catch (err) {
      setError(parseApiError(err, "Failed to load run"));
      setLoading(false);
      return null;
    }
  }, [accessToken, taskUuid, runUuid]);

  // Fetch the task once for items.
  useEffect(() => {
    if (!accessToken || !taskUuid) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiClient<LabellingTaskFull>(
          `/annotation-tasks/${taskUuid}`,
          accessToken,
        );
        if (!cancelled) setTask(data);
      } catch {
        // surfaced below
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, taskUuid]);

  // Poll the run.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      if (cancelled) return;
      const data = await fetchJob();
      if (cancelled) return;
      const isTerminal =
        data && (data.status === "completed" || data.status === "failed");
      if (!isTerminal) {
        const elapsed = Date.now() - startTime.current;
        const delay = elapsed < 30_000 ? 2500 : 5000;
        timer = setTimeout(tick, delay);
      }
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [fetchJob]);

  // Lazily fetch version labels for evaluators referenced by the run.
  useEffect(() => {
    if (!accessToken || !job) return;
    const evIds = new Set<string>();
    for (const e of job.details?.evaluators ?? []) {
      if (e.evaluator_id) evIds.add(e.evaluator_id);
    }
    if (evIds.size === 0) return;
    let cancelled = false;
    (async () => {
      const merged: Record<string, string> = {};
      await Promise.all(
        Array.from(evIds).map(async (evaluatorId) => {
          try {
            const versions = await apiClient<
              Array<{ uuid: string; version_number: number }>
            >(`/evaluators/${evaluatorId}/versions`, accessToken);
            for (const v of versions) {
              merged[v.uuid] = `v${v.version_number}`;
            }
          } catch {
            // ignore
          }
        }),
      );
      if (!cancelled) setVersionLabels((prev) => ({ ...prev, ...merged }));
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken, job]);

  // Limit the items displayed to those actually in this run.
  // Source of truth (in priority order):
  //   1. details.item_ids — explicit subset persisted at run creation
  //   2. unique item_ids from runs[] — once results land
  //   3. fall back to all task items (only happens for in-progress full-task runs)
  const itemsForRun: Item[] = (() => {
    if (!task?.items) return [];
    const subset = job?.details?.item_ids;
    if (subset && subset.length > 0) {
      const set = new Set(subset);
      return task.items.filter((i) => set.has(i.uuid));
    }
    const fromRuns = new Set<string>();
    for (const r of job?.runs ?? []) {
      if (r.item_id) fromRuns.add(r.item_id);
    }
    if (fromRuns.size > 0) {
      return task.items.filter((i) => fromRuns.has(i.uuid));
    }
    // Cap at item_count when known so an in-progress full-task run shows the
    // right number even before any rows have been written.
    const cap = job?.details?.item_count;
    if (typeof cap === "number" && cap >= 0 && cap < task.items.length) {
      return task.items.slice(0, cap);
    }
    return task.items;
  })();

  const total = itemsForRun.length;
  const safeIndex = Math.min(Math.max(currentIndex, 0), Math.max(total - 1, 0));
  const currentItem: Item | undefined = itemsForRun[safeIndex];

  // Group runs by item_id for quick lookup.
  const runsByItem = (() => {
    const m: Record<string, EvaluatorRunRow[]> = {};
    for (const r of job?.runs ?? []) {
      (m[r.item_id] = m[r.item_id] ?? []).push(r);
    }
    return m;
  })();

  const itemDone = (itemId: string): boolean => {
    if (!job || job.status !== "completed") return false;
    const rs = runsByItem[itemId] ?? [];
    const evaluators = job.details?.evaluators ?? [];
    if (rs.length === 0 || evaluators.length === 0) return false;
    return evaluators.every((e) =>
      rs.some(
        (r) =>
          r.evaluator_id === e.evaluator_id &&
          (!e.evaluator_version_id ||
            r.evaluator_version_id === e.evaluator_version_id) &&
          r.status === "completed",
      ),
    );
  };

  return (
    <AppLayout
      activeItem="human-labelling"
      onItemChange={(id) => router.push(`/${id}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
    >
      <div className="py-4 md:py-6 space-y-4">
        <button
          onClick={() =>
            router.push(`/human-labelling/tasks/${taskUuid}?tab=runs`)
          }
          className="text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center gap-1.5"
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
          Back to evaluation runs
        </button>

        {loading && !job && (
          <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
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
            Loading run
          </div>
        )}

        {error && (
          <div className="rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
            {error}
          </div>
        )}

        {job && task && (task.type === "stt" || task.type === "llm" || task.type === "simulation") ? (
          <>
            <div>
              <span
                className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${statusPillClass(
                  job.status,
                )}`}
              >
                {statusLabel(job.status)}
              </span>
            </div>
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              {(job.details?.evaluators ?? []).length === 0 ? (
                <span className="text-sm text-muted-foreground">—</span>
              ) : (
                (job.details?.evaluators ?? []).map((e) => {
                  const name = e.name || e.evaluator_id.slice(0, 8);
                  const label = e.evaluator_version_id
                    ? versionLabels[e.evaluator_version_id]
                    : null;
                  return (
                    <Link
                      key={`${e.evaluator_id}-${e.evaluator_version_id ?? ""}`}
                      href={`/evaluators/${e.evaluator_id}`}
                      title={`Open ${name}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-sm font-semibold border border-border bg-muted/40 text-foreground hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer"
                    >
                      <span className="truncate max-w-[200px]">{name}</span>
                      {label && (
                        <span className="font-mono text-[11px] text-muted-foreground">
                          {label}
                        </span>
                      )}
                    </Link>
                  );
                })
              )}
            </div>

          <div className="border border-border rounded-xl overflow-hidden">
            <div className="flex flex-col flex-1 min-h-0">
              <header className="border-b border-border px-4 md:px-6 py-3 flex items-center justify-center gap-2">
                <button
                  onClick={() =>
                    setCurrentIndex(Math.max(0, currentIndex - 1))
                  }
                  disabled={currentIndex === 0 || total === 0}
                  className="h-9 px-3 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Previous
                </button>
                <span className="text-sm text-muted-foreground tabular-nums px-2">
                  Item {Math.min(currentIndex + 1, Math.max(total, 1))} of{" "}
                  {total}
                </span>
                <button
                  onClick={() =>
                    setCurrentIndex(Math.min(total - 1, currentIndex + 1))
                  }
                  disabled={currentIndex >= total - 1 || total === 0}
                  className="h-9 px-3 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Next
                </button>
              </header>

              <div className="flex flex-col md:flex-row min-h-0">
                <aside className="w-full md:w-20 border-b md:border-b-0 md:border-r border-border bg-muted/20 overflow-y-auto">
                  <div className="p-2 md:p-3 grid grid-cols-8 md:grid-cols-1 gap-2">
                    {itemsForRun.map((it, i) => {
                      const done = itemDone(it.uuid);
                      const isCurrent = i === safeIndex;
                      return (
                        <button
                          key={it.uuid}
                          onClick={() => setCurrentIndex(i)}
                          title={`Item ${i + 1}${done ? " (completed)" : ""}`}
                          className={`h-10 w-full rounded-md border text-sm font-medium transition-colors cursor-pointer flex items-center justify-center ${
                            isCurrent
                              ? "border-foreground bg-foreground text-background"
                              : done
                                ? "border-blue-200 bg-blue-100 text-blue-700 dark:border-blue-500/30 dark:bg-blue-500/20 dark:text-blue-400"
                                : "border-border bg-background text-foreground hover:bg-muted/50"
                          }`}
                        >
                          {i + 1}
                        </button>
                      );
                    })}
                  </div>
                </aside>

                <main className="flex-1 overflow-y-auto">
                  {!currentItem ? (
                    <div className="flex items-center justify-center h-full p-8 text-sm text-muted-foreground">
                      No items in this run.
                    </div>
                  ) : (
                    <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                      <ItemPane item={currentItem} taskType={task.type} />
                      <EvaluatorResultsPane
                        evaluators={job.details?.evaluators ?? []}
                        runs={runsByItem[currentItem.uuid] ?? []}
                        versionLabels={versionLabels}
                        jobStatus={job.status}
                      />
                    </div>
                  )}
                </main>
              </div>
            </div>
          </div>
          </>
        ) : null}

        {job && job.status === "failed" && job.error && (
          <div className="border border-red-500/30 bg-red-500/10 rounded-xl p-4">
            <h2 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2">
              Run failed
            </h2>
            <pre className="text-xs font-mono text-red-700 dark:text-red-300 whitespace-pre-wrap break-words">
              {job.error}
            </pre>
          </div>
        )}
      </div>
    </AppLayout>
  );
}

function EvaluatorResultsPane({
  evaluators,
  runs,
  versionLabels,
  jobStatus,
}: {
  evaluators: {
    evaluator_id: string;
    evaluator_version_id?: string;
    name?: string;
  }[];
  runs: EvaluatorRunRow[];
  versionLabels: Record<string, string>;
  jobStatus: EvaluatorRunJob["status"];
}) {
  if (evaluators.length === 0) {
    return (
      <div className="border border-border rounded-xl p-4 text-sm text-muted-foreground">
        No evaluators in this run.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {evaluators.map((ev) => {
        const versionLabel = ev.evaluator_version_id
          ? versionLabels[ev.evaluator_version_id]
          : null;
        const r = runs.find(
          (x) =>
            x.evaluator_id === ev.evaluator_id &&
            (!ev.evaluator_version_id ||
              x.evaluator_version_id === ev.evaluator_version_id),
        );
        const value = r?.value?.value;
        const reasoning =
          typeof r?.value?.reasoning === "string"
            ? (r.value.reasoning as string)
            : "";
        return (
          <div
            key={`${ev.evaluator_id}-${ev.evaluator_version_id ?? ""}`}
            className="border border-border rounded-xl p-4 space-y-3"
          >
            <div className="flex items-start justify-between gap-3 min-w-0">
              <div className="min-w-0 flex items-center gap-2 flex-wrap">
                <h3 className="text-sm font-semibold truncate">
                  {ev.name || ev.evaluator_id.slice(0, 8)}
                </h3>
                {versionLabel && (
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-md border border-border bg-muted/40 text-muted-foreground">
                    {versionLabel}
                  </span>
                )}
              </div>
            </div>

            {r ? (
              <>
                <div className="flex items-center gap-2">
                  <span
                    className={`inline-flex items-center px-2.5 py-1 rounded-md text-sm font-medium border ${valuePillClass(
                      value,
                    )}`}
                  >
                    {formatValueDisplay(value)}
                  </span>
                </div>
                <div className="space-y-1.5">
                  <div className="text-xs font-medium text-muted-foreground">
                    Reasoning
                  </div>
                  <textarea
                    value={reasoning}
                    readOnly
                    rows={2}
                    className="w-full text-sm rounded-md border border-border bg-background px-3 py-2 resize-y focus:outline-none focus:ring-2 focus:ring-foreground/20"
                  />
                </div>
              </>
            ) : jobStatus === "in_progress" || jobStatus === "queued" ? (
              <div className="flex items-center gap-3 py-1">
                <svg
                  className="w-5 h-5 animate-spin text-muted-foreground"
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
                <p className="text-sm text-muted-foreground">
                  Running evaluator
                </p>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground">
                No result for this item.
              </p>
            )}
          </div>
        );
      })}
    </div>
  );
}
