"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import { EvaluatorVerdictCard } from "@/components/EvaluatorVerdictCard";
import {
  ItemPane,
  type Item,
} from "@/components/human-labelling/AnnotationJobView";
import { useAccessToken } from "@/hooks";
import { apiClient } from "@/lib/api";
import { useSidebarState } from "@/lib/sidebar";
import {
  AgreementStatCard,
  agreementColor,
} from "@/components/human-labelling/AgreementStatCard";

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
  // Backend now embeds the version's scale bounds (numeric min/max for
  // rating evaluators, null for binary).
  evaluator_version?: {
    uuid?: string;
    version_number?: number;
    scale_min?: number | null;
    scale_max?: number | null;
  } | null;
  evaluator?: {
    uuid?: string;
    name?: string;
    description?: string | null;
    output_type?: string;
  } | null;
};

/** Embedded on GET …/evaluator-runs/{job_uuid} only; join `uuid` ↔ `runs[].item_id`. */
type EvaluatorRunItemSnapshot = {
  uuid: string;
  payload: unknown;
};

type HumanAnnotationValue = {
  value?: unknown;
  reasoning?: unknown;
} | null;

type HumanAnnotation = {
  annotation_id: string;
  annotator_id: string;
  annotator_name: string | null;
  job_id: string;
  value: HumanAnnotationValue;
  /** Convenience copy of `value.reasoning`; null when not provided. */
  reasoning?: string | null;
  updated_at: string;
};

type HumanAgreementEvaluatorSummary = {
  evaluator_id: string;
  evaluator_version_id: string | null;
  agreement: number | null;
  pair_count: number;
  item_count: number;
};

type HumanAgreementItemEvaluator = {
  evaluator_id: string;
  agreement: number | null;
  pair_count: number;
  human_annotations: HumanAnnotation[];
};

type HumanAgreementItem = {
  item_id: string;
  annotator_count: number;
  evaluators: HumanAgreementItemEvaluator[];
};

type HumanAgreement = {
  evaluators: HumanAgreementEvaluatorSummary[];
  items: HumanAgreementItem[];
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
  /** Snapshot payloads for this job; preferred over live task items (survives soft-delete). */
  items?: EvaluatorRunItemSnapshot[];
  /** Human annotation overlap and per-(item,evaluator) values; populated opportunistically. */
  human_agreement?: HumanAgreement;
};

type LabellingTaskFull = {
  uuid: string;
  name: string;
  type: "llm" | "stt" | "tts" | "simulation";
  description?: string | null;
  items?: Item[];
};

function snapshotToItem(snap: EvaluatorRunItemSnapshot, taskId: string): Item {
  return {
    id: 0,
    uuid: snap.uuid,
    task_id: taskId,
    payload: snap.payload,
    created_at: "",
    deleted_at: null,
  };
}

/**
 * Order snapshots for the run UI: explicit `details.item_ids`, else first-seen
 * `runs[].item_id`, else API order, with `item_count` cap when applicable.
 */
function orderedSnapshotsForRun(
  job: EvaluatorRunJob,
): EvaluatorRunItemSnapshot[] {
  const snaps = job.items ?? [];
  if (snaps.length === 0) return [];
  const byUuid = new Map(snaps.map((s) => [s.uuid, s]));
  const seen = new Set<string>();
  const out: EvaluatorRunItemSnapshot[] = [];

  const pushIds = (ids: string[]) => {
    for (const id of ids) {
      if (!id || seen.has(id)) continue;
      seen.add(id);
      const s = byUuid.get(id);
      out.push(s ?? { uuid: id, payload: {} });
    }
  };

  const subset = job.details?.item_ids;
  if (subset && subset.length > 0) {
    pushIds(subset);
  } else {
    const fromRuns: string[] = [];
    const runSeen = new Set<string>();
    for (const r of job.runs ?? []) {
      if (!r.item_id || runSeen.has(r.item_id)) continue;
      runSeen.add(r.item_id);
      fromRuns.push(r.item_id);
    }
    if (fromRuns.length > 0) pushIds(fromRuns);
  }

  for (const s of snaps) {
    if (!seen.has(s.uuid)) {
      seen.add(s.uuid);
      out.push(s);
    }
  }

  const cap = job.details?.item_count;
  if (typeof cap === "number" && cap >= 0 && cap < out.length) {
    return out.slice(0, cap);
  }
  return out;
}

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

function formatAgreement(value: number | null | undefined): string {
  if (value == null) return "—";
  return `${(value * 100).toFixed(1)}%`;
}

/** Read `payload.evaluator_variables[evaluatorId] -> { var: value }`. */
function extractEvaluatorVariables(
  payload: unknown,
): Record<string, Record<string, string>> {
  if (!payload || typeof payload !== "object") return {};
  const ev = (payload as Record<string, unknown>).evaluator_variables;
  if (!ev || typeof ev !== "object") return {};
  const out: Record<string, Record<string, string>> = {};
  for (const [evId, raw] of Object.entries(ev as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") continue;
    const flat: Record<string, string> = {};
    for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
      if (typeof v === "string") flat[k] = v;
      else if (v != null) flat[k] = String(v);
    }
    if (Object.keys(flat).length > 0) out[evId] = flat;
  }
  return out;
}

function annotatorDisplayName(a: {
  annotator_name: string | null;
  annotator_id: string;
}): string {
  if (a.annotator_name && a.annotator_name.trim().length > 0)
    return a.annotator_name;
  return a.annotator_id.slice(0, 8);
}

function statusLabel(status: EvaluatorRunJob["status"]): string {
  if (status === "queued") return "Queued";
  if (status === "in_progress") return "In progress";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  return status;
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

  // Fetch the task for type (and fallback item list when the job has no `items[]`).
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
  // Keyed on the sorted list of evaluator IDs so the effect doesn't
  // re-fire when the run polls — `job` changes every 2.5s while the
  // job is in-progress, but the evaluator set is fixed at run creation.
  const evaluatorIdsKey = (job?.details?.evaluators ?? [])
    .map((e) => e.evaluator_id)
    .filter(Boolean)
    .slice()
    .sort()
    .join(",");
  useEffect(() => {
    if (!accessToken || !evaluatorIdsKey) return;
    const evIds = evaluatorIdsKey.split(",");
    let cancelled = false;
    (async () => {
      const merged: Record<string, string> = {};
      await Promise.all(
        evIds.map(async (evaluatorId) => {
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
  }, [accessToken, evaluatorIdsKey]);

  // Item previews: prefer embedded `job.items` (snapshot, survives soft-delete);
  // otherwise same ordering rules against live `task.items`.
  const itemsForRun: Item[] = (() => {
    if (!job) return [];
    const taskId = task?.uuid ?? job.task_id;
    const embedded = job.items;
    if (embedded && embedded.length > 0) {
      return orderedSnapshotsForRun(job).map((s) => snapshotToItem(s, taskId));
    }
    if (!task?.items) return [];
    const subset = job.details?.item_ids;
    if (subset && subset.length > 0) {
      const set = new Set(subset);
      return task.items.filter((i) => set.has(i.uuid));
    }
    const fromRuns = new Set<string>();
    for (const r of job.runs ?? []) {
      if (r.item_id) fromRuns.add(r.item_id);
    }
    if (fromRuns.size > 0) {
      return task.items.filter((i) => fromRuns.has(i.uuid));
    }
    const cap = job.details?.item_count;
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

        {job &&
        task &&
        (task.type === "stt" ||
          task.type === "llm" ||
          task.type === "simulation") ? (
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
            {(() => {
              const ha = job.human_agreement;
              const cardsWillRender =
                job.status === "completed" &&
                !!ha &&
                ha.evaluators.length > 0 &&
                !(
                  ha.evaluators.every((e) => e.agreement === null) &&
                  ha.items.length === 0
                );
              if (cardsWillRender) return null;
              return (
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
              );
            })()}

            <HumanAgreementSummary
              jobStatus={job.status}
              agreement={job.human_agreement}
              evaluators={job.details?.evaluators ?? []}
              versionLabels={versionLabels}
            />

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
                          humanAgreementForItem={
                            job.human_agreement?.items.find(
                              (i) => i.item_id === currentItem.uuid,
                            ) ?? null
                          }
                          evaluatorVariablesByEvaluatorId={
                            extractEvaluatorVariables(currentItem.payload)
                          }
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
  humanAgreementForItem,
  evaluatorVariablesByEvaluatorId,
}: {
  evaluators: {
    evaluator_id: string;
    evaluator_version_id?: string;
    name?: string;
  }[];
  runs: EvaluatorRunRow[];
  versionLabels: Record<string, string>;
  jobStatus: EvaluatorRunJob["status"];
  humanAgreementForItem: HumanAgreementItem | null;
  evaluatorVariablesByEvaluatorId: Record<string, Record<string, string>>;
}) {
  const [selectionByEvaluator, setSelectionByEvaluator] = useState<
    Record<string, string>
  >({});

  if (evaluators.length === 0) {
    return (
      <div className="border border-border rounded-xl p-4 text-sm text-muted-foreground">
        No evaluators in this run.
      </div>
    );
  }
  return (
    <div className="space-y-4">
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
        const reasoning =
          typeof r?.value?.reasoning === "string"
            ? (r.value.reasoning as string)
            : null;

        let match: boolean | null = null;
        let score: number | null = null;
        let outputType: "binary" | "rating" = "binary";

        if (r) {
          const v = r.value?.value;
          if (typeof v === "boolean") {
            outputType = "binary";
            match = v;
          } else if (typeof v === "number") {
            outputType = "rating";
            score = v;
          }
        }

        const stillRunning =
          !r && (jobStatus === "in_progress" || jobStatus === "queued");
        if (stillRunning) {
          return (
            <div
              key={`${ev.evaluator_id}-${ev.evaluator_version_id ?? ""}`}
              className="border border-border rounded-xl p-4 space-y-2"
            >
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <h3 className="text-sm font-semibold truncate">
                  {ev.name || ev.evaluator_id.slice(0, 8)}
                </h3>
                {versionLabel && (
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-md border border-border bg-muted/40 text-muted-foreground">
                    {versionLabel}
                  </span>
                )}
              </div>
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
            </div>
          );
        }

        const evaluatorName = ev.name || ev.evaluator_id.slice(0, 8);

        // Job is done (or failed) but no row exists for this item — that's
        // a real error state now that the backend always populates runs[].
        if (!r) {
          return (
            <div
              key={`${ev.evaluator_id}-${ev.evaluator_version_id ?? ""}`}
              className="border border-red-500/30 bg-red-500/5 rounded-xl p-4 space-y-1.5"
            >
              <div className="flex items-center gap-2 flex-wrap min-w-0">
                <h3 className="text-sm font-semibold truncate">
                  {evaluatorName}
                </h3>
                {versionLabel && (
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-md border border-foreground/20 bg-background text-foreground">
                    {versionLabel}
                  </span>
                )}
              </div>
              <p className="text-xs text-red-600 dark:text-red-400">
                No result recorded for this item.
              </p>
            </div>
          );
        }

        const humansForEvaluator =
          humanAgreementForItem?.evaluators.find(
            (e) => e.evaluator_id === ev.evaluator_id,
          ) ?? null;
        const annotations =
          jobStatus === "completed"
            ? (humansForEvaluator?.human_annotations ?? [])
            : [];
        const hasHumans = annotations.length > 0;

        const selection =
          selectionByEvaluator[ev.evaluator_id] ?? "evaluator";
        const selectedAnnotation =
          selection !== "evaluator"
            ? annotations.find((a) => a.annotation_id === selection)
            : undefined;
        const showHuman = !!selectedAnnotation;

        const setSelection = (sel: string) =>
          setSelectionByEvaluator((prev) => ({
            ...prev,
            [ev.evaluator_id]: sel,
          }));

        const scaleMin =
          typeof r.evaluator_version?.scale_min === "number"
            ? r.evaluator_version.scale_min
            : undefined;
        const scaleMax =
          typeof r.evaluator_version?.scale_max === "number"
            ? r.evaluator_version.scale_max
            : undefined;

        let displayMatch: boolean | null = match;
        let displayScore: number | null = score;
        let displayReasoning: string | null = reasoning;

        if (showHuman && selectedAnnotation) {
          const v = selectedAnnotation.value?.value;
          displayMatch = null;
          displayScore = null;
          if (outputType === "binary" && typeof v === "boolean") {
            displayMatch = v;
          } else if (outputType === "rating" && typeof v === "number") {
            displayScore = v;
          }
          const topLevelReasoning =
            typeof selectedAnnotation.reasoning === "string"
              ? selectedAnnotation.reasoning
              : null;
          const nestedReasoning =
            typeof selectedAnnotation.value?.reasoning === "string"
              ? (selectedAnnotation.value.reasoning as string)
              : null;
          const raw = topLevelReasoning ?? nestedReasoning;
          displayReasoning = raw && raw.trim().length > 0 ? raw : null;
        }

        return (
          <div
            key={`${ev.evaluator_id}-${ev.evaluator_version_id ?? ""}`}
            className="space-y-2"
          >
            {hasHumans && (
              <div className="flex flex-wrap items-center gap-1.5">
                <AgreementGlyph
                  perfect={humansForEvaluator?.agreement === 1}
                  agreement={humansForEvaluator?.agreement ?? null}
                  pairCount={humansForEvaluator?.pair_count ?? 0}
                />
                <SourcePill
                  selected={selection === "evaluator"}
                  onClick={() => setSelection("evaluator")}
                  primaryLabel="Evaluator"
                />
                {annotations.map((a) => {
                  const aligned = isAnnotationAligned(
                    a.value?.value,
                    r.value?.value,
                    outputType,
                  );
                  return (
                    <SourcePill
                      key={a.annotation_id}
                      primaryLabel={annotatorDisplayName(a)}
                      selected={selection === a.annotation_id}
                      onClick={() => setSelection(a.annotation_id)}
                      tone={aligned ? "aligned" : "misaligned"}
                    />
                  );
                })}
              </div>
            )}
            <EvaluatorVerdictCard
              mode="read"
              name={evaluatorName}
              description={r.evaluator?.description ?? null}
              versionLabel={versionLabel}
              outputType={outputType}
              evaluatorUuid={ev.evaluator_id}
              enableLink
              variableValues={
                evaluatorVariablesByEvaluatorId[ev.evaluator_id] ?? null
              }
              match={displayMatch}
              score={displayScore}
              scaleMin={scaleMin}
              scaleMax={scaleMax}
              reasoning={displayReasoning}
            />
          </div>
        );
      })}
    </div>
  );
}

function isAnnotationAligned(
  humanVal: unknown,
  machineVal: unknown,
  outputType: "binary" | "rating",
): boolean {
  if (outputType === "binary") {
    return (
      typeof humanVal === "boolean" &&
      typeof machineVal === "boolean" &&
      humanVal === machineVal
    );
  }
  return (
    typeof humanVal === "number" &&
    typeof machineVal === "number" &&
    humanVal === machineVal
  );
}

function AgreementGlyph({
  perfect,
  agreement,
  pairCount,
}: {
  perfect: boolean;
  agreement: number | null;
  pairCount: number;
}) {
  const tooltip =
    agreement == null
      ? "No comparisons"
      : `Agreement ${formatAgreement(agreement)} · ${pairCount} comparison${pairCount === 1 ? "" : "s"}`;
  if (perfect) {
    return (
      <span
        title={tooltip}
        className="inline-flex items-center justify-center w-5 h-5 rounded-full text-green-600 dark:text-green-400"
        aria-label="Annotators agree with evaluator"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={3}
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
      </span>
    );
  }
  return (
    <span
      title={tooltip}
      className="inline-flex items-center justify-center w-5 h-5 rounded-full text-red-600 dark:text-red-400"
      aria-label="At least one annotator disagrees with evaluator"
    >
      <svg
        className="w-4 h-4"
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={3}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </span>
  );
}

function SourcePill({
  primaryLabel,
  monoSuffix,
  selected,
  onClick,
  tone,
}: {
  primaryLabel: string;
  monoSuffix?: string | null;
  selected: boolean;
  onClick: () => void;
  tone?: "aligned" | "misaligned";
}) {
  let labelToneClass = "";
  if (!selected && tone === "aligned") {
    labelToneClass = "text-green-700 dark:text-green-400";
  } else if (!selected && tone === "misaligned") {
    labelToneClass = "text-red-700 dark:text-red-400";
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border transition-colors cursor-pointer ${
        selected
          ? "border-foreground bg-foreground text-background"
          : "border-border bg-muted/40 hover:bg-muted hover:border-foreground/30"
      } ${selected ? "" : "text-foreground"}`}
    >
      <span className={`truncate max-w-[160px] ${labelToneClass}`}>
        {primaryLabel}
      </span>
      {monoSuffix && (
        <span
          className={`font-mono text-[11px] ${selected ? "text-background/70" : "text-muted-foreground"}`}
        >
          {monoSuffix}
        </span>
      )}
    </button>
  );
}

function HumanAgreementSummary({
  jobStatus,
  agreement,
  evaluators,
  versionLabels,
}: {
  jobStatus: EvaluatorRunJob["status"];
  agreement: HumanAgreement | undefined;
  evaluators: {
    evaluator_id: string;
    evaluator_version_id?: string;
    name?: string;
  }[];
  versionLabels: Record<string, string>;
}) {
  if (jobStatus !== "completed") return null;
  if (!agreement || agreement.evaluators.length === 0) return null;

  const allNull = agreement.evaluators.every((e) => e.agreement === null);
  const noItems = agreement.items.length === 0;

  if (allNull && noItems) {
    return (
      <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-900 dark:border-blue-500/30 dark:bg-blue-500/10 dark:text-blue-200 flex items-start gap-2">
        <svg
          className="w-4 h-4 mt-0.5 shrink-0"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"
          />
        </svg>
        <span>
          No human labels found on the items in this run yet. Once labelled,
          each evaluator&apos;s alignment with humans will be shown.
        </span>
      </div>
    );
  }

  const agreementById = new Map(
    agreement.evaluators.map((e) => [e.evaluator_id, e]),
  );

  return (
    <div className="space-y-2">
      <div>
        <h2 className="text-sm font-semibold">Human agreement</h2>
        <p className="text-xs text-muted-foreground max-w-2xl mt-1">
          How closely each evaluator&apos;s outputs in this run match the human
          annotations on the same items
        </p>
      </div>
      <div className="flex flex-wrap items-stretch gap-3">
        {evaluators.map((ev) => {
          const row = agreementById.get(ev.evaluator_id);
          if (!row) return null;
          const name = ev.name || ev.evaluator_id.slice(0, 8);
          const version = row.evaluator_version_id
            ? (versionLabels[row.evaluator_version_id] ?? null)
            : ev.evaluator_version_id
              ? (versionLabels[ev.evaluator_version_id] ?? null)
              : null;
          return (
            <AgreementStatCard
              key={`${ev.evaluator_id}-${ev.evaluator_version_id ?? ""}`}
              evaluatorPill={{
                href: `/evaluators/${ev.evaluator_id}`,
                name,
                versionLabel: version,
              }}
              value={
                row.agreement != null
                  ? `${Math.round(row.agreement * 100)}%`
                  : "—"
              }
              valueClassName={agreementColor(row.agreement)}
            />
          );
        })}
      </div>
    </div>
  );
}

