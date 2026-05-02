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
import { BulkUploadSttItemsDialog } from "@/components/human-labelling/BulkUploadSttItemsDialog";
import { BulkUploadSimulationItemsDialog } from "@/components/human-labelling/BulkUploadSimulationItemsDialog";
import { BulkUploadLlmItemsDialog } from "@/components/human-labelling/BulkUploadLlmItemsDialog";
import { AssignAnnotatorsDialog } from "@/components/human-labelling/AssignAnnotatorsDialog";
import { EditTaskDialog } from "@/components/human-labelling/EditTaskDialog";
import {
  JobsCreatedDialog,
  type CreatedJob,
} from "@/components/human-labelling/JobsCreatedDialog";
import { ManageEvaluatorsDialog } from "@/components/human-labelling/ManageEvaluatorsDialog";
import { RunEvaluatorsDialog } from "@/components/human-labelling/RunEvaluatorsDialog";
import { EmptyState } from "@/components/ui/LoadingState";
import {
  MultiSelectPicker,
  type PickerItem,
} from "@/components/MultiSelectPicker";
import { useAccessToken } from "@/hooks";
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
type SummaryAnnotator = { uuid: string; name: string };
type SummaryEvaluator = {
  evaluator_id: string;
  name: string;
  output_type: "binary" | "rating";
};
type SummaryAnnotation = {
  value: boolean | number | null;
  reasoning?: string | null;
};
type SummaryRow = {
  item_id: string;
  payload: Record<string, unknown> | null;
  evaluator_id: string;
  evaluator_name: string;
  output_type: "binary" | "rating";
  evaluator_version_id?: string | null;
  evaluator_version_number?: number | null;
  evaluator_value: boolean | number | null;
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
  task_type: "stt" | "llm" | "simulation";
  evaluators: SummaryEvaluator[];
  annotators: SummaryAnnotator[];
  rows: SummaryRow[];
};

// A summary row is "empty" when no value column has anything to show:
// no evaluator value, no agreement scores, and no annotator label.
function summaryRowHasAnyValue(r: SummaryRow): boolean {
  if (r.evaluator_value !== null) return true;
  if (r.human_agreement !== null) return true;
  if (r.evaluator_agreement !== null) return true;
  for (const v of Object.values(r.annotations ?? {})) {
    if (v && v.value !== null && v.value !== undefined) return true;
  }
  return false;
}

function formatVerdictValue(v: boolean | number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "boolean") return v ? "Correct" : "Wrong";
  if (typeof v === "number") return String(v);
  return "—";
}

function verdictTextClass(v: boolean | number | null | undefined): string {
  if (v === null || v === undefined) return "text-muted-foreground";
  if (v === true) return "text-green-600 dark:text-green-400";
  if (v === false) return "text-red-600 dark:text-red-400";
  return "text-foreground";
}

function agreementColor(v: number | null | undefined): string {
  if (v == null) return "text-muted-foreground";
  const pct = v * 100;
  if (pct >= 75) return "text-green-600 dark:text-green-400";
  if (pct <= 50) return "text-red-600 dark:text-red-400";
  return "text-yellow-600 dark:text-yellow-400";
}

const agreementStatPillBase =
  "inline-flex items-center max-w-full min-w-0 px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-muted/40 text-foreground";

function AgreementStatCard(
  props:
    | {
        staticPillText: string;
        value: string;
        valueClassName?: string;
      }
    | {
        evaluatorPill: { href: string; name: string };
        value: string;
        valueClassName?: string;
      },
) {
  const { value, valueClassName = "" } = props;
  return (
    <div className="border border-border rounded-lg px-4 py-3 bg-background min-w-[160px]">
      {"staticPillText" in props ? (
        <span
          className={`${agreementStatPillBase} cursor-default`}
          title={props.staticPillText}
        >
          <span className="truncate">{props.staticPillText}</span>
        </span>
      ) : (
        <div className="flex items-center gap-2 min-w-0 flex-wrap">
          <Link
            href={props.evaluatorPill.href}
            className={`${agreementStatPillBase} hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer`}
            title={`Open ${props.evaluatorPill.name}`}
          >
            <span className="truncate">{props.evaluatorPill.name}</span>
          </Link>
          <span className="text-sm font-medium text-foreground shrink-0">
            alignment
          </span>
        </div>
      )}
      <div
        className={`text-2xl font-semibold tabular-nums mt-2 ${valueClassName}`}
      >
        {value}
      </div>
    </div>
  );
}

const TABS: Tab[] = ["overview", "items", "jobs", "runs"];

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
  completed_item_count: number;
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
            const label = versionLabelFor(
              e.evaluator_id,
              e.evaluator_version_id,
            );
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
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-background text-foreground"
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
  onViewResults,
  onLabel,
  onEvaluate,
  isResultsOpen,
  viewResultsDisabled,
  viewResultsDisabledTooltip,
}: {
  itemUuid: string;
  onDelete: (uuid: string) => void | Promise<void>;
  onViewResults: (uuid: string) => void;
  onLabel?: (uuid: string) => void;
  onEvaluate?: (uuid: string) => void;
  isResultsOpen?: boolean;
  viewResultsDisabled?: boolean;
  viewResultsDisabledTooltip?: string;
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
      {/* View / Hide results (toggle) */}
      {viewResultsDisabled ? (
        <Tooltip
          content={
            viewResultsDisabledTooltip ??
            "Results can be seen once annotators label the data or evaluator is run for this item"
          }
        >
          <button
            type="button"
            disabled
            aria-label="View results"
            className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-sm font-semibold border border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 transition-colors disabled:opacity-50 cursor-not-allowed"
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
        </Tooltip>
      ) : (
        <button
          type="button"
          onClick={() => onViewResults(itemUuid)}
          aria-label={isResultsOpen ? "Hide results" : "View results"}
          className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md text-sm font-semibold border border-fuchsia-500/40 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400 hover:bg-fuchsia-500/20 hover:border-fuchsia-500/60 transition-colors cursor-pointer"
        >
          <svg
            className="w-4 h-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.8}
          >
            {isResultsOpen ? (
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88"
              />
            ) : (
              <>
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
              </>
            )}
          </svg>
          {isResultsOpen ? "Hide results" : "View results"}
        </button>
      )}
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
              {job.completed_item_count} / {job.item_count}
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
        `/human-labelling/tasks/${uuid}?tab=${tab}`,
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

  useEffect(() => {
    if (autoTabSwitchedRef.current) return;
    if (!task) return;
    autoTabSwitchedRef.current = true;
    if (isTab(initialTab)) return; // user pinned a tab via URL
    if ((task.items?.length ?? 0) === 0) {
      handleTabChange("items");
    }
  }, [task, initialTab, handleTabChange]);

  // Evaluator runs.
  const [runs, setRuns] = useState<EvaluatorRunJob[]>([]);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);

  const [agreement, setAgreement] = useState<TaskAgreementResponse | null>(
    null,
  );
  const [agreementLoading, setAgreementLoading] = useState(false);
  const [agreementError, setAgreementError] = useState<string | null>(null);

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
    }
  }, [accessToken, uuid]);

  useEffect(() => {
    if (activeTab === "overview") fetchAgreement();
  }, [activeTab, fetchAgreement]);

  const [taskSummary, setTaskSummary] = useState<TaskSummaryResponse | null>(
    null,
  );
  // setter is kept; the boolean is no longer rendered (the agreement
  // spinner above stands in for both fetches), but we still flip it so
  // future code can subscribe if needed.
  const [, setTaskSummaryLoading] = useState(false);
  const [taskSummaryError, setTaskSummaryError] = useState<string | null>(null);
  const [summaryEvaluatorFilter, setSummaryEvaluatorFilter] = useState<
    PickerItem[]
  >([]);
  // sortColKey: "evaluator" for the evaluator-value column, or an annotator
  // uuid for that annotator's column. null → keep API order.
  const [summarySortColKey, setSummarySortColKey] = useState<string | null>(
    null,
  );
  const [summarySortDir, setSummarySortDir] = useState<"asc" | "desc">("desc");
  // Toggle next to the evaluator filter that constrains the summary table
  // to each evaluator's live version. Sent as ?live_only=true on the
  // /summary endpoint when checked.
  const [summaryLiveOnly, setSummaryLiveOnly] = useState(true);

  const fetchTaskSummary = useCallback(async () => {
    if (!accessToken || !uuid) return;
    setTaskSummaryLoading(true);
    setTaskSummaryError(null);
    try {
      // `live_only` only constrains the *overview* table; the items tab
      // uses the same summary to decide which rows can show results, and
      // there it should reflect every version — otherwise toggling the
      // overview filter would also disable "View results" buttons on the
      // items tab.
      const useLiveOnly = activeTab === "overview" && summaryLiveOnly;
      const qs = useLiveOnly ? "?live_only=true" : "";
      const data = await apiClient<TaskSummaryResponse>(
        `/annotation-tasks/${uuid}/summary${qs}`,
        accessToken,
      );
      setTaskSummary(data);
    } catch (err) {
      setTaskSummaryError(parseApiError(err, "Failed to load task summary"));
    } finally {
      setTaskSummaryLoading(false);
    }
  }, [accessToken, uuid, activeTab, summaryLiveOnly]);

  useEffect(() => {
    if (activeTab === "overview" || activeTab === "items") fetchTaskSummary();
  }, [activeTab, fetchTaskSummary]);

  // Set of item uuids that have at least one summary row with a value
  // worth displaying. Used to disable the per-item "View results" button
  // when there's nothing to show.
  const itemsWithResults = useMemo(() => {
    const set = new Set<string>();
    if (!taskSummary) return set;
    for (const row of taskSummary.rows) {
      if (summaryRowHasAnyValue(row)) set.add(row.item_id);
    }
    return set;
  }, [taskSummary]);
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
  // Run evaluators dialog state. itemUuids: null = all items in task,
  // []/non-empty = the specific items to run for.
  const [runDialogOpen, setRunDialogOpen] = useState(false);
  const [runDialogItemUuids, setRunDialogItemUuids] = useState<string[] | null>(
    null,
  );
  const [runDialogSubmitError, setRunDialogSubmitError] = useState<
    string | null
  >(null);

  const handleRunEvaluators = (itemUuids?: string[] | string) => {
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
    setRunDialogItemUuids(ids);
    setRunDialogSubmitError(null);
    setRunDialogOpen(true);
  };

  const submitRunEvaluators = async (
    selections: { evaluator_id: string; evaluator_version_id: string }[],
  ) => {
    if (!accessToken || !uuid || startingRun) return;
    const ids = runDialogItemUuids;
    setStartingRun(true);
    setRunDialogSubmitError(null);
    try {
      const body: Record<string, unknown> = { evaluators: selections };
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
      setRunDialogOpen(false);
      router.push(
        `/human-labelling/tasks/${uuid}/evaluator-runs/${result.job_uuid}`,
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
  // Inline expanded "results" panel below an item row. Backed by a
  // per-item GET /summary?item_id=<uuid> fetch, cached by item uuid so
  // toggling open the same row twice doesn't re-fetch.
  const [expandedResultsItemId, setExpandedResultsItemId] = useState<
    string | null
  >(null);
  const [itemSummaryByUuid, setItemSummaryByUuid] = useState<
    Record<string, TaskSummaryResponse>
  >({});
  const [itemSummaryLoadingId, setItemSummaryLoadingId] = useState<
    string | null
  >(null);
  const [itemSummaryError, setItemSummaryError] = useState<string | null>(null);

  const renderItemResultsExpansion = (itemUuid: string) => {
    const summary = itemSummaryByUuid[itemUuid];
    if (itemSummaryLoadingId === itemUuid && !summary) {
      return (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
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
          Loading results
        </div>
      );
    }
    if (itemSummaryError && !summary) {
      return <p className="text-sm text-red-500">{itemSummaryError}</p>;
    }
    const visibleRows = summary?.rows.filter(summaryRowHasAnyValue) ?? [];
    if (!summary || visibleRows.length === 0) {
      return (
        <p className="text-sm text-muted-foreground">
          No results recorded for this item yet.
        </p>
      );
    }
    const annotators = summary.annotators ?? [];
    const evalColTpl = "minmax(180px,1fr) 170px 170px 140px";
    const annotatorColTpl =
      annotators.length > 0 ? annotators.map(() => "120px").join(" ") : "";
    const gridTemplate = [evalColTpl, annotatorColTpl]
      .filter(Boolean)
      .join(" ");
    return (
      <div className="border border-border rounded-xl overflow-hidden bg-background">
        <div
          className="grid gap-4 px-4 py-2 border-b border-border bg-muted/30 items-center min-w-fit"
          style={{ gridTemplateColumns: gridTemplate }}
        >
          <div className="text-sm font-medium text-muted-foreground">
            Evaluator
          </div>
          <div className="text-sm font-medium text-muted-foreground whitespace-nowrap">
            Annotator agreement
          </div>
          <div className="text-sm font-medium text-muted-foreground whitespace-nowrap">
            Evaluator agreement
          </div>
          <div className="text-sm font-medium text-muted-foreground">
            Evaluator value
          </div>
          {annotators.map((a) => (
            <div
              key={a.uuid}
              className="text-sm font-medium text-muted-foreground truncate"
              title={a.name}
            >
              {a.name}
            </div>
          ))}
        </div>
        {visibleRows.map((row, idx) => {
          const versionLabel =
            typeof row.evaluator_version_number === "number"
              ? `v${row.evaluator_version_number}`
              : null;
          return (
            <div
              key={`${row.evaluator_id}-${row.evaluator_version_id ?? ""}-${idx}`}
              className="grid gap-4 px-4 py-3 border-b border-border last:border-b-0 items-center min-w-fit"
              style={{ gridTemplateColumns: gridTemplate }}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Link
                  href={`/evaluators/${row.evaluator_id}`}
                  title={`Open ${row.evaluator_name}`}
                  className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-muted/40 text-foreground hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer truncate max-w-full"
                >
                  <span className="truncate">{row.evaluator_name}</span>
                </Link>
                {versionLabel && (
                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-md border border-foreground/20 bg-background text-foreground flex-shrink-0">
                    {versionLabel}
                  </span>
                )}
              </div>
              <div
                className={`text-sm font-semibold tabular-nums ${agreementColor(row.human_agreement)}`}
              >
                {row.human_agreement != null
                  ? `${Math.round(row.human_agreement * 100)}%`
                  : "—"}
              </div>
              <div
                className={`text-sm font-semibold tabular-nums ${agreementColor(row.evaluator_agreement)}`}
              >
                {row.evaluator_agreement != null
                  ? `${Math.round(row.evaluator_agreement * 100)}%`
                  : "—"}
              </div>
              <div
                className={`text-sm font-medium tabular-nums ${verdictTextClass(row.evaluator_value)}`}
              >
                {formatVerdictValue(row.evaluator_value)}
              </div>
              {annotators.map((a) => {
                const v = row.annotations?.[a.uuid] ?? null;
                return (
                  <div
                    key={a.uuid}
                    className={`text-sm font-medium tabular-nums ${verdictTextClass(v?.value ?? null)}`}
                  >
                    {formatVerdictValue(v?.value ?? null)}
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
    );
  };

  const toggleItemResults = useCallback(
    async (itemUuid: string) => {
      if (expandedResultsItemId === itemUuid) {
        setExpandedResultsItemId(null);
        return;
      }
      setExpandedResultsItemId(itemUuid);
      setItemSummaryError(null);
      if (itemSummaryByUuid[itemUuid] || !accessToken || !uuid) return;
      setItemSummaryLoadingId(itemUuid);
      try {
        const data = await apiClient<TaskSummaryResponse>(
          `/annotation-tasks/${uuid}/summary?item_id=${encodeURIComponent(itemUuid)}`,
          accessToken,
        );
        setItemSummaryByUuid((prev) => ({ ...prev, [itemUuid]: data }));
      } catch (err) {
        setItemSummaryError(parseApiError(err, "Failed to load results"));
      } finally {
        setItemSummaryLoadingId((id) => (id === itemUuid ? null : id));
      }
    },
    [expandedResultsItemId, itemSummaryByUuid, accessToken, uuid],
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
  const [bulkUploadSttOpen, setBulkUploadSttOpen] = useState(false);
  const [bulkUploadSimulationOpen, setBulkUploadSimulationOpen] =
    useState(false);
  const [bulkUploadLlmOpen, setBulkUploadLlmOpen] = useState(false);
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
                      } else if (taskType === "simulation") {
                        setBulkUploadSimulationOpen(true);
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

            {agreementLoading && !agreement ? (
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
                Loading agreement
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
                  <h2 className="text-sm font-semibold">Agreement summary</h2>
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

            {/* Per-item × per-evaluator summary table */}
            {taskSummaryError && (
              <div className="rounded-md border border-border bg-muted/20 p-4 text-sm text-red-500">
                {taskSummaryError}
              </div>
            )}
            {!taskSummary
              ? null
              : (() => {
                  const annotators = taskSummary.annotators ?? [];
                  const evaluators = taskSummary.evaluators ?? [];
                  const summaryTaskType = taskSummary.task_type;
                  const itemColumns =
                    summaryTaskType === "stt"
                      ? [
                          { key: "ref", label: "Reference transcript" },
                          { key: "pred", label: "Predicted transcript" },
                        ]
                      : [{ key: "name", label: "Name" }];
                  const itemColTpl = itemColumns
                    .map(() => "minmax(180px,1.4fr)")
                    .join(" ");
                  const evalColTpl = "minmax(180px,1fr) 170px 170px 140px";
                  const annotatorColTpl =
                    annotators.length > 0
                      ? annotators.map(() => "120px").join(" ")
                      : "";
                  const gridTemplate = [itemColTpl, evalColTpl, annotatorColTpl]
                    .filter(Boolean)
                    .join(" ");

                  const itemCellValues = (
                    payload: Record<string, unknown> | null,
                  ): string[] => {
                    const p = payload ?? {};
                    if (summaryTaskType === "stt") {
                      const ref =
                        typeof p.reference_transcript === "string"
                          ? (p.reference_transcript as string)
                          : "";
                      const pred =
                        typeof p.predicted_transcript === "string"
                          ? (p.predicted_transcript as string)
                          : "";
                      return [ref || "—", pred || "—"];
                    }
                    const name =
                      typeof p.name === "string" ? (p.name as string) : "";
                    return [name || "—"];
                  };

                  // Filter rows by selected evaluator, then sort by the
                  // active value column. Null verdicts always sink to the
                  // bottom regardless of asc/desc; booleans sort false<true.
                  const selectedEvaluatorIds = new Set(
                    summaryEvaluatorFilter.map((i) => i.uuid),
                  );
                  // Skip rows where everything is null — no evaluator run, no
                  // agreement signal, and no annotator has labelled yet.
                  const baseRows = taskSummary.rows.filter(
                    summaryRowHasAnyValue,
                  );
                  if (baseRows.length === 0) return null;
                  const filteredRows =
                    selectedEvaluatorIds.size === 0
                      ? baseRows
                      : baseRows.filter((r) =>
                          selectedEvaluatorIds.has(r.evaluator_id),
                        );

                  const valueRank = (
                    v: boolean | number | null | undefined,
                  ): number | null => {
                    if (v === null || v === undefined) return null;
                    if (typeof v === "boolean") return v ? 1 : 0;
                    if (typeof v === "number") return v;
                    return null;
                  };
                  const cellValueForSort = (
                    row: SummaryRow,
                  ): boolean | number | null => {
                    if (!summarySortColKey) return null;
                    if (summarySortColKey === "evaluator")
                      return row.evaluator_value;
                    if (summarySortColKey === "human_agreement")
                      return row.human_agreement;
                    if (summarySortColKey === "evaluator_agreement")
                      return row.evaluator_agreement;
                    return row.annotations?.[summarySortColKey]?.value ?? null;
                  };
                  const sortedRows = summarySortColKey
                    ? [...filteredRows].sort((a, b) => {
                        const av = valueRank(cellValueForSort(a));
                        const bv = valueRank(cellValueForSort(b));
                        if (av === null && bv === null) return 0;
                        if (av === null) return 1; // nulls last
                        if (bv === null) return -1;
                        const dir = summarySortDir === "desc" ? -1 : 1;
                        return av === bv ? 0 : av < bv ? -1 * dir : 1 * dir;
                      })
                    : filteredRows;

                  const onSortClick = (key: string) => {
                    if (summarySortColKey === key) {
                      setSummarySortDir((d) => (d === "desc" ? "asc" : "desc"));
                    } else {
                      setSummarySortColKey(key);
                      setSummarySortDir("desc");
                    }
                  };

                  const sortIndicator = (key: string) => {
                    if (summarySortColKey !== key) {
                      return (
                        <svg
                          className="w-3 h-3 opacity-40"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M8.25 15L12 18.75 15.75 15M8.25 9L12 5.25 15.75 9"
                          />
                        </svg>
                      );
                    }
                    return (
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
                          d={
                            summarySortDir === "desc"
                              ? "M19.5 8.25l-7.5 7.5-7.5-7.5"
                              : "M4.5 15.75l7.5-7.5 7.5 7.5"
                          }
                        />
                      </svg>
                    );
                  };

                  return (
                    <>
                      <div className="flex flex-wrap items-center gap-3">
                        <div className="w-64">
                          <MultiSelectPicker
                            items={evaluators.map((ev) => ({
                              uuid: ev.evaluator_id,
                              name: ev.name,
                            }))}
                            selectedItems={summaryEvaluatorFilter}
                            onSelectionChange={setSummaryEvaluatorFilter}
                            placeholder="All evaluators"
                            searchPlaceholder="Search evaluators..."
                          />
                        </div>
                        <Tooltip content="Show results for only the live versions of each evaluator. Toggle to see the results for all versions.">
                          <button
                            type="button"
                            onClick={() => setSummaryLiveOnly((v) => !v)}
                            aria-pressed={summaryLiveOnly}
                            className={`h-9 px-3 inline-flex items-center gap-1.5 rounded-md text-sm font-medium border transition-colors cursor-pointer ${
                              summaryLiveOnly
                                ? "bg-foreground text-background border-foreground"
                                : "bg-transparent text-muted-foreground border-border hover:border-muted-foreground hover:text-foreground"
                            }`}
                          >
                            {summaryLiveOnly ? (
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
                      </div>
                      <div className="border border-border rounded-xl overflow-x-auto">
                        <div
                          className="grid gap-4 px-4 py-2 border-b border-border bg-muted/30 items-center min-w-fit"
                          style={{ gridTemplateColumns: gridTemplate }}
                        >
                          {itemColumns.map((c) => (
                            <div
                              key={c.key}
                              className="text-sm font-medium text-muted-foreground truncate"
                            >
                              {c.label}
                            </div>
                          ))}
                          <div className="text-sm font-medium text-muted-foreground">
                            Evaluator
                          </div>
                          <button
                            type="button"
                            onClick={() => onSortClick("human_agreement")}
                            className={`flex items-center gap-1 text-sm font-medium transition-colors cursor-pointer w-fit whitespace-nowrap ${
                              summarySortColKey === "human_agreement"
                                ? "text-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            Annotator agreement
                            {sortIndicator("human_agreement")}
                          </button>
                          <button
                            type="button"
                            onClick={() => onSortClick("evaluator_agreement")}
                            className={`flex items-center gap-1 text-sm font-medium transition-colors cursor-pointer w-fit whitespace-nowrap ${
                              summarySortColKey === "evaluator_agreement"
                                ? "text-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            Evaluator agreement
                            {sortIndicator("evaluator_agreement")}
                          </button>
                          <button
                            type="button"
                            onClick={() => onSortClick("evaluator")}
                            className={`flex items-center gap-1 text-sm font-medium transition-colors cursor-pointer w-fit ${
                              summarySortColKey === "evaluator"
                                ? "text-foreground"
                                : "text-muted-foreground hover:text-foreground"
                            }`}
                          >
                            Evaluator value
                            {sortIndicator("evaluator")}
                          </button>
                          {annotators.map((a) => (
                            <button
                              key={a.uuid}
                              type="button"
                              onClick={() => onSortClick(a.uuid)}
                              title={a.name}
                              className={`flex items-center gap-1 text-sm font-medium transition-colors cursor-pointer w-fit truncate ${
                                summarySortColKey === a.uuid
                                  ? "text-foreground"
                                  : "text-muted-foreground hover:text-foreground"
                              }`}
                            >
                              <span className="truncate">{a.name}</span>
                              {sortIndicator(a.uuid)}
                            </button>
                          ))}
                        </div>
                        {sortedRows.map((row, idx) => {
                          const cells = itemCellValues(row.payload);
                          const versionLabel =
                            typeof row.evaluator_version_number === "number"
                              ? `v${row.evaluator_version_number}`
                              : null;
                          return (
                            <div
                              key={`${row.item_id}-${row.evaluator_id}-${row.evaluator_version_id ?? ""}-${idx}`}
                              className="grid gap-4 px-4 py-3 border-b border-border last:border-b-0 items-center min-w-fit"
                              style={{ gridTemplateColumns: gridTemplate }}
                            >
                              {cells.map((c, i) => (
                                <p
                                  key={`item-${i}`}
                                  className="text-sm text-foreground line-clamp-2"
                                >
                                  {c}
                                </p>
                              ))}
                              <div className="flex items-center gap-2 min-w-0">
                                <Link
                                  href={`/evaluators/${row.evaluator_id}`}
                                  title={`Open ${row.evaluator_name}`}
                                  className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-muted/40 text-foreground hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer truncate max-w-full"
                                >
                                  <span className="truncate">
                                    {row.evaluator_name}
                                  </span>
                                </Link>
                                {versionLabel && (
                                  <span className="font-mono text-[10px] px-1.5 py-0.5 rounded-md border border-foreground/20 bg-background text-foreground flex-shrink-0">
                                    {versionLabel}
                                  </span>
                                )}
                              </div>
                              <div
                                className={`text-sm font-semibold tabular-nums ${agreementColor(row.human_agreement)}`}
                              >
                                {row.human_agreement != null
                                  ? `${Math.round(row.human_agreement * 100)}%`
                                  : "—"}
                              </div>
                              <div
                                className={`text-sm font-semibold tabular-nums ${agreementColor(row.evaluator_agreement)}`}
                              >
                                {row.evaluator_agreement != null
                                  ? `${Math.round(row.evaluator_agreement * 100)}%`
                                  : "—"}
                              </div>
                              <div
                                className={`text-sm font-medium tabular-nums ${verdictTextClass(row.evaluator_value)}`}
                              >
                                {formatVerdictValue(row.evaluator_value)}
                              </div>
                              {annotators.map((a) => {
                                const v = row.annotations?.[a.uuid] ?? null;
                                return (
                                  <div
                                    key={a.uuid}
                                    className={`text-sm font-medium tabular-nums ${verdictTextClass(v?.value ?? null)}`}
                                  >
                                    {formatVerdictValue(v?.value ?? null)}
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  );
                })()}
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
                        if (totalItems > 0 && selected.length === totalItems) {
                          handleRunEvaluators();
                        } else {
                          handleRunEvaluators(selected);
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
                    const isResultsOpen = expandedResultsItemId === item.uuid;
                    return (
                      <Fragment key={item.uuid}>
                        <div
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
                            onViewResults={toggleItemResults}
                            onLabel={(uuid) => {
                              // Sole row → skip the select-then-bulk
                              // dance and open the assign dialog
                              // straight on this item.
                              if (items.length === 1) {
                                setSelectedItemIds(new Set([uuid]));
                                setAssignOpen(true);
                              } else {
                                toggleItem(uuid);
                              }
                            }}
                            onEvaluate={(uuid) => {
                              if (items.length === 1) {
                                setSelectedItemIds(new Set([uuid]));
                                handleRunEvaluators([uuid]);
                              } else {
                                toggleItem(uuid);
                              }
                            }}
                            isResultsOpen={isResultsOpen}
                            viewResultsDisabled={
                              !!taskSummary && !itemsWithResults.has(item.uuid)
                            }
                          />
                        </div>
                        {isResultsOpen && (
                          <div className="border-b border-border last:border-b-0 bg-muted/10 p-4">
                            {renderItemResultsExpansion(item.uuid)}
                          </div>
                        )}
                      </Fragment>
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
                    const isResultsOpen = expandedResultsItemId === item.uuid;
                    return (
                      <Fragment key={item.uuid}>
                        <div
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
                            onViewResults={toggleItemResults}
                            onLabel={(uuid) => {
                              // Sole row → skip the select-then-bulk
                              // dance and open the assign dialog
                              // straight on this item.
                              if (items.length === 1) {
                                setSelectedItemIds(new Set([uuid]));
                                setAssignOpen(true);
                              } else {
                                toggleItem(uuid);
                              }
                            }}
                            onEvaluate={(uuid) => {
                              if (items.length === 1) {
                                setSelectedItemIds(new Set([uuid]));
                                handleRunEvaluators([uuid]);
                              } else {
                                toggleItem(uuid);
                              }
                            }}
                            isResultsOpen={isResultsOpen}
                            viewResultsDisabled={
                              !!taskSummary && !itemsWithResults.has(item.uuid)
                            }
                          />
                        </div>
                        {isResultsOpen && (
                          <div
                            className="border-b border-border last:border-b-0 bg-muted/10 p-4"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {renderItemResultsExpansion(item.uuid)}
                          </div>
                        )}
                      </Fragment>
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

      {accessToken && (
        <RunEvaluatorsDialog
          isOpen={runDialogOpen}
          accessToken={accessToken}
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
                evaluator_variables[e.evaluator_uuid] = {
                  ...e.variable_values,
                };
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
              handleTabChange("items");
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
                evaluator_variables[e.evaluator_uuid] = {
                  ...e.variable_values,
                };
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

      {accessToken && (
        <BulkUploadSttItemsDialog
          isOpen={bulkUploadSttOpen}
          accessToken={accessToken}
          taskUuid={uuid}
          onClose={() => setBulkUploadSttOpen(false)}
          onSuccess={async (count) => {
            setBulkUploadSttOpen(false);
            handleTabChange("items");
            await fetchTask();
            toast.success(`Added ${count} ${count === 1 ? "item" : "items"}`);
          }}
        />
      )}

      {accessToken && (
        <BulkUploadSimulationItemsDialog
          isOpen={bulkUploadSimulationOpen}
          accessToken={accessToken}
          taskUuid={uuid}
          onClose={() => setBulkUploadSimulationOpen(false)}
          onSuccess={async (count) => {
            setBulkUploadSimulationOpen(false);
            handleTabChange("items");
            await fetchTask();
            toast.success(`Added ${count} ${count === 1 ? "item" : "items"}`);
          }}
        />
      )}

      {accessToken && (
        <BulkUploadLlmItemsDialog
          isOpen={bulkUploadLlmOpen}
          accessToken={accessToken}
          taskUuid={uuid}
          linkedEvaluators={(task?.evaluators ?? []).map((e) => {
            const hydrated = evaluatorCatalogue[e.uuid];
            return {
              uuid: e.uuid,
              name: hydrated?.name ?? e.name,
              slug: hydrated?.slug ?? null,
              variables: hydrated?.variables ?? [],
            };
          })}
          onClose={() => setBulkUploadLlmOpen(false)}
          onSuccess={async (count) => {
            setBulkUploadLlmOpen(false);
            handleTabChange("items");
            await fetchTask();
            toast.success(`Added ${count} ${count === 1 ? "item" : "items"}`);
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
          handleTabChange("items");
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
