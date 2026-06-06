"use client";

import {
  Fragment,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
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
import {
  ExportResultsButton,
  type ExportColumn,
} from "@/components/ExportResultsButton";
import { RefreshButton } from "@/components/RefreshButton";
import { Tooltip } from "@/components/Tooltip";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { AddSttItemsDialog } from "@/components/human-labelling/AddSttItemsDialog";
import { BulkUploadSttItemsDialog } from "@/components/human-labelling/BulkUploadSttItemsDialog";
import { BulkUploadConversationItemsDialog } from "@/components/human-labelling/BulkUploadConversationItemsDialog";
import { BulkUploadLlmItemsDialog } from "@/components/human-labelling/BulkUploadLlmItemsDialog";
import { AssignAnnotatorsDialog } from "@/components/human-labelling/AssignAnnotatorsDialog";
import { EditTaskDialog } from "@/components/human-labelling/EditTaskDialog";
import { ItemDetailDialog } from "@/components/human-labelling/ItemDetailDialog";
import {
  JobsCreatedDialog,
  type CreatedJob,
} from "@/components/human-labelling/JobsCreatedDialog";
import { ManageEvaluatorsDialog } from "@/components/human-labelling/ManageEvaluatorsDialog";
import { RunEvaluatorsDialog } from "@/components/human-labelling/RunEvaluatorsDialog";
import {
  AgreementStatCard,
  agreementColor,
} from "@/components/human-labelling/AgreementStatCard";
import { EmptyState, NotFoundState } from "@/components/ui/LoadingState";
import { DeleteIconButton } from "@/components/ui/DeleteIconButton";
import { DuplicateIconButton } from "@/components/ui/DuplicateIconButton";
import { useAccessToken, usePageErrorState } from "@/hooks";
import { apiClient } from "@/lib/api";
import { useSidebarState } from "@/lib/sidebar";

type Tab = "overview" | "items" | "jobs" | "runs";

type AgreementBlock = {
  current: number | null;
  pair_count: number;
};

type TaskAgreementResponse = {
  human_human: AgreementBlock;
  evaluators: (AgreementBlock & { evaluator_id: string; name: string })[];
};

// Denormalized one-row-per-(item × linked evaluator) view from
// /annotation-tasks/{uuid}/summary. `annotators[]` provides the column
// order (union of every annotator with ≥1 annotation on the task);
// each `rows[i].annotations[annotator_uuid]` is that annotator's
// latest annotation for the slot, or null when they didn't label it.
//
// Per-row evaluator metadata (name, output_type, scale_min/max,
// version_number, is_live_version) was moved to the top-level
// `evaluators[]` block. The page looks each row's evaluator up by
// `evaluator_id` (and `evaluator_version_id` for version-specific
// fields).
type SummaryAnnotator = { uuid: string; name: string };
type SummaryEvaluator = {
  uuid: string;
  name: string;
  description?: string | null;
  output_type: "binary" | "rating";
  evaluator_type?: string;
  data_type?: string;
  live_version_id?: string | null;
  live_version_index?: number | null;
  versions?: {
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
  }[];
  run_count?: number;
};
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
  evaluator_value_name?: string | null;
  evaluator_reasoning?: string | null;
  // Aggregate agreement scores in [0, 1] for this (item, evaluator) slot.
  // human_agreement: null when <2 annotators labelled the slot.
  // evaluator_agreement: null when no evaluator run / no annotators / types incomparable.
  human_agreement: number | null;
  evaluator_agreement: number | null;
  annotations: Record<string, SummaryAnnotation | null>;
};
type TaskSummaryResponse = {
  task_id: string;
  task_type: "stt" | "llm" | "conversation";
  evaluators: SummaryEvaluator[];
  annotators: SummaryAnnotator[];
  rows: SummaryRow[];
  /** Sparse per-(item, annotator) free-text comments — the
   * `evaluator_id IS NULL` annotation slot. Items / annotators
   * without a non-empty comment don't appear. */
  item_comments?: { [item_id: string]: { [annotator_uuid: string]: string } };
  /** Item-level pagination metadata. `total` counts items in scope
   * (narrowed by `q` / `item_id`), not row count. */
  pagination?: {
    total: number;
    limit: number;
    offset: number;
  };
};

const ITEMS_PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const;
const ITEMS_PAGE_SIZE_KEY = "calibrate:items-page-size";
const ITEMS_SORT_KEY = "calibrate:items-sort-updated-at";
/** Per-batch page size used by "Export CSV" to pull the full task
 * scope. Matches the backend `/summary` endpoint's current `limit`
 * cap; if a task ever exceeds this, the export loops to drain the
 * remaining batches. */
const ITEMS_EXPORT_BATCH_SIZE = 1_000_000;

const TABS: Tab[] = ["overview", "items", "jobs", "runs"];

type EvaluatorRunMetricEntry = number | { type?: string; mean?: number | null };

type EvaluatorRunJob = {
  uuid: string;
  status: "queued" | "in_progress" | "completed" | "failed";
  // Item count was promoted to the top level alongside the new
  // evaluators block.
  item_count?: number;
  // Per-run evaluator refs — keys back into the response's top-level
  // `evaluators[]` block via `(evaluator_id, evaluator_version_id)`.
  // No name / version_number embedded here.
  evaluators?: {
    evaluator_id: string;
    evaluator_version_id: string;
  }[];
  updated_at: string;
};

// Top-level evaluators[] entry on the runs-list response. One per
// (evaluator, pinned version) tuple referenced across all runs. The
// page builds a `(id, version_id) -> entry` lookup to resolve
// per-run names / version numbers for the pills.
type RunsListEvaluator = {
  uuid: string;
  name: string;
  evaluator_version_id?: string;
  version_number?: number;
  output_type?: "binary" | "rating";
  deleted?: boolean;
};

type EvaluatorRunsListResponse = {
  evaluators?: RunsListEvaluator[];
  runs: EvaluatorRunJob[];
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
  updated_at?: string;
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
  completed_item_count: number;
};

type LabellingTask = {
  uuid: string;
  name: string;
  type?: "llm" | "stt" | "tts" | "conversation";
  description?: string;
  created_at?: string;
  updated_at?: string;
  evaluators?: {
    uuid: string;
    name: string;
    description?: string | null;
    slug?: string | null;
    evaluator_type?: "llm" | "stt" | "tts" | "conversation";
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
    variables?: EvaluatorVariableDef[] | null;
  }[];
  items?: LabellingItem[];
  jobs?: LabellingJob[];
  // item_count is still returned by the list endpoint; on the detail
  // endpoint we prefer items.length.
  item_count?: number;
};

type TaskKind = "llm" | "stt" | "tts" | "conversation" | undefined;

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
  if (kind === "conversation") {
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

function sanitizeCsvName(s: string): string {
  return s.replace(/[^A-Za-z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "unnamed";
}

function buildItemsCsv(
  items: LabellingItem[],
  taskSummary: TaskSummaryResponse | null,
  taskType: TaskKind,
): { columns: ExportColumn[]; rows: Record<string, unknown>[] } {
  const evaluators = taskSummary?.evaluators ?? [];
  const annotators = taskSummary?.annotators ?? [];

  // Each (item, evaluator, version) tuple gets its own row in the
  // summary response — keying without version_id would let later
  // versions silently overwrite earlier ones in the export.
  const rowByItemEvalVersion = new Map<string, SummaryRow>();
  const versionsByEval = new Map<string, Set<string | null>>();
  for (const row of taskSummary?.rows ?? []) {
    const vid = row.evaluator_version_id ?? null;
    rowByItemEvalVersion.set(
      `${row.item_id}::${row.evaluator_id}::${vid ?? "live"}`,
      row,
    );
    if (!versionsByEval.has(row.evaluator_id)) {
      versionsByEval.set(row.evaluator_id, new Set());
    }
    versionsByEval.get(row.evaluator_id)!.add(vid);
  }

  const versionNumberById = new Map<string, number>();
  for (const ev of evaluators) {
    for (const v of ev.versions ?? []) {
      versionNumberById.set(v.uuid, v.version_number);
    }
  }

  // For each evaluator, the list of version_ids (sorted by version_number
  // ascending) that actually appear in the summary rows. Evaluators with
  // no run data still get one entry (null → "live") so annotator columns
  // are emitted even when the evaluator hasn't run yet.
  const versionsForEvaluator = (ev: SummaryEvaluator): (string | null)[] => {
    const set = versionsByEval.get(ev.uuid);
    if (!set || set.size === 0) return [null];
    return [...set].sort((a, b) => {
      const an: number = (a ? versionNumberById.get(a) : undefined) ?? -Infinity;
      const bn: number = (b ? versionNumberById.get(b) : undefined) ?? -Infinity;
      return an - bn;
    });
  };

  const columns: ExportColumn[] = [{ key: "name", header: "name" }];
  if (taskType !== "stt") {
    columns.push({ key: "description", header: "description" });
  }
  if (taskType === "conversation") {
    columns.push({
      key: "conversation_history",
      header: "conversation_history",
    });
  } else if (taskType === "stt") {
    columns.push({
      key: "reference_transcript",
      header: "reference_transcript",
    });
    columns.push({
      key: "predicted_transcript",
      header: "predicted_transcript",
    });
  } else if (taskType === "llm") {
    columns.push({
      key: "conversation_history",
      header: "conversation_history",
    });
    columns.push({ key: "agent_response", header: "agent_response" });
  }

  for (const ev of evaluators) {
    const evName = sanitizeCsvName(ev.name);
    // Annotator columns are emitted once per (annotator × evaluator) —
    // a human's label of an item against an evaluator doesn't depend on
    // which version of the evaluator ran.
    for (const ann of annotators) {
      const annName = sanitizeCsvName(ann.name);
      const base = `${annName}_${evName}`;
      columns.push({
        key: `ann_${ann.uuid}_${ev.uuid}_value`,
        header: `${base}/value`,
      });
      columns.push({
        key: `ann_${ann.uuid}_${ev.uuid}_reasoning`,
        header: `${base}/reasoning`,
      });
    }
    for (const vid of versionsForEvaluator(ev)) {
      const versionNumber = vid ? versionNumberById.get(vid) : undefined;
      const verStr = versionNumber != null ? `v${versionNumber}` : "live";
      columns.push({
        key: `ev_${ev.uuid}_${vid ?? "live"}_value`,
        header: `evaluator_${evName}_${verStr}/value`,
      });
      columns.push({
        key: `ev_${ev.uuid}_${vid ?? "live"}_reasoning`,
        header: `evaluator_${evName}_${verStr}/reasoning`,
      });
    }
  }

  // Item-level free-text comments — one column per annotator, not tied
  // to any evaluator (`evaluator_id IS NULL` slot). Placed after all
  // evaluator/annotator columns so the per-evaluator block stays
  // contiguous and downstream consumers don't have to special-case
  // mid-stream comment columns.
  for (const ann of annotators) {
    const annName = sanitizeCsvName(ann.name);
    columns.push({
      key: `ann_${ann.uuid}_comment`,
      header: `${annName}/comment`,
    });
  }

  const rows = items.map((item) => {
    const p = (item.payload ?? {}) as Record<string, unknown>;
    const out: Record<string, unknown> = {
      name: typeof p.name === "string" ? p.name : "",
    };
    if (taskType !== "stt") {
      out.description = typeof p.description === "string" ? p.description : "";
    }
    if (taskType === "conversation") {
      out.conversation_history = Array.isArray(p.transcript)
        ? JSON.stringify(p.transcript)
        : "";
    } else if (taskType === "stt") {
      out.reference_transcript =
        typeof p.reference_transcript === "string"
          ? p.reference_transcript
          : "";
      out.predicted_transcript =
        typeof p.predicted_transcript === "string"
          ? p.predicted_transcript
          : "";
    } else if (taskType === "llm") {
      out.conversation_history = Array.isArray(p.chat_history)
        ? JSON.stringify(p.chat_history)
        : "";
      out.agent_response =
        typeof p.agent_response === "string" ? p.agent_response : "";
    }

    for (const ev of evaluators) {
      const versionIds = versionsForEvaluator(ev);
      // Annotations don't vary by version; take whichever version's row
      // we find first that has a non-null annotation for each annotator.
      const annotationSourceByAnn = new Map<string, SummaryAnnotation>();
      for (const vid of versionIds) {
        const row = rowByItemEvalVersion.get(
          `${item.uuid}::${ev.uuid}::${vid ?? "live"}`,
        );
        if (!row) continue;
        for (const ann of annotators) {
          if (annotationSourceByAnn.has(ann.uuid)) continue;
          const a = row.annotations?.[ann.uuid];
          if (a && a.value !== null && a.value !== undefined) {
            annotationSourceByAnn.set(ann.uuid, a);
          }
        }
      }
      for (const ann of annotators) {
        const a = annotationSourceByAnn.get(ann.uuid) ?? null;
        out[`ann_${ann.uuid}_${ev.uuid}_value`] =
          a && a.value !== null && a.value !== undefined ? a.value : "";
        out[`ann_${ann.uuid}_${ev.uuid}_reasoning`] = a?.reasoning ?? "";
      }
      for (const vid of versionIds) {
        const row = rowByItemEvalVersion.get(
          `${item.uuid}::${ev.uuid}::${vid ?? "live"}`,
        );
        out[`ev_${ev.uuid}_${vid ?? "live"}_value`] =
          row?.evaluator_value_name ??
          (row?.evaluator_value !== null && row?.evaluator_value !== undefined
            ? row.evaluator_value
            : "");
        out[`ev_${ev.uuid}_${vid ?? "live"}_reasoning`] =
          row?.evaluator_reasoning ?? "";
      }
    }
    const commentsForItem = taskSummary?.item_comments?.[item.uuid];
    for (const ann of annotators) {
      out[`ann_${ann.uuid}_comment`] = commentsForItem?.[ann.uuid] ?? "";
    }
    return out;
  });

  return { columns, rows };
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
  evaluators,
  loading,
  error,
  onRequestDelete,
  onOpen,
}: {
  runs: EvaluatorRunJob[];
  /** Top-level evaluators[] block from the runs-list response. Keyed
   * by `(uuid, evaluator_version_id)` for per-run pill rendering. */
  evaluators: RunsListEvaluator[];
  loading: boolean;
  error: string | null;
  onRequestDelete: (runUuid: string) => void;
  onOpen: (runUuid: string) => void;
}) {
  // (evaluator_id, evaluator_version_id) -> top-level entry. Same
  // evaluator can appear under multiple versions, so we key on both.
  const evaluatorByKey = useMemo(() => {
    const m = new Map<string, RunsListEvaluator>();
    for (const e of evaluators) {
      const vid = e.evaluator_version_id ?? "";
      m.set(`${e.uuid}:${vid}`, e);
    }
    return m;
  }, [evaluators]);
  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
        <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
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
        const itemCount = run.item_count ?? 0;
        const lastUpdated = run.updated_at;
        // Per-run evaluator refs ([{evaluator_id, evaluator_version_id}])
        // are resolved against the top-level evaluators[] block to get
        // names and version numbers for the pills.
        const runEvaluators = (run.evaluators ?? []).map((ref) => {
          const ev = evaluatorByKey.get(
            `${ref.evaluator_id}:${ref.evaluator_version_id ?? ""}`,
          );
          return {
            evaluator_id: ref.evaluator_id,
            evaluator_version_id: ref.evaluator_version_id,
            name: ev?.name ?? "",
            version_label:
              typeof ev?.version_number === "number"
                ? `v${ev.version_number}`
                : null,
          };
        });
        const evaluatorTitle = runEvaluators
          .map((e) => {
            const name = e.name || e.evaluator_id.slice(0, 8);
            return e.version_label ? `${name} (${e.version_label})` : name;
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
              {runEvaluators.length === 0 ? (
                <span className="text-sm text-muted-foreground">—</span>
              ) : (
                runEvaluators.map((e) => {
                  const name = e.name || e.evaluator_id.slice(0, 8);
                  return (
                    <span
                      key={`${e.evaluator_id}-${e.evaluator_version_id ?? ""}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-background text-foreground"
                    >
                      <span>{name}</span>
                      {e.version_label && (
                        <span className="font-mono text-[10px] text-muted-foreground">
                          {e.version_label}
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

function SortIndicator({
  direction,
}: {
  direction: "asc" | "desc" | null;
}) {
  return (
    <svg
      className={`w-3 h-3 transition-transform ${
        direction === "asc" ? "rotate-180" : ""
      } ${direction ? "text-foreground" : "text-muted-foreground/40"}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden="true"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M19 9l-7 7-7-7"
      />
    </svg>
  );
}

function formatItemUpdatedAt(item: {
  updated_at?: string;
  created_at?: string;
}): string {
  const raw = item.updated_at ?? item.created_at;
  if (!raw) return "—";
  const d = new Date(raw.replace(" ", "T") + "Z");
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleString();
}

function ItemRowActions({
  itemUuid,
  onDelete,
  onLabel,
  onEdit,
  onEvaluate,
  onDuplicate,
}: {
  itemUuid: string;
  onDelete: (uuid: string) => void | Promise<void>;
  onLabel?: (uuid: string) => void;
  onEdit?: (uuid: string) => void;
  onEvaluate?: (uuid: string) => void;
  onDuplicate?: (uuid: string) => void;
}) {
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
      {onEvaluate && (
        <button
          type="button"
          onClick={() => onEvaluate(itemUuid)}
          aria-label="Evaluate"
          className="h-8 px-3 rounded-md text-sm font-medium border border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/20 transition-colors cursor-pointer"
        >
          Evaluate
        </button>
      )}
      {onEdit && (
        <button
          type="button"
          onClick={() => onEdit(itemUuid)}
          aria-label="Edit"
          className="h-8 px-3 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer"
        >
          Edit
        </button>
      )}
      {onDuplicate && (
        <DuplicateIconButton
          onClick={() => onDuplicate(itemUuid)}
          tooltip="Duplicate item"
        />
      )}
      {/* Delete Button */}
      <DeleteIconButton
        onClick={() => onDelete(itemUuid)}
        title="Delete item"
      />
    </div>
  );
}


function LabelledByCell({
  labellers,
  annotatorNameById,
}: {
  labellers: Set<string> | undefined;
  annotatorNameById: Map<string, string>;
}) {
  if (!labellers || labellers.size === 0) {
    return (
      <div className="flex flex-wrap gap-1 min-w-0">
        <span className="text-sm text-muted-foreground">—</span>
      </div>
    );
  }
  const ids = Array.from(labellers);
  const nameFor = (id: string) =>
    annotatorNameById.get(id) ?? id.slice(0, 8);
  const visibleIds = ids.length <= 2 ? ids : ids.slice(0, 1);
  const remainingNames =
    ids.length <= 2 ? [] : ids.slice(1).map(nameFor);
  return (
    <div className="flex flex-wrap gap-1 min-w-0">
      {visibleIds.map((id) => (
        <span
          key={id}
          className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-muted/40 text-foreground"
        >
          {nameFor(id)}
        </span>
      ))}
      {remainingNames.length > 0 && (
        <MoreLabellersChip names={remainingNames} />
      )}
    </div>
  );
}

function MoreLabellersChip({ names }: { names: string[] }) {
  const triggerRef = useRef<HTMLSpanElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const update = () => {
      if (!triggerRef.current) return;
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.top, left: r.left + r.width / 2 });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open]);

  return (
    <>
      <span
        ref={triggerRef}
        className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-muted/40 text-muted-foreground cursor-default"
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onClick={(e) => e.stopPropagation()}
      >
        +{names.length} more
      </span>
      {open &&
        pos &&
        typeof window !== "undefined" &&
        createPortal(
          <div
            className="fixed z-[9999] -translate-x-1/2 -translate-y-full pointer-events-none"
            style={{ top: pos.top - 6, left: pos.left }}
          >
            <div className="flex flex-wrap gap-1 px-2 py-1.5 rounded-lg bg-white shadow-lg border border-border max-w-64 w-max">
              {names.map((n, i) => (
                <span
                  key={i}
                  className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-muted/40 text-foreground"
                >
                  {n}
                </span>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

function JobsList({
  jobs,
  selectedJobUuids,
  onToggleJob,
  onToggleSelectAll,
  allSelected,
  someSelected,
  onRequestDelete,
}: {
  jobs: LabellingJob[];
  selectedJobUuids: Set<string>;
  onToggleJob: (jobUuid: string) => void;
  onToggleSelectAll: () => void;
  allSelected: boolean;
  someSelected: boolean;
  onRequestDelete: (jobUuid: string) => void;
}) {
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
      <div className="grid grid-cols-[40px_180px_minmax(0,1fr)_120px_120px_60px] gap-4 [&>*:nth-child(4)]:pl-6 px-4 py-2 border-b border-border bg-muted/30 items-center">
        <input
          type="checkbox"
          checked={allSelected}
          ref={(el) => {
            if (el) el.indeterminate = someSelected;
          }}
          onChange={onToggleSelectAll}
          aria-label="Select all jobs"
          className="w-4 h-4 cursor-pointer accent-foreground"
        />
        <div className="text-sm font-medium text-muted-foreground">
          Annotator
        </div>
        <div className="text-sm font-medium text-muted-foreground">Link</div>
        <div className="text-sm font-medium text-muted-foreground">Status</div>
        <div className="text-sm font-medium text-muted-foreground">
          Progress
        </div>
        <div className="text-sm font-medium text-muted-foreground text-center">
          Actions
        </div>
      </div>
      {jobs.map((job) => {
        const isImported = job.public_token.startsWith("import:");
        const copied = copiedToken === job.public_token;
        const url = buildAnnotateUrl(job.public_token);
        const isSelected = selectedJobUuids.has(job.uuid);
        return (
          <div
            key={job.uuid}
            onClick={() => {
              if (!isImported)
                router.push(`/human-alignment/jobs/${job.public_token}`);
            }}
            className={`grid grid-cols-[40px_180px_minmax(0,1fr)_120px_120px_60px] gap-4 [&>*:nth-child(4)]:pl-6 px-4 py-3 border-b border-border last:border-b-0 items-center transition-colors ${
              isSelected ? "bg-muted/30" : "hover:bg-muted/20"
            } ${isImported ? "" : "cursor-pointer"}`}
          >
            <input
              type="checkbox"
              checked={isSelected}
              onChange={() => onToggleJob(job.uuid)}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Select job ${job.annotator_name}`}
              className="w-4 h-4 cursor-pointer accent-foreground"
            />
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
              {job.completed_item_count} / {job.item_count}
            </div>
            <div className="flex justify-center">
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onRequestDelete(job.uuid);
                }}
                aria-label="Delete job"
                title="Delete job"
                className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:bg-red-500/10 hover:text-red-500 transition-colors cursor-pointer"
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
                    d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                  />
                </svg>
              </button>
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
    isTab(initialTab) ? initialTab : "overview",
  );

  const handleTabChange = useCallback(
    (tab: Tab) => {
      setActiveTab(tab);
      window.history.replaceState(
        null,
        "",
        `/human-alignment/tasks/${uuid}?tab=${tab}`,
      );
    },
    [uuid],
  );

  // After landing on the task page for the first time, if the task has
  // no items yet *and* the URL didn't pin a specific tab, drop the user
  // straight onto the items tab — that's the next thing they need to
  // do. Guarded by a ref so we don't fight the user's later tab choices.
  const autoTabSwitchedRef = useRef(false);

  const [task, setTask] = useState<LabellingTask | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { errorCode, reset: resetErrorCode, captureError } =
    usePageErrorState();
  /** False until the first task GET for this route finishes (avoids empty-state flash on Items/Jobs). */
  const [taskFetchCompleted, setTaskFetchCompleted] = useState(false);

  // evaluators / agreement (declared before route-level effects that reset on uuid)
  const [runs, setRuns] = useState<EvaluatorRunJob[]>([]);
  // Top-level evaluators[] block from the runs-list response. Used to
  // resolve each run's evaluator refs (id, version_id) into display
  // pills (name + version_number).
  const [runsListEvaluators, setRunsListEvaluators] = useState<
    RunsListEvaluator[]
  >([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);
  /** False until the first evaluator-runs list fetch finishes (avoids empty placeholder flash). */
  const [runsFetchCompleted, setRunsFetchCompleted] = useState(false);

  const [agreement, setAgreement] = useState<TaskAgreementResponse | null>(
    null,
  );
  const [agreementLoading, setAgreementLoading] = useState(false);
  const [agreementError, setAgreementError] = useState<string | null>(null);
  /** False until the first agreement request for this task finishes (avoids empty placeholder flash). */
  const [agreementFetchCompleted, setAgreementFetchCompleted] = useState(false);

  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(
    new Set(),
  );
  const [assignOpen, setAssignOpen] = useState(false);
  const [deleteSelectedOpen, setDeleteSelectedOpen] = useState(false);
  const [deletingSelected, setDeletingSelected] = useState(false);

  const [selectedJobUuids, setSelectedJobUuids] = useState<Set<string>>(
    new Set(),
  );
  const [deleteJobsOpen, setDeleteJobsOpen] = useState(false);
  const [deletingJobs, setDeletingJobs] = useState(false);
  const [deletingJobUuid, setDeletingJobUuid] = useState<string | null>(null);
  const [deletingJobInFlight, setDeletingJobInFlight] = useState(false);
  const [editSttItemsOpen, setEditSttItemsOpen] = useState(false);
  const [editSttSingleItemUuid, setEditSttSingleItemUuid] = useState<
    string | null
  >(null);
  const [editLlmItemUuid, setEditLlmItemUuid] = useState<string | null>(null);
  const [editLlmItemName, setEditLlmItemName] = useState("");
  const [editLlmItemDescription, setEditLlmItemDescription] = useState("");
  const [savingLlmItem, setSavingLlmItem] = useState(false);
  const [editLlmError, setEditLlmError] = useState<string | null>(null);
  // When duplicating an item, the create dialog opens pre-filled from this
  // payload. Cleared whenever the create dialog opens fresh or closes.
  const [duplicateSourcePayload, setDuplicateSourcePayload] = useState<Record<
    string,
    unknown
  > | null>(null);
  // STT items use a separate dialog; this holds the row to seed it with.
  const [duplicateSttRows, setDuplicateSttRows] = useState<
    { uuid: string; name: string; actual: string; predicted: string }[] | null
  >(null);

  // Sort direction for the items table's Updated at column. Always
  // applied to `updated_at` on the backend; defaults to desc (newest
  // first). Persisted so the user's choice carries across visits.
  const [itemsSort, setItemsSort] = useState<"asc" | "desc">("desc");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(ITEMS_SORT_KEY);
    if (stored === "asc" || stored === "desc") setItemsSort(stored);
  }, []);
  const toggleItemsSort = () => {
    setItemsSort((prev) => {
      const next = prev === "desc" ? "asc" : "desc";
      if (typeof window !== "undefined") {
        window.localStorage.setItem(ITEMS_SORT_KEY, next);
      }
      return next;
    });
  };

  // Server-side pagination / search for the items tab — driven by the
  // /summary endpoint's new params (PR #60). Limit is persisted so the
  // user's preferred page size sticks across visits; offset and search
  // are session-scoped.
  const [itemsLimit, setItemsLimit] = useState<number>(50);
  const [itemsOffset, setItemsOffset] = useState<number>(0);
  const [itemsSearchInput, setItemsSearchInput] = useState<string>("");
  const [itemsSearch, setItemsSearch] = useState<string>("");
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(ITEMS_PAGE_SIZE_KEY);
    const parsed = stored ? Number(stored) : NaN;
    if (
      Number.isFinite(parsed) &&
      (ITEMS_PAGE_SIZE_OPTIONS as readonly number[]).includes(parsed)
    ) {
      setItemsLimit(parsed);
    }
  }, []);
  // Debounce the search input so we don't hammer the API on every keystroke.
  useEffect(() => {
    const handle = window.setTimeout(() => {
      setItemsSearch(itemsSearchInput);
      setItemsOffset(0);
    }, 250);
    return () => window.clearTimeout(handle);
  }, [itemsSearchInput]);

  useEffect(() => {
    if (task?.name) document.title = `${task.name} | Calibrate`;
  }, [task?.name]);

  // Drag-and-drop reorder state for the linked-evaluator pills on the
  // task header. `dragSourceIdx` is the index of the pill currently
  // being dragged; `dragOverIdx` is the index it's hovering over (for
  // the highlight ring). On drop we PUT /evaluators/order with the
  // full ordered uuid list and update local state from the response.
  const [evDragSourceIdx, setEvDragSourceIdx] = useState<number | null>(null);
  const [evDragOverIdx, setEvDragOverIdx] = useState<number | null>(null);
  const [evReordering, setEvReordering] = useState(false);

  const fetchTask = useCallback(async () => {
    if (!accessToken || !uuid) return;
    setLoading(true);
    setError(null);
    resetErrorCode();
    try {
      const data = await apiClient<LabellingTask>(
        `/annotation-tasks/${uuid}`,
        accessToken,
      );
      setTask(data);
    } catch (err) {
      if (captureError(err)) return;
      const msg = parseApiError(err, "Failed to load task");
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
      setTaskFetchCompleted(true);
    }
  }, [accessToken, uuid, resetErrorCode, captureError]);

  // Reorder linked evaluators. `targetOrder` is the new desired ordered
  // list of uuids — must be the exact same set currently linked to the
  // task. Optimistically updates local state, PUTs the order, then
  // overwrites with the server-fresh list from the 200 response. On
  // failure we toast the server detail and refetch so the user's UI
  // matches the server's link set.
  const reorderEvaluators = useCallback(
    async (targetOrder: string[]) => {
      if (!accessToken || !uuid) return;
      setEvReordering(true);
      // Optimistic reorder.
      const previousEvaluators = task?.evaluators ?? [];
      const byUuid = new Map(previousEvaluators.map((e) => [e.uuid, e]));
      const optimistic = targetOrder
        .map((id) => byUuid.get(id))
        .filter((e): e is NonNullable<typeof e> => !!e);
      setTask((prev) =>
        prev ? { ...prev, evaluators: optimistic } : prev,
      );
      try {
        const result = await apiClient<{
          message: string;
          evaluators: LabellingTask["evaluators"];
        }>(`/annotation-tasks/${uuid}/evaluators/order`, accessToken, {
          method: "PUT",
          body: { evaluator_ids: targetOrder },
        });
        if (result?.evaluators) {
          setTask((prev) =>
            prev ? { ...prev, evaluators: result.evaluators } : prev,
          );
        }
      } catch (err) {
        toast.error(parseApiError(err, "Failed to reorder evaluators"));
        // Server might have a different link set than ours — refetch
        // to reconcile rather than blindly restoring the previous order.
        fetchTask();
      } finally {
        setEvReordering(false);
      }
    },
    [accessToken, uuid, task?.evaluators, fetchTask],
  );

  useEffect(() => {
    setAgreementFetchCompleted(false);
    setAgreement(null);
    setTaskFetchCompleted(false);
    setTask(null);
    setError(null);
    setRuns([]);
    setRunsListEvaluators([]);
    setRunsFetchCompleted(false);
    setTaskSummary(null);
    setTaskSummaryError(null);
    setSummaryFetchCompleted(false);
    setItemsOffset(0);
    setItemsSearch("");
    setItemsSearchInput("");
    autoTabSwitchedRef.current = false;
  }, [uuid]);

  useEffect(() => {
    fetchTask();
  }, [fetchTask]);

  const fetchAgreement = useCallback(async () => {
    if (!accessToken || !uuid) return;
    setAgreementLoading(true);
    setAgreementError(null);
    try {
      const data = await apiClient<TaskAgreementResponse>(
        `/annotation-tasks/${uuid}/agreement?bucket=month&days=180`,
        accessToken,
      );
      setAgreement(data);
    } catch (err) {
      setAgreementError(parseApiError(err, "Failed to load agreement"));
    } finally {
      setAgreementLoading(false);
      setAgreementFetchCompleted(true);
    }
  }, [accessToken, uuid]);

  useEffect(() => {
    fetchAgreement();
  }, [fetchAgreement]);

  const [taskSummary, setTaskSummary] = useState<TaskSummaryResponse | null>(
    null,
  );
  const [taskSummaryError, setTaskSummaryError] = useState<string | null>(
    null,
  );
  const [summaryLoading, setSummaryLoading] = useState(false);
  /** False until the first summary fetch for this task completes (so the
   * Items tab's "Labelled by" column doesn't flash "—" before populating). */
  const [summaryFetchCompleted, setSummaryFetchCompleted] = useState(false);

  const fetchTaskSummary = useCallback(async () => {
    if (!accessToken || !uuid) return;
    setTaskSummaryError(null);
    setSummaryLoading(true);
    const params = new URLSearchParams({
      limit: String(itemsLimit),
      offset: String(itemsOffset),
      sort_by: "updated_at",
      order: itemsSort,
    });
    if (itemsSearch) params.set("q", itemsSearch);
    try {
      const data = await apiClient<TaskSummaryResponse>(
        `/annotation-tasks/${uuid}/summary?${params.toString()}`,
        accessToken,
      );
      setTaskSummary(data);
    } catch (err) {
      setTaskSummaryError(parseApiError(err, "Failed to load task summary"));
    } finally {
      setSummaryLoading(false);
      setSummaryFetchCompleted(true);
    }
  }, [accessToken, uuid, itemsLimit, itemsOffset, itemsSort, itemsSearch]);

  useEffect(() => {
    fetchTaskSummary();
  }, [fetchTaskSummary]);

  // Snap offset back into range after the summary returns — covers
  // deletes that shrink the result set below the current offset, or a
  // search that narrows total below offset.
  useEffect(() => {
    const total = taskSummary?.pagination?.total;
    if (total == null) return;
    if (itemsOffset > 0 && itemsOffset >= total) {
      const lastPageOffset = Math.max(
        0,
        (Math.ceil(total / itemsLimit) - 1) * itemsLimit,
      );
      setItemsOffset(lastPageOffset);
    }
  }, [taskSummary, itemsOffset, itemsLimit]);

  useEffect(() => {
    if (autoTabSwitchedRef.current) return;
    if (!task) return;
    if (isTab(initialTab)) {
      autoTabSwitchedRef.current = true;
      return; // user pinned a tab via URL
    }
    const taskItemCount = task.item_count ?? task.items?.length ?? 0;
    if (taskItemCount === 0) {
      autoTabSwitchedRef.current = true;
      handleTabChange("items");
      return;
    }
    // Items exist — overview only renders the agreement panel, so if
    // there's no agreement data the overview is just an empty state.
    // Skip straight to the items tab in that case. Wait for every
    // overview-tab fetch to complete first so the user doesn't see a
    // spinner→bounce flicker on slow connections. If the agreement
    // fetch errored, stay on overview so the user sees the error rather
    // than getting silently bounced off the tab.
    if (
      !agreementFetchCompleted ||
      !summaryFetchCompleted ||
      !runsFetchCompleted
    )
      return;
    if (agreementError) {
      autoTabSwitchedRef.current = true;
      return;
    }
    if (!agreement) return;
    const agreementEmpty =
      (agreement.human_human?.pair_count ?? 0) === 0 &&
      (agreement.evaluators ?? []).every((e) => (e.pair_count ?? 0) === 0);
    autoTabSwitchedRef.current = true;
    if (agreementEmpty) {
      handleTabChange("items");
    }
  }, [
    task,
    initialTab,
    handleTabChange,
    agreement,
    agreementError,
    agreementFetchCompleted,
    summaryFetchCompleted,
    runsFetchCompleted,
  ]);

  // Map item_id -> annotator uuids who have at least one labelled annotation
  // for that item. Drives the "Labelled by" column on the items tab.
  const labellersByItem = useMemo(() => {
    const out = new Map<string, Set<string>>();
    if (!taskSummary) return out;
    for (const row of taskSummary.rows) {
      for (const [annotatorUuid, ann] of Object.entries(row.annotations ?? {})) {
        if (ann && ann.value !== null && ann.value !== undefined) {
          if (!out.has(row.item_id)) out.set(row.item_id, new Set());
          out.get(row.item_id)!.add(annotatorUuid);
        }
      }
    }
    return out;
  }, [taskSummary]);

  const annotatorNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const a of taskSummary?.annotators ?? []) map.set(a.uuid, a.name);
    return map;
  }, [taskSummary]);
  const fetchRuns = useCallback(async () => {
    if (!accessToken || !uuid) return;
    setRunsLoading(true);
    setRunsError(null);
    try {
      const data = await apiClient<EvaluatorRunsListResponse>(
        `/annotation-tasks/${uuid}/evaluator-runs`,
        accessToken,
      );
      setRuns(Array.isArray(data?.runs) ? data.runs : []);
      setRunsListEvaluators(
        Array.isArray(data?.evaluators) ? data.evaluators : [],
      );
    } catch (err) {
      setRunsError(parseApiError(err, "Failed to load evaluator runs"));
    } finally {
      setRunsLoading(false);
      setRunsFetchCompleted(true);
    }
  }, [accessToken, uuid]);

  useEffect(() => {
    fetchRuns();
  }, [fetchRuns]);
  void activeTab;

  // Items shown on the current page are driven by the (paginated /
  // sorted / searched) summary endpoint. We unique summary rows by
  // item_id (each item explodes into one row per evaluator × version
  // slot) preserving the API-returned order, then hydrate per-item
  // metadata (id, created_at, updated_at) from the full task.items
  // lookup. Items that are in the summary but missing from task.items
  // still render — payload + uuid come from the summary row.
  const itemMetaByUuid = useMemo(() => {
    const map = new Map<string, LabellingItem>();
    for (const it of task?.items ?? []) map.set(it.uuid, it);
    return map;
  }, [task?.items]);
  const items = useMemo<LabellingItem[]>(() => {
    if (!taskSummary) return [];
    const seen = new Set<string>();
    const out: LabellingItem[] = [];
    for (const row of taskSummary.rows ?? []) {
      if (seen.has(row.item_id)) continue;
      seen.add(row.item_id);
      const meta = itemMetaByUuid.get(row.item_id);
      out.push(
        meta
          ? { ...meta, payload: row.payload ?? meta.payload }
          : {
              id: 0,
              uuid: row.item_id,
              task_id: taskSummary.task_id,
              payload: row.payload,
              created_at: "",
              updated_at: undefined,
              deleted_at: null,
            },
      );
    }
    return out;
  }, [taskSummary, itemMetaByUuid]);
  const jobs = task?.jobs ?? [];
  // First-load spinner only — paginated refetches keep the table
  // visible and surface their loading state via the refresh button.
  const itemsLoading = !taskFetchCompleted || !summaryFetchCompleted;
  const itemsError = error;
  const itemsTotal =
    taskSummary?.pagination?.total ?? task?.item_count ?? items.length;
  const itemsCount = itemsTotal;
  const itemsPageCount =
    itemsLimit > 0 ? Math.max(1, Math.ceil(itemsTotal / itemsLimit)) : 1;
  const itemsCurrentPage =
    itemsLimit > 0 ? Math.floor(itemsOffset / itemsLimit) + 1 : 1;
  const itemsRangeStart = itemsTotal === 0 ? 0 : itemsOffset + 1;
  const itemsRangeEnd = Math.min(itemsOffset + items.length, itemsTotal);
  // Hide the whole pagination footer when pagination can never apply — i.e.
  // even the smallest page size fits every item on one page. Above that
  // threshold we keep the footer (so the Per-page selector stays reachable)
  // but hide the prev/next page nav whenever there's only a single page.
  const showItemsPagination = itemsTotal > ITEMS_PAGE_SIZE_OPTIONS[0];
  /** True when the task itself has any items (regardless of the
   * current search). Used to distinguish the "no items yet" empty state
   * from the "no search matches" state. */
  const hasAnyItems =
    (task?.item_count ?? 0) > 0 ||
    (taskSummary?.pagination?.total ?? 0) > 0 ||
    (itemsSearch ? false : items.length > 0);
  const jobsCount = jobs.length;
  const taskType =
    task?.type ?? task?.evaluators?.[0]?.evaluator_type;
  const canAddItem =
    taskType === "llm" || taskType === "conversation" || taskType === "stt";

  /**
   * Anchor for shift+click range selection — the uuid of the most
   * recently clicked row/checkbox. Cleared if it drops out of `items`.
   */
  const [lastSelectedItemUuid, setLastSelectedItemUuid] = useState<
    string | null
  >(null);

  /**
   * `onChange` on a checkbox doesn't carry `shiftKey`, and calling
   * `e.preventDefault()` on the checkbox's `onClick` desyncs React's
   * controlled `checked` prop from the DOM (state updates but the visual
   * tick doesn't appear). So we capture shift state on `mousedown` into a
   * ref and read it inside `onChange`, leaving the native toggle alone.
   */
  const pendingShiftRef = useRef(false);

  /**
   * "Select all N rows across pages" mode. When true, bulk actions send
   * `{ select_all: true, q? }` to the backend instead of an explicit
   * `item_ids` list — so they apply to every item matching the current
   * filter, not just the rows currently in `selectedItemIds`. Entered
   * via the inline CTA in the bulk-action toolbar once the current
   * page's "Select all" is checked AND there's more than one page;
   * exited by any per-row interaction, by the Clear button, by a
   * search change, or on action success.
   */
  const [selectAllTotal, setSelectAllTotal] = useState(false);

  const toggleItem = (uuid: string) => {
    if (selectAllTotal) {
      // Leaving "select all across pages": the backend can't express
      // "all except this one", so collapse to an explicit selection of
      // the current page (every visible row was shown ticked) and drop
      // the row the user just unticked.
      const next = new Set(items.map((i) => i.uuid));
      next.delete(uuid);
      setSelectedItemIds(next);
      setSelectAllTotal(false);
      setLastSelectedItemUuid(uuid);
      return;
    }
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
    setLastSelectedItemUuid(uuid);
  };

  /**
   * Shift+click range selection: adds every item between the anchor
   * (`lastSelectedItemUuid`) and `targetUuid` — inclusive, in the current
   * sorted order — to the selection. Falls back to a plain toggle if
   * the anchor is missing.
   */
  const selectRangeTo = (targetUuid: string) => {
    // In "select all across pages" mode every row is already ticked, so a
    // shift+click degrades to a single toggle (which materialises the page
    // selection and drops select-all).
    if (selectAllTotal) {
      toggleItem(targetUuid);
      return;
    }
    if (!lastSelectedItemUuid || lastSelectedItemUuid === targetUuid) {
      toggleItem(targetUuid);
      return;
    }
    const anchorIdx = items.findIndex((i) => i.uuid === lastSelectedItemUuid);
    const targetIdx = items.findIndex((i) => i.uuid === targetUuid);
    if (anchorIdx === -1 || targetIdx === -1) {
      toggleItem(targetUuid);
      return;
    }
    const [start, end] =
      anchorIdx <= targetIdx
        ? [anchorIdx, targetIdx]
        : [targetIdx, anchorIdx];
    setSelectedItemIds((prev) => {
      const next = new Set(prev);
      for (let i = start; i <= end; i++) next.add(items[i].uuid);
      return next;
    });
    setLastSelectedItemUuid(targetUuid);
    // Range selection is an explicit per-row gesture; drop "select all".
    setSelectAllTotal(false);
  };

  /**
   * Anchored to the top of the items section so the bulk-action toolbar
   * (which renders here when `selectedItemIds.size > 0`) is scrolled into
   * view when the user triggers bulk mode from a row's Label/Evaluate.
   *
   * `window.scrollTo` doesn't work here because AppLayout puts page content
   * inside its own `overflow-y-auto` container — the window itself isn't
   * the scroller. `scrollIntoView` finds the correct scrollable ancestor.
   */
  const itemsSectionTopRef = useRef<HTMLDivElement | null>(null);

  /**
   * Selects an item AND scrolls back to the top of the items section so the
   * newly visible bulk-action toolbar (Evaluate selected / Label selected)
   * is in view. Used by the per-row Label/Evaluate buttons when no rows are
   * yet selected — those buttons enter bulk mode rather than acting on the
   * row directly. When bulk mode is already on (some other row is checked),
   * the row buttons are hidden, so this helper isn't called in that case.
   */
  const enterBulkModeWithScroll = (uuid: string) => {
    toggleItem(uuid);
    // rAF so the bulk toolbar has rendered before we scroll.
    requestAnimationFrame(() => {
      itemsSectionTopRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  };

  const allSelected =
    selectAllTotal ||
    (items.length > 0 && selectedItemIds.size === items.length);
  const someSelected =
    !selectAllTotal && selectedItemIds.size > 0 && !allSelected;
  const toggleSelectAll = () => {
    if (allSelected) {
      // Everything (current page, or all-across-pages) is selected → clear.
      setSelectedItemIds(new Set());
      setSelectAllTotal(false);
    } else {
      setSelectedItemIds(new Set(items.map((i) => i.uuid)));
    }
  };

  /**
   * A change to the search query redefines what "all" means, so the
   * across-pages select needs to be re-confirmed by the user. Pagination
   * (`itemsOffset`) does NOT reset it — navigating between pages of the
   * same filter shouldn't clear the user's "select all" intent.
   */
  useEffect(() => {
    setSelectAllTotal(false);
  }, [itemsSearch]);

  // Drop selections that no longer exist in the items list (after delete or refetch).
  useEffect(() => {
    const ids = new Set(items.map((i) => i.uuid));
    setSelectedItemIds((prev) => {
      if (prev.size === 0) return prev;
      const next = new Set<string>();
      prev.forEach((id) => {
        if (ids.has(id)) next.add(id);
      });
      return next.size === prev.size ? prev : next;
    });
    setLastSelectedItemUuid((prev) =>
      prev && !ids.has(prev) ? null : prev,
    );
  }, [items]);

  const toggleJob = (jobUuid: string) => {
    setSelectedJobUuids((prev) => {
      const next = new Set(prev);
      if (next.has(jobUuid)) next.delete(jobUuid);
      else next.add(jobUuid);
      return next;
    });
  };

  const allJobsSelected =
    jobs.length > 0 && selectedJobUuids.size === jobs.length;
  const someJobsSelected = selectedJobUuids.size > 0 && !allJobsSelected;
  const toggleSelectAllJobs = () => {
    setSelectedJobUuids((prev) =>
      prev.size === jobs.length ? new Set() : new Set(jobs.map((j) => j.uuid)),
    );
  };

  useEffect(() => {
    setSelectedJobUuids((prev) => {
      if (prev.size === 0) return prev;
      const ids = new Set(jobs.map((j) => j.uuid));
      const next = new Set<string>();
      prev.forEach((id) => {
        if (ids.has(id)) next.add(id);
      });
      return next.size === prev.size ? prev : next;
    });
  }, [jobs]);

  const [startingRun, setStartingRun] = useState(false);
  // Run evaluators dialog state. itemUuids: null = all items in task,
  // []/non-empty = the specific items to run for.
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [runDialogItemUuids, setRunDialogItemUuids] = useState<string[] | null>(
    null,
  );
  /**
   * When the user evaluated via the "select all across pages" CTA, we
   * remember that here so `submitRunEvaluators` sends
   * `{ select_all: true, q? }` instead of `item_ids`. Reset every time
   * the run dialog is opened so a stale flag doesn't leak between flows.
   */
  const [runDialogSelectAll, setRunDialogSelectAll] = useState<{
    q?: string;
  } | null>(null);
  const [runDialogSubmitError, setRunDialogSubmitError] = useState<
    string | null
  >(null);

  const handleRunEvaluators = (
    target?: string[] | string | { selectAll: true; q?: string },
  ) => {
    if (!accessToken || !uuid || startingRun) return;
    const linked = task?.evaluators ?? [];
    if (linked.length === 0) {
      toast.error("Link at least one evaluator before running.");
      return;
    }
    if (
      target &&
      typeof target === "object" &&
      !Array.isArray(target) &&
      "selectAll" in target
    ) {
      setRunDialogItemUuids(null);
      setRunDialogSelectAll({ q: target.q });
    } else {
      const ids = Array.isArray(target) ? target : target ? [target] : null;
      setRunDialogItemUuids(ids);
      setRunDialogSelectAll(null);
    }
    setRunDialogSubmitError(null);
    setRunDialogOpen(true);
  };

  const submitRunEvaluators = async (
    selections: { evaluator_id: string; evaluator_version_id: string }[],
  ) => {
    if (!accessToken || !uuid || startingRun) return;
    const ids = runDialogItemUuids;
    const selectAll = runDialogSelectAll;
    setStartingRun(true);
    setRunDialogSubmitError(null);
    try {
      const body: Record<string, unknown> = { evaluators: selections };
      if (selectAll) {
        body.select_all = true;
        if (selectAll.q) body.q = selectAll.q;
      } else if (ids && ids.length > 0) {
        body.item_ids = ids;
      }
      const result = await apiClient<{
        job_uuid: string;
        status: string;
        evaluator_count: number;
        item_count: number;
      }>(`/annotation-tasks/${uuid}/evaluator-runs`, accessToken, {
        method: "POST",
        body,
      });
      setRunDialogOpen(false);
      router.push(
        `/human-alignment/tasks/${uuid}/evaluator-runs/${result.job_uuid}`,
      );
    } catch (err) {
      const msg = parseApiError(err, "Failed to start evaluation run");
      setRunDialogSubmitError(msg);
      toast.error(msg);
      setStartingRun(false);
    }
    // Note: we intentionally keep `startingRun=true` on the success path
    // until the navigation completes (page unmounts), so the bulk
    // "Evaluate all" button stays in its loading state up to the redirect.
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
      await Promise.all([fetchTask(), fetchTaskSummary()]);
    } catch (err) {
      setError(parseApiError(err, "Failed to delete item"));
    } finally {
      setDeletingOneInFlight(false);
    }
  };

  const confirmDeleteOneJob = async () => {
    if (!accessToken || !deletingJobUuid) return;
    const jobUuid = deletingJobUuid;
    setDeletingJobInFlight(true);
    try {
      await apiClient<{ message: string }>(
        `/annotation-tasks/${uuid}/jobs/${jobUuid}`,
        accessToken,
        { method: "DELETE" },
      );
      setSelectedJobUuids((prev) => {
        const next = new Set(prev);
        next.delete(jobUuid);
        return next;
      });
      setDeletingJobUuid(null);
      await fetchTask();
    } catch (err) {
      toast.error(parseApiError(err, "Failed to delete labelling job"));
    } finally {
      setDeletingJobInFlight(false);
    }
  };

  const handleDeleteSelectedJobs = async () => {
    if (selectedJobUuids.size === 0 || !accessToken) return;
    setDeletingJobs(true);
    try {
      await apiClient<{ deleted_count: number }>(
        `/annotation-tasks/${uuid}/jobs`,
        accessToken,
        {
          method: "DELETE",
          body: { job_uuids: Array.from(selectedJobUuids) },
        },
      );
      setDeleteJobsOpen(false);
      setSelectedJobUuids(new Set());
      await fetchTask();
    } catch (err) {
      toast.error(parseApiError(err, "Failed to delete labelling jobs"));
    } finally {
      setDeletingJobs(false);
    }
  };

  const handleDeleteSelected = async () => {
    if ((selectedItemIds.size === 0 && !selectAllTotal) || !accessToken)
      return;
    setDeletingSelected(true);
    try {
      const body: Record<string, unknown> = selectAllTotal
        ? {
            select_all: true,
            ...(itemsSearch ? { q: itemsSearch } : {}),
          }
        : { item_ids: Array.from(selectedItemIds) };
      await apiClient<{ deleted_count: number }>(
        `/annotation-tasks/${uuid}/items`,
        accessToken,
        { method: "DELETE", body },
      );
      setDeleteSelectedOpen(false);
      setSelectedItemIds(new Set());
      setSelectAllTotal(false);
      await Promise.all([fetchTask(), fetchTaskSummary()]);
    } catch (err) {
      setError(parseApiError(err, "Failed to delete items"));
    } finally {
      setDeletingSelected(false);
    }
  };

  // GET /annotation-tasks/{uuid} now returns each linked evaluator with
  // its live-version metadata (variables, output_type, scale, slug,
  // description) inlined, so we no longer need a separate
  // /evaluators?include_defaults=true catalogue fetch on this page.

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
      const saved = savedValues[ev.uuid] ?? null;
      let variables: EvaluatorVariableDef[] = ev.variables ?? [];
      if (variables.length === 0 && saved && Object.keys(saved).length > 0) {
        variables = Object.keys(saved).map((name) => ({ name }));
      }
      return {
        evaluator_uuid: ev.uuid,
        name: ev.name,
        description: ev.description ?? null,
        slug: ev.slug ?? null,
        variables,
        variable_values: saved,
      };
    });
  };

  const editingInitialEvaluators = buildInitialEvaluators(
    readEvaluatorVariables(editingPayload),
  );
  // When duplicating, seed the create dialog's evaluators from the source
  // item; otherwise start with the task's linked evaluators (empty values).
  const newItemInitialEvaluators = duplicateSourcePayload
    ? buildInitialEvaluators(readEvaluatorVariables(duplicateSourcePayload))
    : buildInitialEvaluators({});

  const buildInitialConfig = (
    payload: Record<string, unknown> | null,
  ): TestConfig | undefined => {
    if (!payload) return undefined;
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
        const createdAt =
          typeof obj.created_at === "string" ? obj.created_at : undefined;
        const tsField = createdAt ? { created_at: createdAt } : {};
        if (role === "assistant") {
          if (Array.isArray(toolCalls) && toolCalls.length > 0) {
            out.push({
              role: "assistant",
              ...(content != null ? { content } : {}),
              tool_calls: toolCalls as HistoryItem["tool_calls"],
              ...tsField,
            });
          } else if (content != null) {
            out.push({ role: "assistant", content, ...tsField });
          }
        } else if (role === "user" && content != null) {
          out.push({ role: "user", content, ...tsField });
        } else if (role === "tool" && content != null) {
          out.push({
            role: "tool",
            content,
            ...(toolCallId ? { tool_call_id: toolCallId } : {}),
            ...tsField,
          });
        }
      }
      return out;
    };

    let history: HistoryItem[];
    if (taskType === "conversation") {
      history = parseHistory(payload.transcript);
    } else {
      // LLM: chat_history (may include tool calls + tool responses) +
      // optional trailing agent_response (the regular text reply being
      // graded).
      history = parseHistory(payload.chat_history);
      const ar = payload.agent_response;
      if (typeof ar === "string" && ar.length > 0) {
        history.push({ role: "assistant", content: ar });
      }
    }
    return {
      history,
      evaluation: { type: "response" as const, criteria: "" },
    };
  };

  const editingInitialConfig = buildInitialConfig(editingPayload);
  const addItemInitialConfig = buildInitialConfig(duplicateSourcePayload);

  // Sync the name field whenever a different item is opened for edit.
  useEffect(() => {
    if (editingItem) {
      const n =
        typeof editingPayload?.name === "string"
          ? (editingPayload.name as string)
          : `Item ${editingItem.id}`;
      setEditLlmItemName(n);
      const d =
        typeof editingPayload?.description === "string"
          ? (editingPayload.description as string)
          : "";
      setEditLlmItemDescription(d);
      setEditLlmError(null);
    }
  }, [editingItem?.uuid, editingPayload]);

  const [createdJobs, setCreatedJobs] = useState<CreatedJob[]>([]);
  const [jobsCreatedOpen, setJobsCreatedOpen] = useState(false);

  const [itemDetailUuid, setItemDetailUuid] = useState<string | null>(null);
  const openItemDetail = useCallback((itemUuid: string) => {
    setItemDetailUuid(itemUuid);
  }, []);

  const handleAssignAnnotators = async (annotatorIds: string[]) => {
    if (
      (selectedItemIds.size === 0 && !selectAllTotal) ||
      annotatorIds.length === 0 ||
      !accessToken
    )
      return;
    const body: Record<string, unknown> = {
      annotator_ids: annotatorIds,
      ...(selectAllTotal
        ? {
            select_all: true,
            ...(itemsSearch ? { q: itemsSearch } : {}),
          }
        : { item_ids: Array.from(selectedItemIds) }),
    };
    const result = await apiClient<{ count: number; jobs: CreatedJob[] }>(
      `/annotation-tasks/${uuid}/jobs`,
      accessToken,
      { method: "POST", body },
    );
    setAssignOpen(false);
    setSelectedItemIds(new Set());
    setSelectAllTotal(false);
    setCreatedJobs(result.jobs ?? []);
    setJobsCreatedOpen(true);
    fetchTask();
  };

  const [manageOpen, setManageOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [addItemOpen, setAddItemOpen] = useState(false);
  const [addSttItemsOpen, setAddSttItemsOpen] = useState(false);
  const [bulkUploadSttOpen, setBulkUploadSttOpen] = useState(false);
  const [bulkUploadConversationOpen, setBulkUploadConversationOpen] =
    useState(false);
  const [bulkUploadLlmOpen, setBulkUploadLlmOpen] = useState(false);
  const [newItemName, setNewItemName] = useState("");
  const [newItemDescription, setNewItemDescription] = useState("");
  const [creatingItem, setCreatingItem] = useState(false);
  const [createItemError, setCreateItemError] = useState<string | null>(null);
  const [validationAttempted, setValidationAttempted] = useState(false);

  const customHeader = (
    <button
      onClick={() => router.push("/human-alignment?tab=tasks")}
      className="inline-flex items-center gap-1.5 px-2 h-8 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
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
      All tasks
    </button>
  );

  if (errorCode) {
    return (
      <AppLayout
        activeItem="human-alignment"
        onItemChange={(id) => router.push(`/${id}`)}
        sidebarOpen={sidebarOpen}
        onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
        customHeader={customHeader}
      >
        <NotFoundState errorCode={errorCode} />
      </AppLayout>
    );
  }

  return (
    <AppLayout
      activeItem="human-alignment"
      onItemChange={(id) => router.push(`/${id}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
      customHeader={customHeader}
    >
      <div className="py-4 md:py-6 space-y-6">
        {/* Mobile-only back button — AppLayout hides `customHeader` below
            md, so without this small-screen users would lose the back
            affordance. */}
        <button
          onClick={() => router.push("/human-alignment?tab=tasks")}
          className="md:hidden text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer flex items-center gap-1.5"
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
          All tasks
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
              <h1 className="text-2xl font-semibold flex items-center gap-2">
                {!taskFetchCompleted ? (
                  <svg
                    className="w-5 h-5 animate-spin text-muted-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    aria-label="Loading task"
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
                ) : (
                  (task?.name ?? "—")
                )}
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
                {(task.evaluators ?? []).map((ev, idx) => {
                  const evaluatorsList = task.evaluators ?? [];
                  const isDragging = evDragSourceIdx === idx;
                  const isDropTarget =
                    evDragOverIdx === idx &&
                    evDragSourceIdx !== null &&
                    evDragSourceIdx !== idx;
                  return (
                    <Link
                      key={ev.uuid}
                      href={`/evaluators/${ev.uuid}`}
                      draggable={!evReordering && evaluatorsList.length > 1}
                      onDragStart={(e) => {
                        if (evReordering || evaluatorsList.length <= 1) {
                          e.preventDefault();
                          return;
                        }
                        setEvDragSourceIdx(idx);
                        e.dataTransfer.effectAllowed = "move";
                        // Firefox requires data to be set or drag is
                        // cancelled.
                        e.dataTransfer.setData("text/plain", ev.uuid);
                      }}
                      onDragOver={(e) => {
                        if (evDragSourceIdx === null) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = "move";
                        if (evDragOverIdx !== idx) setEvDragOverIdx(idx);
                      }}
                      onDragLeave={() => {
                        if (evDragOverIdx === idx) setEvDragOverIdx(null);
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        const source = evDragSourceIdx;
                        setEvDragSourceIdx(null);
                        setEvDragOverIdx(null);
                        if (source === null || source === idx) return;
                        const next = evaluatorsList.map((x) => x.uuid);
                        const [moved] = next.splice(source, 1);
                        next.splice(idx, 0, moved);
                        void reorderEvaluators(next);
                      }}
                      onDragEnd={() => {
                        setEvDragSourceIdx(null);
                        setEvDragOverIdx(null);
                      }}
                      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border bg-muted/40 text-foreground hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer select-none ${
                        isDropTarget
                          ? "border-foreground/60 ring-2 ring-foreground/20"
                          : "border-border"
                      } ${isDragging ? "opacity-50" : ""}`}
                      title={
                        evaluatorsList.length > 1
                          ? `Open ${ev.name} · drag to reorder`
                          : `Open ${ev.name}`
                      }
                    >
                      {ev.name}
                    </Link>
                  );
                })}
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
                  if (taskType === "llm" || taskType === "conversation") {
                    setNewItemName("");
                    setNewItemDescription("");
                    setCreateItemError(null);
                    setValidationAttempted(false);
                    setDuplicateSourcePayload(null);
                    setAddItemOpen(true);
                  } else if (taskType === "stt") {
                    setDuplicateSttRows(null);
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
              {(() => {
                // LLM bulk upload references evaluators by name in the
                // CSV; without any linked evaluators the validator will
                // reject every row. Disable the button instead.
                const llmNoEvaluators =
                  taskType === "llm" && (task?.evaluators?.length ?? 0) === 0;
                const buttonEl = (
                  <button
                    onClick={() => {
                      if (llmNoEvaluators) return;
                      if (taskType === "stt") {
                        setBulkUploadSttOpen(true);
                      } else if (taskType === "conversation") {
                        setBulkUploadConversationOpen(true);
                      } else if (taskType === "llm") {
                        setBulkUploadLlmOpen(true);
                      } else {
                        toast.info(
                          "CSV upload isn't supported yet — coming soon.",
                        );
                      }
                    }}
                    disabled={llmNoEvaluators}
                    className={`h-9 px-3 rounded-md text-sm font-medium bg-foreground text-background flex items-center gap-1.5 transition-opacity ${
                      llmNoEvaluators
                        ? "opacity-50 cursor-not-allowed"
                        : "hover:opacity-90 cursor-pointer"
                    }`}
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
                    Bulk upload
                  </button>
                );
                return llmNoEvaluators ? (
                  <Tooltip content="Link at least one evaluator to this task before bulk uploading">
                    {buttonEl}
                  </Tooltip>
                ) : (
                  buttonEl
                );
              })()}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div className="border-b border-border flex items-center gap-1">
          {[
            { id: "overview" as Tab, label: "Overview" },
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

        {activeTab === "overview" && (
          <div className="space-y-4 md:space-y-6">
            {agreementError && (
              <div className="rounded-md border border-border bg-muted/20 p-4 text-sm text-red-500">
                {agreementError}
              </div>
            )}

            {loading ||
            !taskFetchCompleted ||
            agreementLoading ||
            !agreementFetchCompleted ||
            summaryLoading ||
            !summaryFetchCompleted ||
            runsLoading ||
            !runsFetchCompleted ? (
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
                Loading
              </div>
            ) : !agreement ||
              ((agreement.human_human?.pair_count ?? 0) === 0 &&
                (agreement.evaluators ?? []).every(
                  (e) => (e.pair_count ?? 0) === 0,
                )) ? (
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
                      d="M3 13.125C3 12.504 3.504 12 4.125 12h2.25c.621 0 1.125.504 1.125 1.125v6.75C7.5 20.496 6.996 21 6.375 21h-2.25A1.125 1.125 0 013 19.875v-6.75zM9.75 8.625c0-.621.504-1.125 1.125-1.125h2.25c.621 0 1.125.504 1.125 1.125v11.25c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V8.625zM16.5 4.125c0-.621.504-1.125 1.125-1.125h2.25C20.496 3 21 3.504 21 4.125v15.75c0 .621-.504 1.125-1.125 1.125h-2.25a1.125 1.125 0 01-1.125-1.125V4.125z"
                    />
                  </svg>
                }
                title="No agreement data yet"
                description={
                  <>
                    Agreement between annotators and evaluators will appear here
                    once annotators
                    <br />
                    start labelling and evaluators are run on the task items
                  </>
                }
              />
            ) : (
              <div className="space-y-2">
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold">Agreement summary</h2>
                    <RefreshButton
                      loading={agreementLoading}
                      onClick={() => fetchAgreement()}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground max-w-2xl mt-1">
                    These cards show agreement between annotators and how
                    closely each evaluator aligns with humans
                  </p>
                </div>
                <div className="flex flex-wrap items-stretch gap-3">
                  <AgreementStatCard
                    staticPillText="Annotator agreement"
                    value={
                      agreement.human_human?.current != null
                        ? `${Math.round(agreement.human_human.current * 100)}%`
                        : "—"
                    }
                    valueClassName={agreementColor(
                      agreement.human_human?.current,
                    )}
                  />
                  {(agreement.evaluators ?? []).map((ev) => (
                    <AgreementStatCard
                      key={ev.evaluator_id}
                      evaluatorPill={{
                        href: `/evaluators/${ev.evaluator_id}`,
                        name: ev.name,
                      }}
                      value={
                        ev.current != null
                          ? `${Math.round(ev.current * 100)}%`
                          : "—"
                      }
                      valueClassName={agreementColor(ev.current)}
                    />
                  ))}
                </div>
              </div>
            )}

          </div>
        )}

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
          ) : taskSummaryError ? (
            // The task fetch succeeded but the summary fetch (which
            // drives the items list) failed — surface the error and a
            // retry button instead of silently rendering an empty page.
            <div className="rounded-md border border-border bg-muted/20 p-4 text-sm flex flex-wrap items-center justify-between gap-3">
              <span className="text-red-500">{taskSummaryError}</span>
              <button
                type="button"
                onClick={() => fetchTaskSummary()}
                disabled={summaryLoading}
                className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {summaryLoading ? (
                  <svg
                    className="w-3.5 h-3.5 animate-spin"
                    viewBox="0 0 24 24"
                    fill="none"
                    aria-hidden="true"
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
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4 4v6h6M20 20v-6h-6M5.5 9A7 7 0 0119 13M18.5 15A7 7 0 015 11"
                    />
                  </svg>
                )}
                Retry
              </button>
            </div>
          ) : !hasAnyItems ? (
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
            <div ref={itemsSectionTopRef} className="space-y-3 scroll-mt-4">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="relative flex-1 min-w-[200px] max-w-sm">
                  <svg
                    className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 21l-4.35-4.35M10.5 18a7.5 7.5 0 100-15 7.5 7.5 0 000 15z"
                    />
                  </svg>
                  <input
                    type="search"
                    value={itemsSearchInput}
                    onChange={(e) => setItemsSearchInput(e.target.value)}
                    placeholder="Search by name"
                    aria-label="Search items by name"
                    className="h-9 w-full pl-8 pr-3 rounded-md border border-border bg-background text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <RefreshButton
                    loading={loading || summaryLoading}
                    onClick={() => {
                      fetchTask();
                      fetchTaskSummary();
                    }}
                  />
                  <ExportResultsButton
                    filename={`${sanitizeCsvName(task?.name ?? "labelling-task")}-items`}
                    label="Export CSV"
                    variant="neutral"
                    disabled={!taskSummary || !accessToken}
                    getRows={async () => {
                      // Pagination is in effect on the items tab, so
                      // `items` / `taskSummary.rows` are page-sized.
                      // Pull every item in the task (ignoring the
                      // active search) before building the CSV.
                      //
                      // The backend's /summary `limit` is already very
                      // generous (1M) so almost every task drains in a
                      // single request — but we still loop with a
                      // configurable batch size so a hypothetical task
                      // past that ceiling can still be exported in
                      // full.
                      if (!accessToken || !uuid) {
                        return { columns: [], rows: [] };
                      }
                      const total =
                        task?.item_count ??
                        taskSummary?.pagination?.total ??
                        items.length;
                      if (total === 0) return { columns: [], rows: [] };
                      const seen = new Set<string>();
                      const allItems: LabellingItem[] = [];
                      const allRows: SummaryRow[] = [];
                      let lastSummary: TaskSummaryResponse | null = null;
                      let offset = 0;
                      // Cap iterations defensively in case
                      // pagination.total ever disagrees with how many
                      // items the API actually returns.
                      const maxIterations = Math.max(
                        1,
                        Math.ceil(total / ITEMS_EXPORT_BATCH_SIZE) + 1,
                      );
                      for (let i = 0; i < maxIterations; i++) {
                        const params = new URLSearchParams({
                          limit: String(ITEMS_EXPORT_BATCH_SIZE),
                          offset: String(offset),
                          sort_by: "updated_at",
                          order: itemsSort,
                        });
                        const batch = await apiClient<TaskSummaryResponse>(
                          `/annotation-tasks/${uuid}/summary?${params.toString()}`,
                          accessToken,
                        );
                        lastSummary = batch;
                        for (const row of batch.rows ?? []) {
                          allRows.push(row);
                          if (seen.has(row.item_id)) continue;
                          seen.add(row.item_id);
                          const meta = itemMetaByUuid.get(row.item_id);
                          allItems.push(
                            meta
                              ? { ...meta, payload: row.payload ?? meta.payload }
                              : {
                                  id: 0,
                                  uuid: row.item_id,
                                  task_id: batch.task_id,
                                  payload: row.payload,
                                  created_at: "",
                                  updated_at: undefined,
                                  deleted_at: null,
                                },
                          );
                        }
                        const batchTotal = batch.pagination?.total;
                        // Stop when we've covered the backend-reported
                        // total, or when the response held fewer rows
                        // than the requested batch (e.g. older /
                        // unpaginated server, or task shrank mid-loop).
                        if (batchTotal != null) {
                          if (seen.size >= batchTotal) break;
                        } else if (
                          (batch.rows?.length ?? 0) < ITEMS_EXPORT_BATCH_SIZE
                        ) {
                          break;
                        }
                        offset += ITEMS_EXPORT_BATCH_SIZE;
                      }
                      if (!lastSummary) {
                        return { columns: [], rows: [] };
                      }
                      // buildItemsCsv reads from taskSummary.rows /
                      // .evaluators / .annotators — splice the unioned
                      // rows back in so per-item annotations from every
                      // batch reach the CSV.
                      const fullSummary: TaskSummaryResponse = {
                        ...lastSummary,
                        rows: allRows,
                      };
                      return buildItemsCsv(allItems, fullSummary, taskType);
                    }}
                  />
                </div>
              </div>
              {/* Bulk-action toolbar (shown when at least one row is selected,
                  or when "select all across pages" is active). */}
              {(selectedItemIds.size > 0 || selectAllTotal) && (
                <div
                  className={`flex items-center justify-between gap-3 rounded-md border px-3 py-2 transition-colors ${
                    selectAllTotal
                      ? "border-amber-500/50 bg-amber-500/10"
                      : "border-border bg-muted/30"
                  }`}
                >
                  <div
                    className={`flex items-center gap-2 text-sm ${
                      selectAllTotal
                        ? "text-amber-700 dark:text-amber-300"
                        : ""
                    }`}
                  >
                    <span>
                      <span className="font-medium">
                        {selectAllTotal ? itemsTotal : selectedItemIds.size}
                      </span>{" "}
                      item
                      {(selectAllTotal
                        ? itemsTotal
                        : selectedItemIds.size) === 1
                        ? ""
                        : "s"}{" "}
                      selected
                      {selectAllTotal && itemsSearch ? (
                        <span className="opacity-80">
                          {" "}
                          matching &ldquo;{itemsSearch}&rdquo;
                        </span>
                      ) : null}
                    </span>
                    {!selectAllTotal &&
                      allSelected &&
                      itemsTotal > items.length && (
                        <button
                          onClick={() => setSelectAllTotal(true)}
                          className="inline-flex items-center h-7 px-2.5 rounded-md text-xs font-medium border border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300 hover:bg-amber-500/20 hover:border-amber-500/60 transition-colors cursor-pointer whitespace-nowrap"
                        >
                          Select all {itemsTotal} item
                          {itemsTotal === 1 ? "" : "s"}
                          {itemsSearch ? ` matching "${itemsSearch}"` : ""}
                        </button>
                      )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        setSelectedItemIds(new Set());
                        setSelectAllTotal(false);
                      }}
                      className="h-8 px-3 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                    >
                      Clear
                    </button>
                    <button
                      onClick={() => setDeleteSelectedOpen(true)}
                      className="h-8 px-3 rounded-md text-sm font-medium border border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors cursor-pointer"
                    >
                      Delete
                    </button>
                    <button
                      onClick={() => {
                        if (selectAllTotal) {
                          handleRunEvaluators({
                            selectAll: true,
                            q: itemsSearch || undefined,
                          });
                        } else {
                          handleRunEvaluators(Array.from(selectedItemIds));
                        }
                      }}
                      disabled={startingRun}
                      className="h-8 px-3 rounded-md text-sm font-medium border border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 hover:bg-indigo-500/20 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-1.5"
                    >
                      {startingRun && (
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
                      )}
                      Evaluate selected
                    </button>
                    <button
                      onClick={() => setAssignOpen(true)}
                      className="h-8 px-3 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
                    >
                      Label selected
                    </button>
                  </div>
                </div>
              )}

              {items.length === 0 ? (
                <div className="rounded-md border border-dashed border-border bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
                  {itemsSearch
                    ? `No items match "${itemsSearch}".`
                    : "No items on this page."}
                </div>
              ) : taskType === "stt" ? (
                <div className="border border-border rounded-xl overflow-hidden">
                  <div className="grid grid-cols-[40px_minmax(0,0.6fr)_minmax(0,1fr)_minmax(0,1fr)_200px_180px_300px] gap-6 px-4 py-2 border-b border-border bg-muted/30 items-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleSelectAll}
                      aria-label="Select all"
                      className="w-5 h-5 cursor-pointer accent-foreground"
                    />
                    <div className="text-sm font-medium text-muted-foreground">
                      Name
                    </div>
                    <div className="text-sm font-medium text-muted-foreground">
                      Reference transcript
                    </div>
                    <div className="text-sm font-medium text-muted-foreground">
                      Predicted transcript
                    </div>
                    <div className="text-sm font-medium text-muted-foreground">
                      Labelled by
                    </div>
                    <button
                      type="button"
                      onClick={toggleItemsSort}
                      className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-left"
                      aria-label="Sort by updated at"
                    >
                      <span>Updated at</span>
                      <SortIndicator direction={itemsSort} />
                    </button>
                    <div className="text-sm font-medium text-muted-foreground text-center">
                      Actions
                    </div>
                  </div>
                  {items.map((item) => {
                    const p = (item.payload ?? {}) as Record<string, unknown>;
                    const name = typeof p.name === "string" ? p.name : "";
                    const ref =
                      typeof p.reference_transcript === "string"
                        ? p.reference_transcript
                        : "";
                    const pred =
                      typeof p.predicted_transcript === "string"
                        ? p.predicted_transcript
                        : "";
                    const isSelected =
                      selectAllTotal || selectedItemIds.has(item.uuid);
                    const labellerIds = labellersByItem.get(item.uuid);
                    return (
                      <Fragment key={item.uuid}>
                        <div
                          onMouseDown={(e) => {
                            // Shift+click on text triggers a browser text-selection
                            // range; suppress it so range-selecting rows stays clean.
                            if (e.shiftKey) e.preventDefault();
                          }}
                          onClick={(e) => {
                            if (e.shiftKey) {
                              e.preventDefault();
                              selectRangeTo(item.uuid);
                              return;
                            }
                            openItemDetail(item.uuid);
                          }}
                          className={`grid grid-cols-[40px_minmax(0,0.6fr)_minmax(0,1fr)_minmax(0,1fr)_200px_180px_300px] gap-6 px-4 py-3 border-b border-border last:border-b-0 transition-colors items-center cursor-pointer ${
                            isSelected ? "bg-muted/30" : "hover:bg-muted/20"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onMouseDown={(e) => {
                              pendingShiftRef.current = e.shiftKey;
                            }}
                            onChange={() => {
                              if (pendingShiftRef.current) {
                                selectRangeTo(item.uuid);
                              } else {
                                toggleItem(item.uuid);
                              }
                              pendingShiftRef.current = false;
                            }}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Select item ${item.id}`}
                            className="w-5 h-5 cursor-pointer accent-foreground"
                          />
                          <p className="text-sm text-foreground line-clamp-2">
                            {name || "—"}
                          </p>
                          <p className="text-sm text-foreground line-clamp-2">
                            {ref || "—"}
                          </p>
                          <p className="text-sm text-foreground line-clamp-2">
                            {pred || "—"}
                          </p>
                          <LabelledByCell
                            labellers={labellerIds}
                            annotatorNameById={annotatorNameById}
                          />
                          <div className="text-sm text-muted-foreground whitespace-nowrap">
                            {formatItemUpdatedAt(item)}
                          </div>
                          <ItemRowActions
                            itemUuid={item.uuid}
                            onDelete={requestDeleteOneItem}
                            onLabel={
                              selectedItemIds.size === 0 && !selectAllTotal
                                ? (uuid) => {
                                    // Sole row → skip the select-then-bulk
                                    // dance and open the assign dialog
                                    // straight on this item.
                                    if (items.length === 1) {
                                      setSelectedItemIds(new Set([uuid]));
                                      setAssignOpen(true);
                                    } else {
                                      enterBulkModeWithScroll(uuid);
                                    }
                                  }
                                : undefined
                            }
                            onEdit={(uuid) => {
                              setEditSttSingleItemUuid(uuid);
                              setEditSttItemsOpen(true);
                            }}
                            onDuplicate={(uuid) => {
                              const item = items.find((i) => i.uuid === uuid);
                              if (!item) return;
                              const p = (item.payload ?? {}) as Record<
                                string,
                                unknown
                              >;
                              const nm =
                                typeof p.name === "string"
                                  ? (p.name as string)
                                  : `Item ${item.id}`;
                              setDuplicateSttRows([
                                {
                                  uuid: item.uuid,
                                  name: `Copy of ${nm}`,
                                  actual:
                                    typeof p.reference_transcript === "string"
                                      ? (p.reference_transcript as string)
                                      : "",
                                  predicted:
                                    typeof p.predicted_transcript === "string"
                                      ? (p.predicted_transcript as string)
                                      : "",
                                },
                              ]);
                              setAddSttItemsOpen(true);
                            }}
                            onEvaluate={
                              selectedItemIds.size === 0 && !selectAllTotal
                                ? (uuid) => {
                                    if (items.length === 1) {
                                      setSelectedItemIds(new Set([uuid]));
                                      handleRunEvaluators([uuid]);
                                    } else {
                                      enterBulkModeWithScroll(uuid);
                                    }
                                  }
                                : undefined
                            }
                          />
                        </div>
                      </Fragment>
                    );
                  })}
                </div>
              ) : (
                <div className="border border-border rounded-xl overflow-hidden">
                  <div className="grid grid-cols-[40px_minmax(0,1fr)_minmax(0,1.2fr)_200px_180px_300px] gap-6 px-4 py-2 border-b border-border bg-muted/30 items-center">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleSelectAll}
                      aria-label="Select all"
                      className="w-5 h-5 cursor-pointer accent-foreground"
                    />
                    <div className="text-sm font-medium text-muted-foreground">
                      Name
                    </div>
                    <div className="text-sm font-medium text-muted-foreground">
                      Description
                    </div>
                    <div className="text-sm font-medium text-muted-foreground">
                      Labelled by
                    </div>
                    <button
                      type="button"
                      onClick={toggleItemsSort}
                      className="flex items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer text-left"
                      aria-label="Sort by updated at"
                    >
                      <span>Updated at</span>
                      <SortIndicator direction={itemsSort} />
                    </button>
                    <div className="text-sm font-medium text-muted-foreground text-center">
                      Actions
                    </div>
                  </div>
                  {items.map((item) => {
                    const isSelected =
                      selectAllTotal || selectedItemIds.has(item.uuid);
                    const labellerIds = labellersByItem.get(item.uuid);
                    const itemPayloadObj =
                      item.payload && typeof item.payload === "object"
                        ? (item.payload as Record<string, unknown>)
                        : null;
                    const itemDescription =
                      itemPayloadObj &&
                      typeof itemPayloadObj.description === "string"
                        ? (itemPayloadObj.description as string)
                        : "";
                    return (
                      <Fragment key={item.uuid}>
                        <div
                          onMouseDown={(e) => {
                            // Shift+click on text triggers a browser text-selection
                            // range; suppress it so range-selecting rows stays clean.
                            if (e.shiftKey) e.preventDefault();
                          }}
                          onClick={(e) => {
                            if (e.shiftKey) {
                              e.preventDefault();
                              selectRangeTo(item.uuid);
                              return;
                            }
                            openItemDetail(item.uuid);
                          }}
                          className={`grid grid-cols-[40px_minmax(0,1fr)_minmax(0,1.2fr)_200px_180px_300px] gap-6 px-4 py-3 border-b border-border last:border-b-0 transition-colors items-center cursor-pointer ${
                            isSelected ? "bg-muted/30" : "hover:bg-muted/20"
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isSelected}
                            onMouseDown={(e) => {
                              pendingShiftRef.current = e.shiftKey;
                            }}
                            onChange={() => {
                              if (pendingShiftRef.current) {
                                selectRangeTo(item.uuid);
                              } else {
                                toggleItem(item.uuid);
                              }
                              pendingShiftRef.current = false;
                            }}
                            onClick={(e) => e.stopPropagation()}
                            aria-label={`Select item ${item.id}`}
                            className="w-5 h-5 cursor-pointer accent-foreground"
                          />
                          <p className="text-sm text-foreground line-clamp-1">
                            {previewItemPayload(item.payload, taskType)}
                          </p>
                          <p
                            className="text-sm text-muted-foreground line-clamp-2"
                            title={itemDescription || undefined}
                          >
                            {itemDescription || (
                              <span className="text-muted-foreground/60">
                                —
                              </span>
                            )}
                          </p>
                          <LabelledByCell
                            labellers={labellerIds}
                            annotatorNameById={annotatorNameById}
                          />
                          <div className="text-sm text-muted-foreground whitespace-nowrap">
                            {formatItemUpdatedAt(item)}
                          </div>
                          <ItemRowActions
                            itemUuid={item.uuid}
                            onDelete={requestDeleteOneItem}
                            onLabel={
                              selectedItemIds.size === 0 && !selectAllTotal
                                ? (uuid) => {
                                    // Sole row → skip the select-then-bulk
                                    // dance and open the assign dialog
                                    // straight on this item.
                                    if (items.length === 1) {
                                      setSelectedItemIds(new Set([uuid]));
                                      setAssignOpen(true);
                                    } else {
                                      enterBulkModeWithScroll(uuid);
                                    }
                                  }
                                : undefined
                            }
                            onEdit={(uuid) => setEditLlmItemUuid(uuid)}
                            onDuplicate={(uuid) => {
                              const item = items.find((i) => i.uuid === uuid);
                              if (!item) return;
                              const p = (item.payload ?? null) as Record<
                                string,
                                unknown
                              > | null;
                              const name =
                                typeof p?.name === "string"
                                  ? (p.name as string)
                                  : `Item ${item.id}`;
                              const desc =
                                typeof p?.description === "string"
                                  ? (p.description as string)
                                  : "";
                              setNewItemName(`Copy of ${name}`);
                              setNewItemDescription(desc);
                              setDuplicateSourcePayload(p);
                              setCreateItemError(null);
                              setValidationAttempted(false);
                              setAddItemOpen(true);
                            }}
                            onEvaluate={
                              selectedItemIds.size === 0 && !selectAllTotal
                                ? (uuid) => {
                                    if (items.length === 1) {
                                      setSelectedItemIds(new Set([uuid]));
                                      handleRunEvaluators([uuid]);
                                    } else {
                                      enterBulkModeWithScroll(uuid);
                                    }
                                  }
                                : undefined
                            }
                          />
                        </div>
                      </Fragment>
                    );
                  })}
                </div>
              )}
              {/* Bottom padding clears the fixed Talk-to-us FAB
                  (bottom-6 right-6) so the prev/next controls stay
                  visible when the user scrolls to the bottom. */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1 pb-20 text-sm text-muted-foreground">
                {showItemsPagination && (
                  <>
                <div>
                  {itemsTotal === 0 ? (
                    "0 items"
                  ) : (
                    <>
                      Showing{" "}
                      <span className="text-foreground font-medium">
                        {itemsRangeStart}
                      </span>
                      –
                      <span className="text-foreground font-medium">
                        {itemsRangeEnd}
                      </span>{" "}
                      of{" "}
                      <span className="text-foreground font-medium">
                        {itemsTotal}
                      </span>{" "}
                      item{itemsTotal === 1 ? "" : "s"}
                    </>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2">
                    <span>Per page</span>
                    <div className="relative">
                      <select
                        value={itemsLimit}
                        onChange={(e) => {
                          const next = Number(e.target.value);
                          if (typeof window !== "undefined") {
                            window.localStorage.setItem(
                              ITEMS_PAGE_SIZE_KEY,
                              String(next),
                            );
                          }
                          setItemsLimit(next);
                          setItemsOffset(0);
                        }}
                        className="h-8 pl-3 pr-8 appearance-none rounded-md border border-border bg-background text-sm cursor-pointer focus:outline-none focus:ring-2 focus:ring-ring"
                      >
                        {ITEMS_PAGE_SIZE_OPTIONS.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                      <svg
                        className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={2}
                        aria-hidden="true"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19 9l-7 7-7-7"
                        />
                      </svg>
                    </div>
                  </label>
                  {itemsPageCount > 1 && (
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() =>
                        setItemsOffset((prev) =>
                          Math.max(0, prev - itemsLimit),
                        )
                      }
                      disabled={itemsOffset === 0 || summaryLoading}
                      aria-label="Previous page"
                      className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border bg-background hover:bg-muted transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
                    <span className="px-2 text-sm">
                      Page{" "}
                      <span className="text-foreground font-medium">
                        {itemsCurrentPage}
                      </span>{" "}
                      of{" "}
                      <span className="text-foreground font-medium">
                        {itemsPageCount}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setItemsOffset((prev) => prev + itemsLimit)
                      }
                      disabled={
                        itemsOffset + itemsLimit >= itemsTotal ||
                        summaryLoading
                      }
                      aria-label="Next page"
                      className="h-8 w-8 inline-flex items-center justify-center rounded-md border border-border bg-background hover:bg-muted transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
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
                  </div>
                  )}
                </div>
                  </>
                )}
              </div>
            </div>
          ))}

        {activeTab === "jobs" &&
          (loading || !taskFetchCompleted ? (
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
              Loading jobs
            </div>
          ) : jobs.length === 0 ? (
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
            <div className="space-y-3">
              {selectedJobUuids.size > 0 && (
                <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-muted/30 px-3 py-2">
                  <span className="text-sm">
                    <span className="font-medium">{selectedJobUuids.size}</span>{" "}
                    job{selectedJobUuids.size === 1 ? "" : "s"} selected
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setSelectedJobUuids(new Set())}
                      className="h-8 px-3 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                    >
                      Clear
                    </button>
                    <button
                      onClick={() => setDeleteJobsOpen(true)}
                      className="h-8 px-3 rounded-md text-sm font-medium border border-red-500/30 bg-red-500/10 text-red-500 hover:bg-red-500/20 transition-colors cursor-pointer"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              )}
              <JobsList
                jobs={jobs}
                selectedJobUuids={selectedJobUuids}
                onToggleJob={toggleJob}
                onToggleSelectAll={toggleSelectAllJobs}
                allSelected={allJobsSelected}
                someSelected={someJobsSelected}
                onRequestDelete={(jobUuid) => setDeletingJobUuid(jobUuid)}
              />
            </div>
          ))}

        {activeTab === "runs" && (
          <EvaluatorRunsList
            runs={runs}
            evaluators={runsListEvaluators}
            loading={runsLoading || !runsFetchCompleted}
            error={runsError}
            onRequestDelete={(runUuid) => setDeletingRunUuid(runUuid)}
            onOpen={(runUuid) =>
              router.push(
                `/human-alignment/tasks/${uuid}/evaluator-runs/${runUuid}`,
              )
            }
          />
        )}
      </div>

      {accessToken && (
        <RunEvaluatorsDialog
          isOpen={runDialogOpen}
          accessToken={accessToken}
          taskUuid={uuid}
          evaluators={(task?.evaluators ?? []).map((e) => ({
            uuid: e.uuid,
            name: e.name,
          }))}
          submitting={startingRun}
          submitError={runDialogSubmitError}
          onClose={() => {
            if (!startingRun) {
              setRunDialogOpen(false);
              setRunDialogSubmitError(null);
            }
          }}
          onConfirm={submitRunEvaluators}
        />
      )}

      {addItemOpen && (
        <AddTestDialog
          isOpen={addItemOpen}
          onClose={() => {
            if (!creatingItem) {
              setAddItemOpen(false);
              setDuplicateSourcePayload(null);
            }
          }}
          isEditing={false}
          isLoading={false}
          isCreating={creatingItem}
          createError={createItemError}
          testName={newItemName}
          setTestName={setNewItemName}
          itemDescription={newItemDescription}
          setItemDescription={setNewItemDescription}
          validationAttempted={validationAttempted}
          mode="labelItem"
          allowAgentLastMessage={taskType === "conversation"}
          requireAssistantLastMessage={taskType === "llm"}
          initialConfig={addItemInitialConfig}
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
                evaluator_variables[e.evaluator_uuid] = {
                  ...e.variable_values,
                };
              }
            }

            const trimmedDescription = newItemDescription.trim();
            const descriptionField = trimmedDescription
              ? { description: trimmedDescription }
              : {};

            let payload: Record<string, unknown>;
            if (taskType === "conversation") {
              payload = {
                name: newItemName.trim(),
                ...descriptionField,
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
                !(
                  Array.isArray(last.tool_calls) && last.tool_calls.length > 0
                ) &&
                typeof last.content === "string"
              ) {
                chat_history = history.slice(0, -1);
                agent_response = last.content;
              }
              payload = {
                name: newItemName.trim(),
                ...descriptionField,
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
              setDuplicateSourcePayload(null);
              handleTabChange("items");
              await Promise.all([fetchTask(), fetchTaskSummary()]);
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
          itemDescription={editLlmItemDescription}
          setItemDescription={setEditLlmItemDescription}
          validationAttempted={false}
          mode="labelItem"
          allowAgentLastMessage={taskType === "conversation"}
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
                evaluator_variables[e.evaluator_uuid] = {
                  ...e.variable_values,
                };
              }
            }
            const trimmedDescription = editLlmItemDescription.trim();
            const descriptionField = { description: trimmedDescription };

            let payload: Record<string, unknown>;
            if (taskType === "conversation") {
              payload = {
                name: editLlmItemName.trim(),
                ...descriptionField,
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
                !(
                  Array.isArray(last.tool_calls) && last.tool_calls.length > 0
                ) &&
                typeof last.content === "string"
              ) {
                chat_history = history.slice(0, -1);
                agent_response = last.content;
              }
              payload = {
                name: editLlmItemName.trim(),
                ...descriptionField,
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
              await Promise.all([fetchTask(), fetchTaskSummary()]);
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

      {accessToken && (
        <BulkUploadSttItemsDialog
          isOpen={bulkUploadSttOpen}
          accessToken={accessToken}
          taskUuid={uuid}
          linkedEvaluators={(task?.evaluators ?? []).map((e) => ({
            uuid: e.uuid,
            name: e.name,
            output_type: e.output_type ?? null,
            scale_min: typeof e.scale_min === "number" ? e.scale_min : null,
            scale_max: typeof e.scale_max === "number" ? e.scale_max : null,
          }))}
          onClose={() => setBulkUploadSttOpen(false)}
          onSuccess={async (count) => {
            setBulkUploadSttOpen(false);
            handleTabChange("items");
            await Promise.all([fetchTask(), fetchTaskSummary()]);
            toast.success(`Added ${count} ${count === 1 ? "item" : "items"}`);
          }}
        />
      )}

      {accessToken && (
        <BulkUploadConversationItemsDialog
          isOpen={bulkUploadConversationOpen}
          accessToken={accessToken}
          taskUuid={uuid}
          linkedEvaluators={(task?.evaluators ?? []).map((e) => ({
            uuid: e.uuid,
            name: e.name,
            output_type: e.output_type ?? null,
            scale_min: typeof e.scale_min === "number" ? e.scale_min : null,
            scale_max: typeof e.scale_max === "number" ? e.scale_max : null,
          }))}
          onClose={() => setBulkUploadConversationOpen(false)}
          onSuccess={async (count) => {
            setBulkUploadConversationOpen(false);
            handleTabChange("items");
            await Promise.all([fetchTask(), fetchTaskSummary()]);
            toast.success(`Added ${count} ${count === 1 ? "item" : "items"}`);
          }}
        />
      )}

      {accessToken && (
        <BulkUploadLlmItemsDialog
          isOpen={bulkUploadLlmOpen}
          accessToken={accessToken}
          taskUuid={uuid}
          linkedEvaluators={(task?.evaluators ?? []).map((e) => ({
            uuid: e.uuid,
            name: e.name,
            slug: e.slug ?? null,
            variables: e.variables ?? [],
            output_type: e.output_type ?? null,
            scale_min: typeof e.scale_min === "number" ? e.scale_min : null,
            scale_max: typeof e.scale_max === "number" ? e.scale_max : null,
          }))}
          onClose={() => setBulkUploadLlmOpen(false)}
          onSuccess={async (count) => {
            setBulkUploadLlmOpen(false);
            handleTabChange("items");
            await Promise.all([fetchTask(), fetchTaskSummary()]);
            toast.success(`Added ${count} ${count === 1 ? "item" : "items"}`);
          }}
        />
      )}

      <AddSttItemsDialog
        isOpen={addSttItemsOpen}
        initialRows={duplicateSttRows ?? undefined}
        onClose={() => {
          setAddSttItemsOpen(false);
          setDuplicateSttRows(null);
        }}
        onSubmit={async (rows) => {
          if (!accessToken) return;
          await apiClient(`/annotation-tasks/${uuid}/items`, accessToken, {
            method: "POST",
            body: {
              items: rows.map((r) => ({
                payload: {
                  ...(r.name ? { name: r.name } : {}),
                  reference_transcript: r.actual_transcript,
                  predicted_transcript: r.predicted_transcript,
                },
              })),
            },
          });
          handleTabChange("items");
          await Promise.all([fetchTask(), fetchTaskSummary()]);
          setAddSttItemsOpen(false);
          setDuplicateSttRows(null);
        }}
      />

      <AddSttItemsDialog
        isOpen={editSttItemsOpen}
        mode="edit"
        initialRows={items
          .filter((it) =>
            editSttSingleItemUuid
              ? it.uuid === editSttSingleItemUuid
              : selectedItemIds.has(it.uuid),
          )
          .map((it) => {
            const p = (it.payload ?? {}) as Record<string, unknown>;
            return {
              uuid: it.uuid,
              name: typeof p.name === "string" ? p.name : "",
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
        onClose={() => {
          setEditSttItemsOpen(false);
          setEditSttSingleItemUuid(null);
        }}
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
                      ...(r.name ? { name: r.name } : {}),
                      reference_transcript: r.actual_transcript,
                      predicted_transcript: r.predicted_transcript,
                    },
                  })),
              },
            },
          );
          await Promise.all([fetchTask(), fetchTaskSummary()]);
          setEditSttItemsOpen(false);
          setEditSttSingleItemUuid(null);
          setSelectedItemIds(new Set());
          setSelectAllTotal(false);
        }}
      />

      {accessToken && (
        <AssignAnnotatorsDialog
          isOpen={assignOpen}
          accessToken={accessToken}
          selectedItemCount={
            selectAllTotal ? itemsTotal : selectedItemIds.size
          }
          onClose={() => setAssignOpen(false)}
          onConfirm={handleAssignAnnotators}
        />
      )}

      <JobsCreatedDialog
        isOpen={jobsCreatedOpen}
        jobs={createdJobs}
        onClose={() => setJobsCreatedOpen(false)}
      />

      <DeleteConfirmationDialog
        isOpen={deleteSelectedOpen}
        onClose={() => {
          if (!deletingSelected) setDeleteSelectedOpen(false);
        }}
        onConfirm={handleDeleteSelected}
        title="Delete items"
        message={(() => {
          const count = selectAllTotal ? itemsTotal : selectedItemIds.size;
          const itemWord = count === 1 ? "item" : "items";
          const annotationsClause =
            count === 1
              ? "Any annotations on this item will also be lost."
              : "Any annotations on these items will also be lost.";
          const scopeClause =
            selectAllTotal && itemsSearch
              ? ` matching "${itemsSearch}"`
              : "";
          return `Delete ${count} ${itemWord}${scopeClause}? ${annotationsClause} This cannot be undone.`;
        })()}
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
        isOpen={deleteJobsOpen}
        onClose={() => {
          if (!deletingJobs) setDeleteJobsOpen(false);
        }}
        onConfirm={handleDeleteSelectedJobs}
        title="Delete labelling jobs"
        message={`Delete ${selectedJobUuids.size} labelling job${selectedJobUuids.size === 1 ? "" : "s"}? All annotations made in ${selectedJobUuids.size === 1 ? "this job" : "these jobs"} will be lost. This cannot be undone.`}
        confirmText="Delete"
        isDeleting={deletingJobs}
      />

      <DeleteConfirmationDialog
        isOpen={!!deletingJobUuid}
        onClose={() => {
          if (!deletingJobInFlight) setDeletingJobUuid(null);
        }}
        onConfirm={confirmDeleteOneJob}
        title="Delete labelling job"
        message="Delete this labelling job? All annotations made in this job will be lost. This cannot be undone."
        confirmText="Delete"
        isDeleting={deletingJobInFlight}
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

      <ItemDetailDialog
        isOpen={!!itemDetailUuid}
        onClose={() => setItemDetailUuid(null)}
        task={
          task &&
          (task.type === "llm" ||
            task.type === "stt" ||
            task.type === "conversation")
            ? {
                uuid: task.uuid,
                name: task.name,
                type: task.type,
                evaluators: task.evaluators,
              }
            : null
        }
        item={(() => {
          if (!itemDetailUuid) return null;
          const match = items.find((i) => i.uuid === itemDetailUuid);
          if (!match) return null;
          return {
            id: match.id,
            uuid: match.uuid,
            task_id: match.task_id,
            payload: match.payload,
            created_at: match.created_at,
            deleted_at: match.deleted_at,
          };
        })()}
        accessToken={accessToken}
        hasPrev={(() => {
          if (!itemDetailUuid) return false;
          const idx = items.findIndex((i) => i.uuid === itemDetailUuid);
          return idx > 0;
        })()}
        hasNext={(() => {
          if (!itemDetailUuid) return false;
          const idx = items.findIndex((i) => i.uuid === itemDetailUuid);
          return idx >= 0 && idx < items.length - 1;
        })()}
        onPrev={() => {
          if (!itemDetailUuid) return;
          const idx = items.findIndex((i) => i.uuid === itemDetailUuid);
          if (idx > 0) setItemDetailUuid(items[idx - 1].uuid);
        }}
        onNext={() => {
          if (!itemDetailUuid) return;
          const idx = items.findIndex((i) => i.uuid === itemDetailUuid);
          if (idx >= 0 && idx < items.length - 1)
            setItemDetailUuid(items[idx + 1].uuid);
        }}
        position={(() => {
          if (!itemDetailUuid) return undefined;
          const idx = items.findIndex((i) => i.uuid === itemDetailUuid);
          if (idx < 0) return undefined;
          return { index: idx, total: items.length };
        })()}
      />
    </AppLayout>
  );
}
