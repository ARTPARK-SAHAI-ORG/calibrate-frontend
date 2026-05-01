"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { toast } from "sonner";
import {
  AddTestDialog,
  type AttachedEvaluatorInit,
  type EvaluatorRefPayload,
  type EvaluatorVariableDef,
  type TestConfig,
} from "@/components/AddTestDialog";
import { AppLayout } from "@/components/AppLayout";
import { EvaluatorTypePill } from "@/components/EvaluatorPills";
import { Tooltip } from "@/components/Tooltip";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { AddSttItemsDialog } from "@/components/human-labelling/AddSttItemsDialog";
import { AssignAnnotatorsDialog } from "@/components/human-labelling/AssignAnnotatorsDialog";
import { EditTaskDialog } from "@/components/human-labelling/EditTaskDialog";
import {
  ItemResultsDialog,
} from "@/components/human-labelling/ItemResultsDialog";
import {
  JobsCreatedDialog,
  type CreatedJob,
} from "@/components/human-labelling/JobsCreatedDialog";
import { ManageEvaluatorsDialog } from "@/components/human-labelling/ManageEvaluatorsDialog";
import { EmptyState } from "@/components/ui/LoadingState";
import { useAccessToken } from "@/hooks";
import { apiClient } from "@/lib/api";
import { useSidebarState } from "@/lib/sidebar";

type Tab = "items" | "jobs" | "runs";

const TABS: Tab[] = ["items", "jobs", "runs"];

type EvaluatorRunMetricEntry = number | { type?: string; mean?: number | null };

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
    metrics?: Record<string, EvaluatorRunMetricEntry>;
  } | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
};

function isTab(value: string | null): value is Tab {
  return !!value && (TABS as string[]).includes(value);
}

type ItemAgreement = {
  human_human: { agreement: number | null; pair_count: number };
  evaluators: {
    evaluator_id: string;
    agreement: number | null;
    pair_count: number;
  }[];
};

type LabellingItem = {
  id: number;
  uuid: string;
  task_id: string;
  payload: unknown;
  created_at: string;
  deleted_at: string | null;
  agreement?: ItemAgreement;
};

type LabellingJob = {
  uuid: string;
  task_id: string;
  annotator_id: string;
  annotator_name: string;
  public_token: string;
  status: "pending" | "in_progress" | "completed";
  created_at: string;
  completed_at: string | null;
  item_count: number;
  annotation_count: number;
};

type LabellingTask = {
  uuid: string;
  name: string;
  type?: "llm" | "stt" | "tts" | "simulation";
  description?: string;
  created_at?: string;
  updated_at?: string;
  evaluators?: {
    uuid: string;
    name: string;
    evaluator_type?: "llm" | "stt" | "tts" | "simulation";
  }[];
  items?: LabellingItem[];
  jobs?: LabellingJob[];
  // item_count is still returned by the list endpoint; on the detail
  // endpoint we prefer items.length.
  item_count?: number;
};

type TaskKind = "llm" | "stt" | "tts" | "simulation" | undefined;

function previewItemPayload(payload: unknown, kind: TaskKind): string {
  if (payload == null || typeof payload !== "object") {
    return typeof payload === "string" ? payload : "—";
  }
  const p = payload as Record<string, unknown>;
  if (typeof p.name === "string" && p.name) return p.name;
  if (kind === "stt") {
    const ref =
      typeof p.reference_transcript === "string" ? p.reference_transcript : "";
    const pred =
      typeof p.predicted_transcript === "string" ? p.predicted_transcript : "";
    if (ref || pred) return `${ref} → ${pred}`;
  }
  if (kind === "llm") {
    if (typeof p.agent_response === "string" && p.agent_response) {
      return p.agent_response;
    }
    if (Array.isArray(p.chat_history) && p.chat_history.length > 0) {
      const last = p.chat_history[p.chat_history.length - 1] as {
        content?: unknown;
      };
      if (typeof last?.content === "string") return last.content;
    }
  }
  if (kind === "simulation") {
    if (Array.isArray(p.transcript) && p.transcript.length > 0) {
      const first = p.transcript[0] as { content?: unknown };
      if (typeof first?.content === "string") return first.content;
    }
  }
  try {
    return JSON.stringify(payload);
  } catch {
    return "—";
  }
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

function buildAnnotateUrl(token: string): string {
  if (typeof window === "undefined") return `/annotate-job/${token}`;
  return `${window.location.origin}/annotate-job/${token}`;
}

function statusPillClass(status: LabellingJob["status"]): string {
  switch (status) {
    case "completed":
      return "border-green-200 bg-green-100 text-green-700 dark:border-green-500/30 dark:bg-green-500/20 dark:text-green-400";
    case "in_progress":
      return "border-yellow-200 bg-yellow-100 text-yellow-700 dark:border-yellow-500/30 dark:bg-yellow-500/20 dark:text-yellow-400";
    default:
      return "border-gray-200 bg-gray-100 text-gray-700 dark:border-gray-500/30 dark:bg-gray-500/20 dark:text-gray-300";
  }
}

function statusLabel(status: LabellingJob["status"]): string {
  if (status === "in_progress") return "In progress";
  if (status === "completed") return "Completed";
  return "Pending";
}

function runStatusPillClass(status: EvaluatorRunJob["status"]): string {
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

function runStatusLabel(status: EvaluatorRunJob["status"]): string {
  if (status === "queued") return "Queued";
  if (status === "in_progress") return "In progress";
  if (status === "completed") return "Completed";
  if (status === "failed") return "Failed";
  return status;
}

function EvaluatorRunsList({
  runs,
  loading,
  error,
  versionLabels,
  onRequestDelete,
  onOpen,
}: {
  runs: EvaluatorRunJob[];
  loading: boolean;
  error: string | null;
  versionLabels: Record<string, Record<string, string>>;
  onRequestDelete: (runUuid: string) => void;
  onOpen: (runUuid: string) => void;
}) {
  if (loading) {
    return (
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
        Loading runs
      </div>
    );
  }
  if (error) {
    return (
      <div className="rounded-md border border-border bg-muted/20 p-4 text-sm text-red-500">
        {error}
      </div>
    );
  }
  if (runs.length === 0) {
    return (
      <EmptyState
        icon={
          <svg
            className="w-7 h-7 text-muted-foreground"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M9 17v-2a4 4 0 014-4h6m0 0l-3-3m3 3l-3 3M5 7h6a4 4 0 014 4v2"
            />
          </svg>
        }
        title="No evaluation runs yet"
        description="The results of running the linked evaluators on every item in this task will appear here"
      />
    );
  }

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="grid grid-cols-[minmax(0,1.5fr)_100px_140px_minmax(0,1fr)_60px] gap-4 px-4 py-2 border-b border-border bg-muted/30 items-center">
        <div className="text-sm font-medium text-muted-foreground">
          Evaluators
        </div>
        <div className="text-sm font-medium text-muted-foreground">Items</div>
        <div className="text-sm font-medium text-muted-foreground">Status</div>
        <div className="text-sm font-medium text-muted-foreground">
          Last updated
        </div>
        <div />
      </div>
      {runs.map((run) => {
        const itemCount = run.details?.item_count ?? 0;
        const lastUpdated = run.updated_at || run.created_at;
        const evaluators = run.details?.evaluators ?? [];
        const versionLabelFor = (
          evaluatorId: string,
          versionId: string | undefined,
        ): string | null => {
          if (!versionId) return null;
          return versionLabels[evaluatorId]?.[versionId] ?? null;
        };
        const evaluatorTitle = evaluators
          .map((e) => {
            const name = e.name || e.evaluator_id.slice(0, 8);
            const label = versionLabelFor(e.evaluator_id, e.evaluator_version_id);
            return label ? `${name} (${label})` : name;
          })
          .join(", ");
        return (
          <div
            key={run.uuid}
            onClick={() => onOpen(run.uuid)}
            className="grid grid-cols-[minmax(0,1.5fr)_100px_140px_minmax(0,1fr)_60px] gap-4 px-4 py-3 border-b border-border last:border-b-0 items-center hover:bg-muted/20 transition-colors cursor-pointer"
          >
            <div
              className="flex flex-wrap gap-1.5 min-w-0"
              title={evaluatorTitle}
            >
              {evaluators.length === 0 ? (
                <span className="text-sm text-muted-foreground">—</span>
              ) : (
                evaluators.map((e) => {
                  const name = e.name || e.evaluator_id.slice(0, 8);
                  const label = versionLabelFor(
                    e.evaluator_id,
                    e.evaluator_version_id,
                  );
                  return (
                    <span
                      key={`${e.evaluator_id}-${e.evaluator_version_id ?? ""}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-muted/40 text-foreground"
                    >
                      <span className="truncate max-w-[140px]">{name}</span>
                      {label && (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {label}
                        </span>
                      )}
                    </span>
                  );
                })
              )}
            </div>
            <div className="text-sm text-muted-foreground tabular-nums">
              {itemCount}
            </div>
            <div>
              <span
                className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium border ${runStatusPillClass(
                  run.status,
                )}`}
              >
                {runStatusLabel(run.status)}
              </span>
            </div>
            <div className="text-sm text-muted-foreground">
              {new Date(lastUpdated.replace(" ", "T") + "Z").toLocaleString()}
            </div>
            <div className="flex justify-end">
              {(run.status === "completed" || run.status === "failed") && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRequestDelete(run.uuid);
                  }}
                  aria-label="Delete run"
                  title="Delete run"
                  className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
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
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ItemRowActions({
  itemUuid,
  onDelete,
  onPlay,
  onViewResults,
  onLabel,
  playDisabled,
  playLoadingForUuid,
}: {
  itemUuid: string;
  onDelete: (uuid: string) => void | Promise<void>;
  onPlay: (uuid: string) => void | Promise<void>;
  onViewResults: (uuid: string) => void;
  onLabel?: (uuid: string) => void;
  playDisabled?: boolean;
  playLoadingForUuid?: string | null;
}) {
  const isLoading = playLoadingForUuid === itemUuid;
  return (
    <div
      className="flex items-center justify-center gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      {onLabel && (
        <button
          type="button"
          onClick={() => onLabel(itemUuid)}
          aria-label="Label"
          className="h-8 px-3 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
        >
          Label
        </button>
      )}
      {/* View results (analytics) */}
      <button
        type="button"
        onClick={() => onViewResults(itemUuid)}
        aria-label="View results"
        className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-sm font-semibold border border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 hover:bg-fuchsia-500/20 hover:border-fuchsia-500/60 transition-colors cursor-pointer"
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
            d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
          />
        </svg>
        View results
      </button>
      {/* Run evaluators */}
      <button
        type="button"
        onClick={() => onPlay(itemUuid)}
        disabled={playDisabled || isLoading}
        aria-label="Run evaluators"
        className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-sm font-medium border border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isLoading ? (
          <svg
            className="w-3.5 h-3.5 animate-spin"
            viewBox="0 0 24 24"
            fill="none"
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
              d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
            />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z" />
          </svg>
        )}
        Run evaluators
      </button>
      {/* Delete Button */}
      <button
        type="button"
        onClick={() => onDelete(itemUuid)}
        aria-label="Delete item"
        className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
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
    </div>
  );
}

function JobsList({ jobs }: { jobs: LabellingJob[] }) {
  const router = useRouter();
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  useEffect(() => {
    if (!copiedToken) return;
    const t = setTimeout(() => setCopiedToken(null), 1500);
    return () => clearTimeout(t);
  }, [copiedToken]);

  const handleCopy = async (token: string) => {
    try {
      await navigator.clipboard.writeText(buildAnnotateUrl(token));
      setCopiedToken(token);
    } catch {
      // ignore
    }
  };

  return (
    <div className="border border-border rounded-xl overflow-hidden">
      <div className="grid grid-cols-[180px_minmax(0,1fr)_120px_120px] gap-4 [&>*:nth-child(3)]:pl-6 px-4 py-2 border-b border-border bg-muted/30 items-center">
        <div className="text-sm font-medium text-muted-foreground">
          Annotator
        </div>
        <div className="text-sm font-medium text-muted-foreground">Link</div>
        <div className="text-sm font-medium text-muted-foreground">Status</div>
        <div className="text-sm font-medium text-muted-foreground">
          Progress
        </div>
      </div>
      {jobs.map((job) => {
        const isImported = job.public_token.startsWith("import:");
        const copied = copiedToken === job.public_token;
        const url = buildAnnotateUrl(job.public_token);
        return (
          <div
            key={job.uuid}
            onClick={() => {
              if (!isImported)
                router.push(`/human-labelling/jobs/${job.public_token}`);
            }}
            className={`grid grid-cols-[180px_minmax(0,1fr)_120px_120px] gap-4 [&>*:nth-child(3)]:pl-6 px-4 py-3 border-b border-border last:border-b-0 items-center hover:bg-muted/20 transition-colors ${
              isImported ? "" : "cursor-pointer"
            }`}
          >
            <div className="text-sm font-medium truncate">
              {job.annotator_name}
            </div>
            <div className="flex items-center gap-2 min-w-0">
              {isImported ? (
                <span className="text-xs text-muted-foreground">Imported</span>
              ) : (
                <>
                  <span className="text-xs font-mono text-muted-foreground truncate">
                    {url}
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleCopy(job.public_token);
                    }}
                    aria-label={copied ? "Copied" : "Copy link"}
                    title={copied ? "Copied" : "Copy link"}
                    className={`shrink-0 w-7 h-7 flex items-center justify-center rounded-md border transition-colors cursor-pointer ${
                      copied
                        ? "border-green-200 bg-green-100 text-green-700 dark:border-green-500/40 dark:bg-green-500/20 dark:text-green-400"
                        : "border-border bg-background text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    }`}
                  >
                    {copied ? (
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
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    ) : (
                      <svg
                        className="w-3.5 h-3.5"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={1.8}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"
                        />
                      </svg>
                    )}
                  </button>
                </>
              )}
            </div>
            <div>
              <span
                className={`inline-block px-2 py-0.5 rounded-md text-xs font-medium border ${statusPillClass(
                  job.status,
                )}`}
              >
                {statusLabel(job.status)}
              </span>
            </div>
            <div className="text-sm text-muted-foreground tabular-nums">
              {job.annotation_count} / {job.item_count}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export default function LabellingTaskPage() {
  return (
    <Suspense fallback={null}>
      <LabellingTaskPageInner />
    </Suspense>
  );
}

function LabellingTaskPageInner() {
  const router = useRouter();
  const params = useParams();
  const searchParams = useSearchParams();
  const accessToken = useAccessToken();
  const [sidebarOpen, setSidebarOpen] = useSidebarState();

  const uuid = typeof params?.uuid === "string" ? params.uuid : "";

  const initialTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<Tab>(
    isTab(initialTab) ? initialTab : "items",
  );

  const handleTabChange = useCallback(
    (tab: Tab) => {
      setActiveTab(tab);
      window.history.replaceState(
        null,
        "",
        `/human-labelling/tasks/${uuid}?tab=${tab}`,
      );
    },
    [uuid],
  );

  const [task, setTask] = useState<LabellingTask | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    new Set(),
  );
  const [assignOpen, setAssignOpen] = useState(false);
  const [deleteSelectedOpen, setDeleteSelectedOpen] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);
  const [editSttItemsOpen, setEditSttItemsOpen] = useState(false);
  const [editLlmItemUuid, setEditLlmItemUuid] = useState<string | null>(null);
  const [editLlmItemName, setEditLlmItemName] = useState("");
  const [savingLlmItem, setSavingLlmItem] = useState(false);
  const [editLlmError, setEditLlmError] = useState<string | null>(null);

  useEffect(() => {
    if (task?.name) document.title = `${task.name} | Calibrate`;
  }, [task?.name]);

  const fetchTask = useCallback(async () => {
    if (!accessToken || !uuid) return;
    setLoading(true);
    setError(null);
    try {
      const data = await apiClient<LabellingTask>(
        `/annotation-tasks/${uuid}`,
        accessToken,
      );
      setTask(data);
    } catch (err) {
      setError(parseApiError(err, "Failed to load task"));
    } finally {
      setLoading(false);
    }
  }, [accessToken, uuid]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  // Evaluator runs.
  const [runs, setRuns] = useState<EvaluatorRunJob[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);
  // Map evaluator_id -> { version_id: "v1" }, populated on demand from
  // /evaluators/{uuid}/versions so we can label runs by version number.
  const [versionLabels, setVersionLabels] = useState<
    Record<string, Record<string, string>>
  >({});

  const fetchRuns = useCallback(async () => {
    if (!accessToken || !uuid) return;
    setRunsLoading(true);
    setRunsError(null);
    try {
      const data = await apiClient<EvaluatorRunJob[]>(
        `/annotation-tasks/${uuid}/evaluator-runs`,
        accessToken,
      );
      setRuns(Array.isArray(data) ? data : []);
    } catch (err) {
      setRunsError(parseApiError(err, "Failed to load evaluator runs"));
    } finally {
      setRunsLoading(false);
    }
  }, [accessToken, uuid]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);
  void activeTab;

  // Fetch evaluator versions for any evaluator referenced by a run that we
  // haven't already loaded.
  useEffect(() => {
    if (!accessToken) return;
    const needed = new Set<string>();
    for (const r of runs) {
      for (const ev of r.details?.evaluators ?? []) {
        if (ev.evaluator_id && !versionLabels[ev.evaluator_id]) {
          needed.add(ev.evaluator_id);
        }
      }
    }
    if (needed.size === 0) return;
    let cancelled = false;
    (async () => {
      const updates: Record<string, Record<string, string>> = {};
      await Promise.all(
        Array.from(needed).map(async (evaluatorId) => {
          try {
            const versions = await apiClient<
              Array<{ uuid: string; version_number: number }>
            >(`/evaluators/${evaluatorId}/versions`, accessToken);
            const map: Record<string, string> = {};
            for (const v of versions) {
              map[v.uuid] = `v${v.version_number}`;
            }
            updates[evaluatorId] = map;
          } catch {
            updates[evaluatorId] = {};
          }
        }),
      );
      if (!cancelled) {
        setVersionLabels((prev) => ({ ...prev, ...updates }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [runs, accessToken, versionLabels]);

  const items = task?.items ?? [];
  const jobs = task?.jobs ?? [];
  const itemsLoading = loading && !task;
  const itemsError = error;
  const itemsCount = items.length || task?.item_count || 0;
  const jobsCount = jobs.length;
  const taskType = task?.type ?? task?.evaluators?.[0]?.evaluator_type;
  const canAddItem =
    taskType === "llm" || taskType === "simulation" || taskType === "stt";

  const toggleItem = (uuid: string) => {
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  };

  const allSelected = items.length > 0 && selectedItemIds.size === items.length;
  const someSelected = selectedItemIds.size > 0 && !allSelected;
  const toggleSelectAll = () => {
    setSelectedItemIds((prev) =>
      prev.size === items.length
        ? new Set()
        : new Set(items.map((i) => i.uuid)),
    );
  };

  // Drop selections that no longer exist in the items list (after delete or refetch).
  useEffect(() => {
    setSelectedItemIds((prev) => {
      if (prev.size === 0) return prev;
      const ids = new Set(items.map((i) => i.uuid));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (ids.has(id)) next.add(id);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [items]);

  const [startingRun, setStartingRun] = useState(false);
  const [startingRunForItem, setStartingRunForItem] = useState<string | null>(
    null,
  );
  const handleRunEvaluators = async (
    itemUuids?: string[] | string,
  ) => {
    if (!accessToken || !uuid || startingRun) return;
    const linked = task?.evaluators ?? [];
    if (linked.length === 0) {
      toast.error("Link at least one evaluator before running.");
      return;
    }
    const ids = Array.isArray(itemUuids)
      ? itemUuids
      : itemUuids
        ? [itemUuids]
        : null;
    setStartingRun(true);
    setStartingRunForItem(
      ids && ids.length === 1 ? ids[0] : null,
    );
    try {
      const body: Record<string, unknown> = {
        evaluators: linked.map((e) => ({ evaluator_id: e.uuid })),
      };
      if (ids && ids.length > 0) body.item_ids = ids;
      const result = await apiClient<{
        job_uuid: string;
        status: string;
        evaluator_count: number;
        item_count: number;
      }>(`/annotation-tasks/${uuid}/evaluator-runs`, accessToken, {
        method: "POST",
        body,
      });
      router.push(
        `/human-labelling/tasks/${uuid}/evaluator-runs/${result.job_uuid}`,
      );
    } catch (err) {
      toast.error(parseApiError(err, "Failed to start evaluation run"));
      setStartingRun(false);
      setStartingRunForItem(null);
    }
    // Note: we intentionally keep the spinner state on the success path until
    // the navigation completes (page unmounts), so the row's play button stays
    // as a spinner up to the redirect.
  };

  const [deletingRunUuid, setDeletingRunUuid] = useState<string | null>(null);
  const [deletingRunInFlight, setDeletingRunInFlight] = useState(false);

  const confirmDeleteRun = async () => {
    if (!accessToken || !deletingRunUuid) return;
    const runUuid = deletingRunUuid;
    setDeletingRunInFlight(true);
    try {
      await apiClient<{ deleted_runs: number }>(
        `/annotation-tasks/${uuid}/evaluator-runs/${runUuid}`,
        accessToken,
        { method: "DELETE" },
      );
      // Optimistic update.
      setRuns((prev) => prev.filter((r) => r.uuid !== runUuid));
      setDeletingRunUuid(null);
    } catch (err) {
      toast.error(parseApiError(err, "Failed to delete evaluation run"));
    } finally {
      setDeletingRunInFlight(false);
    }
  };

  const [deletingOneUuid, setDeletingOneUuid] = useState<string | null>(null);
  const [deletingOneInFlight, setDeletingOneInFlight] = useState(false);

  const requestDeleteOneItem = (itemUuid: string) => {
    setDeletingOneUuid(itemUuid);
  };

  const confirmDeleteOneItem = async () => {
    if (!accessToken || !deletingOneUuid) return;
    setDeletingOneInFlight(true);
    try {
      await apiClient<{ deleted_count: number }>(
        `/annotation-tasks/${uuid}/items`,
        accessToken,
        {
          method: "DELETE",
          body: { item_ids: [deletingOneUuid] },
        },
      );
      setSelectedItemIds((prev) => {
        const next = new Set(prev);
        next.delete(deletingOneUuid);
        return next;
      });
      setDeletingOneUuid(null);
      await fetchTask();
    } catch (err) {
      setError(parseApiError(err, "Failed to delete item"));
    } finally {
      setDeletingOneInFlight(false);
    }
  };

  const handleDeleteSelected = async () => {
    if (selectedItemIds.size === 0 || !accessToken) return;
    setDeletingSelected(true);
    try {
      await apiClient<{ deleted_count: number }>(
        `/annotation-tasks/${uuid}/items`,
        accessToken,
        {
          method: "DELETE",
          body: { item_ids: Array.from(selectedItemIds) },
        },
      );
      setDeleteSelectedOpen(false);
      setSelectedItemIds(new Set());
      await fetchTask();
    } catch (err) {
      setError(parseApiError(err, "Failed to delete items"));
    } finally {
      setDeletingSelected(false);
    }
  };

  // Hydrated evaluator catalogue (with live_version.variables) used to
  // pre-fill the AddTestDialog's evaluators section for label items.
  type HydratedEvaluator = {
    uuid: string;
    name: string;
    description?: string | null;
    slug: string | null;
    variables: EvaluatorVariableDef[];
  };
  const [evaluatorCatalogue, setEvaluatorCatalogue] = useState<
    Record<string, HydratedEvaluator>
  >({});

  useEffect(() => {
    if (!accessToken) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiClient<
          Array<{
            uuid: string;
            name: string;
            description?: string | null;
            slug: string | null;
            evaluator_type?: string;
            live_version?: { variables?: EvaluatorVariableDef[] | null } | null;
          }>
        >("/evaluators?include_defaults=true", accessToken);
        if (cancelled) return;
        const next: Record<string, HydratedEvaluator> = {};
        for (const e of Array.isArray(data) ? data : []) {
          next[e.uuid] = {
            uuid: e.uuid,
            name: e.name,
            description: e.description ?? null,
            slug: e.slug,
            variables: Array.isArray(e.live_version?.variables)
              ? (e.live_version!.variables as EvaluatorVariableDef[])
              : [],
          };
        }
        setEvaluatorCatalogue(next);
      } catch {
        // best-effort hydration; dialog will fall back to defaults
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  const editingItem = items.find((i) => i.uuid === editLlmItemUuid) ?? null;
  const editingPayload = (editingItem?.payload ?? null) as Record<
    string,
    unknown
  > | null;

  // Read saved evaluator variable values from an item payload, indexed by
  // evaluator uuid → { var: value }.
  const readEvaluatorVariables = (
    payload: Record<string, unknown> | null,
  ): Record<string, Record<string, string>> => {
    if (!payload) return {};
    const ev = payload.evaluator_variables;
    if (!ev || typeof ev !== "object" || Array.isArray(ev)) return {};
    const out: Record<string, Record<string, string>> = {};
    for (const [k, v] of Object.entries(ev as Record<string, unknown>)) {
      if (v && typeof v === "object" && !Array.isArray(v)) {
        const inner: Record<string, string> = {};
        for (const [vk, vv] of Object.entries(v as Record<string, unknown>)) {
          if (typeof vv === "string") inner[vk] = vv;
        }
        out[k] = inner;
      }
    }
    return out;
  };

  // Build initialEvaluators[] from the task's linked evaluators using the
  // catalogue for variable definitions, optionally seeded with saved values.
  // If the catalogue hasn't hydrated this evaluator yet but we have saved
  // values, fall back to inferring variable defs from the saved keys so the
  // dialog can still render and pre-fill them.
  const buildInitialEvaluators = (
    savedValues: Record<string, Record<string, string>>,
  ): AttachedEvaluatorInit[] => {
    const linked = task?.evaluators ?? [];
    return linked.map((ev) => {
      const hydrated = evaluatorCatalogue[ev.uuid];
      const saved = savedValues[ev.uuid] ?? null;
      let variables: EvaluatorVariableDef[] = hydrated?.variables ?? [];
      if (variables.length === 0 && saved && Object.keys(saved).length > 0) {
        variables = Object.keys(saved).map((name) => ({ name }));
      }
      return {
        evaluator_uuid: ev.uuid,
        name: hydrated?.name ?? ev.name,
        description: hydrated?.description ?? null,
        slug: hydrated?.slug ?? null,
        variables,
        variable_values: saved,
      };
    });
  };

  const editingInitialEvaluators = buildInitialEvaluators(
    readEvaluatorVariables(editingPayload),
  );
  const newItemInitialEvaluators = buildInitialEvaluators({});

  const editingInitialConfig = (() => {
    if (!editingPayload) return undefined;
    type HistoryItem = TestConfig["history"][number];
    const parseHistory = (raw: unknown): HistoryItem[] => {
      if (!Array.isArray(raw)) return [];
      const out: HistoryItem[] = [];
      for (const m of raw) {
        if (!m || typeof m !== "object") continue;
        const obj = m as Record<string, unknown>;
        const role = obj.role;
        const content =
          typeof obj.content === "string" ? obj.content : undefined;
        const toolCalls = obj.tool_calls;
        const toolCallId =
          typeof obj.tool_call_id === "string" ? obj.tool_call_id : undefined;
        if (role === "assistant") {
          if (Array.isArray(toolCalls) && toolCalls.length > 0) {
            out.push({
              role: "assistant",
              ...(content != null ? { content } : {}),
              tool_calls: toolCalls as HistoryItem["tool_calls"],
            });
          } else if (content != null) {
            out.push({ role: "assistant", content });
          }
        } else if (role === "user" && content != null) {
          out.push({ role: "user", content });
        } else if (role === "tool" && content != null) {
          out.push({
            role: "tool",
            content,
            ...(toolCallId ? { tool_call_id: toolCallId } : {}),
          });
        }
      }
      return out;
    };

    let history: HistoryItem[];
    if (taskType === "simulation") {
      history = parseHistory(editingPayload.transcript);
    } else {
      // LLM: chat_history (may include tool calls + tool responses) +
      // optional trailing agent_response (the regular text reply being
      // graded).
      history = parseHistory(editingPayload.chat_history);
      const ar = editingPayload.agent_response;
      if (typeof ar === "string" && ar.length > 0) {
        history.push({ role: "assistant", content: ar });
      }
    }
    return {
      history,
      evaluation: { type: "response" as const, criteria: "" },
    };
  })();

  // Sync the name field whenever a different item is opened for edit.
  useEffect(() => {
    if (editingItem) {
      const n =
        typeof editingPayload?.name === "string"
          ? (editingPayload.name as string)
          : `Item ${editingItem.id}`;
      setEditLlmItemName(n);
      setEditLlmError(null);
    }
  }, [editingItem?.uuid, editingPayload]);

  const [createdJobs, setCreatedJobs] = useState<CreatedJob[]>([]);
  const [jobsCreatedOpen, setJobsCreatedOpen] = useState(false);
  const [resultsForItemUuid, setResultsForItemUuid] = useState<string | null>(
    null,
  );

  const handleAssignAnnotators = async (annotatorIds: string[]) => {
    if (selectedItemIds.size === 0 || annotatorIds.length === 0 || !accessToken)
      return;
    const result = await apiClient<{ count: number; jobs: CreatedJob[] }>(
      `/annotation-tasks/${uuid}/jobs`,
      accessToken,
      {
        method: "POST",
        body: {
          annotator_ids: annotatorIds,
          item_ids: Array.from(selectedItemIds),
        },
      },
    );
    setAssignOpen(false);
    setSelectedItemIds(new Set());
    setCreatedJobs(result.jobs ?? []);
    setJobsCreatedOpen(true);
    fetchTask();
  };

  const [manageOpen, setManageOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addSttItemsOpen, setAddSttItemsOpen] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [creatingItem, setCreatingItem] = useState(false);
  const [createItemError, setCreateItemError] = useState<string | null>(null);
  const [validationAttempted, setValidationAttempted] = useState(false);

  return (
    <AppLayout
      activeItem="human-labelling"
      onItemChange={(id) => router.push(`/${id}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
    >
      <div className="py-4 md:py-6 space-y-6">
        <button
          onClick={() => router.push("/human-labelling?tab=tasks")}
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
              d="M15.75 19.5L8.25 12l7.5-7.5"
            />
          </svg>
          All labelling tasks
        </button>

        {error && (
          <div className="rounded-md border border-border bg-muted/20 p-4 text-sm text-red-500">
            {error}
          </div>
        )}

        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-2xl font-semibold">
                {loading && !task ? "Loading..." : (task?.name ?? "—")}
              </h1>
              {taskType && <EvaluatorTypePill evaluatorType={taskType} />}
            </div>
            {task?.description && (
              <p className="text-muted-foreground text-sm md:text-base leading-relaxed mt-1 max-w-3xl">
                {task.description}
              </p>
            )}
            {task && (
              <div className="flex flex-wrap items-center gap-1.5 mt-3">
                <Tooltip content="Manage evaluators" position="top">
                <button
                  onClick={() => setManageOpen(true)}
                  aria-label="Manage evaluators"
                  className="inline-flex items-center justify-center px-1.5 py-0.5 rounded-md border border-border bg-muted/40 text-foreground hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M10.343 3.94c.09-.542.56-.94 1.11-.94h1.093c.55 0 1.02.398 1.11.94l.149.894c.07.424.384.764.78.93.398.164.855.142 1.205-.108l.737-.527a1.125 1.125 0 011.45.12l.773.774c.39.389.44 1.002.12 1.45l-.527.737c-.25.35-.272.806-.107 1.204.165.397.505.71.93.78l.893.15c.543.09.94.56.94 1.109v1.094c0 .55-.397 1.02-.94 1.11l-.893.149c-.425.07-.765.383-.93.78-.165.398-.143.854.107 1.204l.527.738c.32.447.269 1.06-.12 1.45l-.774.773a1.125 1.125 0 01-1.449.12l-.738-.527c-.35-.25-.806-.272-1.203-.107-.397.165-.71.505-.781.929l-.149.894c-.09.542-.56.94-1.11.94h-1.094c-.55 0-1.019-.398-1.11-.94l-.148-.894c-.071-.424-.384-.764-.781-.93-.398-.164-.854-.142-1.204.108l-.738.527c-.447.32-1.06.269-1.45-.12l-.773-.774a1.125 1.125 0 01-.12-1.45l.527-.737c.25-.35.273-.806.108-1.204-.165-.397-.505-.71-.93-.78l-.894-.15c-.542-.09-.94-.56-.94-1.109v-1.094c0-.55.398-1.02.94-1.11l.894-.149c.424-.07.764-.383.929-.78.165-.398.143-.854-.107-1.204l-.527-.738a1.125 1.125 0 01.12-1.45l.773-.773a1.125 1.125 0 011.45-.12l.737.527c.35.25.807.272 1.204.107.397-.165.71-.505.78-.929l.15-.894z"
                    />
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
                    />
                  </svg>
                </button>
                </Tooltip>
                {(task.evaluators ?? []).map((ev) => (
                  <Link
                    key={ev.uuid}
                    href={`/evaluators/${ev.uuid}`}
                    className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-muted/40 text-foreground hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer"
                    title={`Open ${ev.name}`}
                  >
                    {ev.name}
                  </Link>
                ))}
              </div>
            )}
          </div>
          {task && (
            <div className="flex items-center gap-2 flex-shrink-0">
              <button
                onClick={() => setEditOpen(true)}
                className="h-9 px-3 rounded-md text-sm font-medium bg-amber-500/15 text-amber-700 dark:text-amber-300 hover:bg-amber-500/25 border border-amber-500/30 transition-colors cursor-pointer flex items-center gap-1.5"
                title="Edit name and description"
                aria-label="Edit task"
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
                    d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125M18 14v4.75A2.25 2.25 0 0115.75 21H5.25A2.25 2.25 0 013 18.75V8.25A2.25 2.25 0 015.25 6H10"
                  />
                </svg>
                Edit
              </button>
              <button
                onClick={() => {
                  if (taskType === "llm" || taskType === "simulation") {
                    setNewItemName("");
                    setCreateItemError(null);
                    setValidationAttempted(false);
                    setAddItemOpen(true);
                  } else if (taskType === "stt") {
                    setAddSttItemsOpen(true);
                  }
                }}
                disabled={!canAddItem}
                title={
                  !canAddItem
                    ? "Manual item entry isn't supported for this task type yet"
                    : undefined
                }
                className="h-9 px-3 rounded-md text-sm font-medium bg-teal-500/15 text-teal-700 dark:text-teal-300 hover:bg-teal-500/25 border border-teal-500/30 transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
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
                {taskType === "stt" ? "Add items" : "Add item"}
              </button>
              <button
                onClick={() => {
                  toast.info("CSV upload isn't supported yet — coming soon.");
                }}
                className="h-9 px-3 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-1.5"
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
                    d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
                  />
                </svg>
                Upload CSV
              </button>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="border-b border-border flex items-center gap-1">
          {[
            {
              id: "items" as Tab,
              label: itemsCount > 0 ? `Items (${itemsCount})` : "Items",
            },
            {
              id: "jobs" as Tab,
              label:
                jobsCount > 0
                  ? `Labelling jobs (${jobsCount})`
                  : "Labelling jobs",
            },
            {
              id: "runs" as Tab,
              label:
                runs.length > 0
                  ? `Evaluation runs (${runs.length})`
                  : "Evaluation runs",
            },
          ].map((t) => (
            <button
              key={t.id}
              onClick={() => handleTabChange(t.id)}
              className={`px-3 py-2 text-sm font-medium -mb-px border-b-2 transition-colors cursor-pointer ${
                activeTab === t.id
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {activeTab === "items" &&
          (itemsLoading ? (
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
              Loading items
            </div>
          ) : itemsError ? (
            <div className="rounded-md border border-border bg-muted/20 p-4 text-sm text-red-500">
              {itemsError}
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              icon={
                <svg
                  className="w-7 h-7 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5"
                  />
                </svg>
              }
              title="No items yet"
              description="Add items for humans to label or load existing human labelled items"
            />
          ) : (
            <div className="space-y-3">
              {/* Bulk-action toolbar (shown when at least one row is selected) */}
              {selectedItemIds.size > 0 && (
                <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
                  <span className="text-sm">
                    <span className="font-medium">{selectedItemIds.size}</span>{" "}
                    item{selectedItemIds.size === 1 ? "" : "s"} selected
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedItemIds(new Set())}
                      className="h-8 px-3 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                    >
                      Clear
                    </button>
                    {taskType === "stt" && (
                      <button
                        onClick={() => setEditSttItemsOpen(true)}
                        className="h-8 px-3 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
                      >
                        Edit
                      </button>
                    )}
                    <button
                      onClick={() => setDeleteSelectedOpen(true)}
                      className="h-8 px-3 rounded-md text-sm font-medium border border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors cursor-pointer"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => {
                        const totalItems = items.length;
                        const selected = Array.from(selectedItemIds);
                        // Omit item_ids when every item is selected; otherwise
                        // send the explicit subset.
                        if (
                          totalItems > 0 &&
                          selected.length === totalItems
                        ) {
                          handleRunEvaluators();
                        } else {
                          handleRunEvaluators(selected);
                        }
                      }}
                      disabled={startingRun}
                      className="h-8 px-3 rounded-md text-sm font-medium border border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                    >
                      {startingRun && startingRunForItem === null ? (
                        <svg
                          className="w-3.5 h-3.5 animate-spin"
                          viewBox="0 0 24 24"
                          fill="none"
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
                            d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z"
                          />
                        </svg>
                      ) : (
                        <svg
                          className="w-3.5 h-3.5"
                          fill="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path d="M8 5v14l11-7z" />
                        </svg>
                      )}
                      Run evaluators
                    </button>
                    <button
                      onClick={() => setAssignOpen(true)}
                      className="h-8 px-3 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
                    >
                      Label all
                    </button>
                  </div>
                </div>
              )}

              {taskType === "stt" ? (
                <div className="border border-border rounded-xl overflow-hidden">
                  <div className="grid grid-cols-[40px_minmax(0,1fr)_minmax(0,1fr)_440px] gap-4 px-4 py-2 border-b border-border bg-muted/30 items-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleSelectAll}
                      aria-label="Select all"
                      className="w-4 h-4 cursor-pointer accent-foreground"
                    />
                    <div className="text-sm font-medium text-muted-foreground">
                      Reference transcript
                    </div>
                    <div className="text-sm font-medium text-muted-foreground">
                      Predicted transcript
                    </div>
                    <div className="text-sm font-medium text-muted-foreground text-center">
                      Actions
                    </div>
                  </div>
                  {items.map((item) => {
                    const p = (item.payload ?? {}) as Record<string, unknown>;
                    const ref =
                      typeof p.reference_transcript === "string"
                        ? p.reference_transcript
                        : "";
                    const pred =
                      typeof p.predicted_transcript === "string"
                        ? p.predicted_transcript
                        : "";
                    const isSelected = selectedItemIds.has(item.uuid);
                    return (
                      <div
                        key={item.uuid}
                        className={`grid grid-cols-[40px_minmax(0,1fr)_minmax(0,1fr)_440px] gap-4 px-4 py-3 border-b border-border last:border-b-0 transition-colors items-center ${
                          isSelected ? "bg-muted/30" : "hover:bg-muted/20"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleItem(item.uuid)}
                          aria-label={`Select item ${item.id}`}
                          className="w-4 h-4 cursor-pointer accent-foreground"
                        />
                        <p className="text-sm text-foreground line-clamp-2">
                          {ref || "—"}
                        </p>
                        <p className="text-sm text-foreground line-clamp-2">
                          {pred || "—"}
                        </p>
                        <ItemRowActions
                          itemUuid={item.uuid}
                          onDelete={requestDeleteOneItem}
                          onPlay={handleRunEvaluators}
                          onViewResults={setResultsForItemUuid}
                          onLabel={toggleItem}
                          playDisabled={startingRun}
                          playLoadingForUuid={startingRunForItem}
                        />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="border border-border rounded-xl overflow-hidden">
                  <div className="grid grid-cols-[40px_minmax(0,1fr)_440px] gap-4 px-4 py-2 border-b border-border bg-muted/30 items-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleSelectAll}
                      aria-label="Select all"
                      className="w-4 h-4 cursor-pointer accent-foreground"
                    />
                    <div className="text-sm font-medium text-muted-foreground">
                      Name
                    </div>
                    <div className="text-sm font-medium text-muted-foreground text-center">
                      Actions
                    </div>
                  </div>
                  {items.map((item) => {
                    const isSelected = selectedItemIds.has(item.uuid);
                    return (
                      <div
                        key={item.uuid}
                        onClick={() => setEditLlmItemUuid(item.uuid)}
                        className={`grid grid-cols-[40px_minmax(0,1fr)_440px] gap-4 px-4 py-3 border-b border-border last:border-b-0 transition-colors items-center cursor-pointer ${
                          isSelected ? "bg-muted/30" : "hover:bg-muted/20"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleItem(item.uuid)}
                          onClick={(e) => e.stopPropagation()}
                          aria-label={`Select item ${item.id}`}
                          className="w-4 h-4 cursor-pointer accent-foreground"
                        />
                        <p className="text-sm text-foreground line-clamp-1">
                          {previewItemPayload(item.payload, taskType)}
                        </p>
                        <ItemRowActions
                          itemUuid={item.uuid}
                          onDelete={requestDeleteOneItem}
                          onPlay={handleRunEvaluators}
                          onViewResults={setResultsForItemUuid}
                          onLabel={toggleItem}
                          playDisabled={startingRun}
                          playLoadingForUuid={startingRunForItem}
                        />
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          ))}

        {activeTab === "jobs" &&
          (jobs.length === 0 ? (
            <EmptyState
              icon={
                <svg
                  className="w-7 h-7 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M20.25 14.15v4.25c0 1.094-.787 2.036-1.872 2.18-2.087.277-4.216.42-6.378.42s-4.291-.143-6.378-.42c-1.085-.144-1.872-1.086-1.872-2.18v-4.25m16.5 0a2.18 2.18 0 00.75-1.661V8.706c0-1.081-.768-2.015-1.837-2.175a48.114 48.114 0 00-3.413-.387m4.5 8.006c-.194.165-.42.295-.673.38A23.978 23.978 0 0112 15.75c-2.648 0-5.195-.429-7.577-1.22a2.16 2.16 0 01-.673-.38m0 0A2.18 2.18 0 013 12.489V8.706c0-1.081.768-2.015 1.837-2.175a48.111 48.111 0 013.413-.387m7.5 0V5.25A2.25 2.25 0 0013.5 3h-3a2.25 2.25 0 00-2.25 2.25v.894m7.5 0a48.667 48.667 0 00-7.5 0M12 12.75h.008v.008H12v-.008z"
                  />
                </svg>
              }
              title="No labelling jobs yet"
              description="Assigning items to annotators creates a job they need to complete"
            />
          ) : (
            <JobsList jobs={jobs} />
          ))}

        {activeTab === "runs" && (
          <EvaluatorRunsList
            runs={runs}
            loading={runsLoading}
            error={runsError}
            versionLabels={versionLabels}
            onRequestDelete={(runUuid) => setDeletingRunUuid(runUuid)}
            onOpen={(runUuid) =>
              router.push(
                `/human-labelling/tasks/${uuid}/evaluator-runs/${runUuid}`,
              )
            }
          />
        )}
      </div>

      {addItemOpen && (
      <AddTestDialog
        isOpen={addItemOpen}
        onClose={() => {
          if (!creatingItem) setAddItemOpen(false);
        }}
        isEditing={false}
        isLoading={false}
        isCreating={creatingItem}
        createError={createItemError}
        testName={newItemName}
        setTestName={setNewItemName}
        validationAttempted={validationAttempted}
        mode="labelItem"
        allowAgentLastMessage={taskType === "simulation"}
        requireAssistantLastMessage={taskType === "llm"}
        initialEvaluators={newItemInitialEvaluators}
        onSubmit={async (
          config: TestConfig,
          evaluators: EvaluatorRefPayload[],
        ) => {
          setValidationAttempted(true);
          if (!newItemName.trim()) return;
          if (!accessToken) return;

          // Preserve the rich TestConfig.history shape — assistant
          // messages with `tool_calls`, and `tool` messages with their
          // `tool_call_id` — the same shape tests are saved with. Drop
          // only entries that have neither content nor tool_calls.
          const history = (config.history ?? []).filter((h) => {
            if (h.role === "assistant") {
              if (Array.isArray(h.tool_calls) && h.tool_calls.length > 0)
                return true;
              return typeof h.content === "string" && h.content.length > 0;
            }
            if (h.role === "user") {
              return typeof h.content === "string" && h.content.length > 0;
            }
            if (h.role === "tool") {
              return typeof h.content === "string";
            }
            return false;
          });

          // Capture per-evaluator variable values entered in the dialog,
          // keyed by evaluator uuid for easy lookup on edit.
          const evaluator_variables: Record<
            string,
            Record<string, string>
          > = {};
          for (const e of evaluators) {
            if (e.variable_values) {
              evaluator_variables[e.evaluator_uuid] = { ...e.variable_values };
            }
          }

          let payload: Record<string, unknown>;
          if (taskType === "simulation") {
            payload = {
              name: newItemName.trim(),
              transcript: history,
              evaluator_variables,
            };
          } else {
            // LLM: split the trailing plain agent reply (no tool_calls)
            // out as `agent_response`. Tool-call assistant messages stay
            // in `chat_history` since they aren't a graded reply.
            let chat_history = history;
            let agent_response = "";
            const last = history[history.length - 1];
            if (
              last &&
              last.role === "assistant" &&
              !(Array.isArray(last.tool_calls) && last.tool_calls.length > 0) &&
              typeof last.content === "string"
            ) {
              chat_history = history.slice(0, -1);
              agent_response = last.content;
            }
            payload = {
              name: newItemName.trim(),
              chat_history,
              agent_response,
              evaluator_variables,
            };
          }

          setCreatingItem(true);
          setCreateItemError(null);
          try {
            await apiClient(`/annotation-tasks/${uuid}/items`, accessToken, {
              method: "POST",
              body: { items: [{ payload }] },
            });
            setAddItemOpen(false);
            await fetchTask();
          } catch (err) {
            setCreateItemError(parseApiError(err, "Failed to create item"));
          } finally {
            setCreatingItem(false);
          }
        }}
      />
      )}

      {!!editLlmItemUuid && taskType !== "stt" && (
      <AddTestDialog
        key={editLlmItemUuid}
        isOpen={true}
        onClose={() => {
          if (!savingLlmItem) setEditLlmItemUuid(null);
        }}
        isEditing={true}
        isLoading={false}
        isCreating={savingLlmItem}
        createError={editLlmError}
        testName={editLlmItemName}
        setTestName={setEditLlmItemName}
        validationAttempted={false}
        mode="labelItem"
        allowAgentLastMessage={taskType === "simulation"}
        requireAssistantLastMessage={taskType === "llm"}
        initialConfig={editingInitialConfig}
        initialEvaluators={editingInitialEvaluators}
        onSubmit={async (
          config: TestConfig,
          evaluators: EvaluatorRefPayload[],
        ) => {
          if (!editLlmItemUuid || !editLlmItemName.trim() || !accessToken)
            return;
          const history = (config.history ?? []).filter((h) => {
            if (h.role === "assistant") {
              if (Array.isArray(h.tool_calls) && h.tool_calls.length > 0)
                return true;
              return typeof h.content === "string" && h.content.length > 0;
            }
            if (h.role === "user") {
              return typeof h.content === "string" && h.content.length > 0;
            }
            if (h.role === "tool") {
              return typeof h.content === "string";
            }
            return false;
          });
          const evaluator_variables: Record<
            string,
            Record<string, string>
          > = {};
          for (const e of evaluators) {
            if (e.variable_values) {
              evaluator_variables[e.evaluator_uuid] = { ...e.variable_values };
            }
          }
          let payload: Record<string, unknown>;
          if (taskType === "simulation") {
            payload = {
              name: editLlmItemName.trim(),
              transcript: history,
              evaluator_variables,
            };
          } else {
            let chat_history = history;
            let agent_response = "";
            const last = history[history.length - 1];
            if (
              last &&
              last.role === "assistant" &&
              !(Array.isArray(last.tool_calls) && last.tool_calls.length > 0) &&
              typeof last.content === "string"
            ) {
              chat_history = history.slice(0, -1);
              agent_response = last.content;
            }
            payload = {
              name: editLlmItemName.trim(),
              chat_history,
              agent_response,
              evaluator_variables,
            };
          }
          setSavingLlmItem(true);
          setEditLlmError(null);
          try {
            await apiClient<{ updated_count: number }>(
              `/annotation-tasks/${uuid}/items`,
              accessToken,
              {
                method: "PUT",
                body: {
                  updates: [{ uuid: editLlmItemUuid, payload }],
                },
              },
            );
            setEditLlmItemUuid(null);
            await fetchTask();
          } catch (err) {
            setEditLlmError(parseApiError(err, "Failed to save item"));
          } finally {
            setSavingLlmItem(false);
          }
        }}
      />
      )}

      {accessToken && task && (
        <EditTaskDialog
          isOpen={editOpen}
          accessToken={accessToken}
          taskUuid={task.uuid}
          initialName={task.name}
          initialDescription={task.description ?? ""}
          onClose={() => setEditOpen(false)}
          onSaved={() => {
            setEditOpen(false);
            fetchTask();
          }}
        />
      )}

      <AddSttItemsDialog
        isOpen={addSttItemsOpen}
        onClose={() => setAddSttItemsOpen(false)}
        onSubmit={async (rows) => {
          if (!accessToken) return;
          await apiClient(`/annotation-tasks/${uuid}/items`, accessToken, {
            method: "POST",
            body: {
              items: rows.map((r) => ({
                payload: {
                  reference_transcript: r.actual_transcript,
                  predicted_transcript: r.predicted_transcript,
                },
              })),
            },
          });
          await fetchTask();
          setAddSttItemsOpen(false);
        }}
      />

      <AddSttItemsDialog
        isOpen={editSttItemsOpen}
        mode="edit"
        initialRows={items
          .filter((it) => selectedItemIds.has(it.uuid))
          .map((it) => {
            const p = (it.payload ?? {}) as Record<string, unknown>;
            return {
              uuid: it.uuid,
              actual:
                typeof p.reference_transcript === "string"
                  ? p.reference_transcript
                  : "",
              predicted:
                typeof p.predicted_transcript === "string"
                  ? p.predicted_transcript
                  : "",
            };
          })}
        onClose={() => setEditSttItemsOpen(false)}
        onSubmit={async (rows) => {
          if (!accessToken) return;
          await apiClient<{ updated_count: number }>(
            `/annotation-tasks/${uuid}/items`,
            accessToken,
            {
              method: "PUT",
              body: {
                updates: rows
                  .filter((r) => !!r.uuid)
                  .map((r) => ({
                    uuid: r.uuid,
                    payload: {
                      reference_transcript: r.actual_transcript,
                      predicted_transcript: r.predicted_transcript,
                    },
                  })),
              },
            },
          );
          await fetchTask();
          setEditSttItemsOpen(false);
          setSelectedItemIds(new Set());
        }}
      />

      {accessToken && (
        <AssignAnnotatorsDialog
          isOpen={assignOpen}
          accessToken={accessToken}
          selectedItemCount={selectedItemIds.size}
          onClose={() => setAssignOpen(false)}
          onConfirm={handleAssignAnnotators}
        />
      )}

      <JobsCreatedDialog
        isOpen={jobsCreatedOpen}
        jobs={createdJobs}
        onClose={() => setJobsCreatedOpen(false)}
      />

      <ItemResultsDialog
        isOpen={!!resultsForItemUuid}
        onClose={() => setResultsForItemUuid(null)}
        itemName={(() => {
          const it = items.find((i) => i.uuid === resultsForItemUuid);
          if (!it) return "";
          const p = (it.payload ?? {}) as Record<string, unknown>;
          if (typeof p.name === "string" && p.name) return p.name;
          return `Item ${it.id}`;
        })()}
        evaluators={(task?.evaluators ?? []).map((e) => ({
          uuid: e.uuid,
          name: e.name,
        }))}
      />

      <DeleteConfirmationDialog
        isOpen={deleteSelectedOpen}
        onClose={() => {
          if (!deletingSelected) setDeleteSelectedOpen(false);
        }}
        onConfirm={handleDeleteSelected}
        title="Delete items"
        message={`Delete ${selectedItemIds.size} item${selectedItemIds.size === 1 ? "" : "s"}? Any annotations on ${selectedItemIds.size === 1 ? "this item" : "these items"} will also be lost. This cannot be undone.`}
        confirmText="Delete"
        isDeleting={deletingSelected}
      />

      <DeleteConfirmationDialog
        isOpen={!!deletingOneUuid}
        onClose={() => {
          if (!deletingOneInFlight) setDeletingOneUuid(null);
        }}
        onConfirm={confirmDeleteOneItem}
        title="Delete item"
        message="Delete this item? Any annotations on it will also be lost. This cannot be undone."
        confirmText="Delete"
        isDeleting={deletingOneInFlight}
      />

      <DeleteConfirmationDialog
        isOpen={!!deletingRunUuid}
        onClose={() => {
          if (!deletingRunInFlight) setDeletingRunUuid(null);
        }}
        onConfirm={confirmDeleteRun}
        title="Delete evaluation run"
        message="Delete this evaluation run? Per-item results from this run will no longer be visible. This cannot be undone."
        confirmText="Delete"
        isDeleting={deletingRunInFlight}
      />

      {manageOpen && accessToken && task && (
        <ManageEvaluatorsDialog
          accessToken={accessToken}
          taskUuid={task.uuid}
          taskType={task.type ?? task.evaluators?.[0]?.evaluator_type}
          currentEvaluatorIds={(task.evaluators ?? []).map((e) => e.uuid)}
          onClose={() => setManageOpen(false)}
          onSaved={() => {
            setManageOpen(false);
            fetchTask();
          }}
        />
      )}
    </AppLayout>
  );
}
