"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import { EmptyState } from "@/components/ui/LoadingState";
import { useAccessToken } from "@/hooks";
import { apiClient } from "@/lib/api";
import { useSidebarState } from "@/lib/sidebar";
import { type Item } from "@/components/human-labelling/AnnotationJobView";
import {
  ItemDetailPane,
  extractEvaluatorVariables,
  type EvaluatorRunRow,
  type HumanAgreementItem,
  type HumanAnnotation,
} from "@/components/human-labelling/EvaluatorRunDetailView";

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

type TaskEvaluatorDef = {
  uuid: string;
  name: string;
  description?: string | null;
  output_type?: "binary" | "rating" | null;
  scale_min?: number | boolean | null;
  scale_max?: number | boolean | null;
};

type LabellingItem = {
  uuid: string;
  payload: unknown;
};

type LabellingTask = {
  uuid: string;
  name: string;
  type?: "llm" | "stt" | "tts" | "simulation";
  evaluators?: TaskEvaluatorDef[];
  items?: LabellingItem[];
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

export default function LabellingTaskItemPage() {
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
  const itemUuid =
    typeof params?.itemUuid === "string"
      ? params.itemUuid
      : Array.isArray(params?.itemUuid)
        ? params.itemUuid[0]
        : "";

  const [task, setTask] = useState<LabellingTask | null>(null);
  const [summary, setSummary] = useState<TaskSummaryResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAll = useCallback(async () => {
    if (!accessToken || !taskUuid || !itemUuid) return;
    setLoading(true);
    setError(null);
    try {
      const [taskData, summaryData] = await Promise.all([
        apiClient<LabellingTask>(
          `/annotation-tasks/${taskUuid}`,
          accessToken,
        ),
        apiClient<TaskSummaryResponse>(
          `/annotation-tasks/${taskUuid}/summary?item_id=${encodeURIComponent(itemUuid)}`,
          accessToken,
        ),
      ]);
      setTask(taskData);
      setSummary(summaryData);
    } catch (err) {
      setError(parseApiError(err, "Failed to load item"));
    } finally {
      setLoading(false);
    }
  }, [accessToken, taskUuid, itemUuid]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  useEffect(() => {
    if (task?.name) document.title = `${task.name} item | Calibrate`;
  }, [task?.name]);

  const taskType = task?.type;

  const item: Item | null = useMemo(() => {
    const match = task?.items?.find((i) => i.uuid === itemUuid);
    if (!match) return null;
    return {
      id: 0,
      uuid: match.uuid,
      task_id: taskUuid,
      payload: match.payload,
      created_at: "",
      deleted_at: null,
    };
  }, [task?.items, itemUuid, taskUuid]);

  // Build EvaluatorResultsPane-shaped data from the per-item summary rows.
  // Each (evaluator_id, evaluator_version_id) tuple in the summary becomes
  // an entry in `evaluators` and a synthetic `EvaluatorRunRow`. Annotations
  // are reshaped into `HumanAnnotation`s grouped by evaluator.
  const adapted = useMemo(() => {
    if (!summary || !task) return null;
    const taskEvaluatorByUuid = new Map(
      (task.evaluators ?? []).map((e) => [e.uuid, e]),
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

    for (const row of summary.rows) {
      const evKey = `${row.evaluator_id}-${row.evaluator_version_id ?? ""}`;
      if (!seenEvKey.has(evKey)) {
        seenEvKey.add(evKey);
        evaluators.push({
          evaluator_id: row.evaluator_id,
          evaluator_version_id: row.evaluator_version_id ?? undefined,
          name: row.evaluator_name,
        });
      }
      if (row.evaluator_version_id && typeof row.evaluator_version_number === "number") {
        versionLabels[row.evaluator_version_id] = `v${row.evaluator_version_number}`;
      }
      if (!evaluatorNamesById[row.evaluator_id]) {
        evaluatorNamesById[row.evaluator_id] = row.evaluator_name;
      }

      const taskEv = taskEvaluatorByUuid.get(row.evaluator_id);
      const scaleMin =
        typeof taskEv?.scale_min === "number" ? taskEv.scale_min : null;
      const scaleMax =
        typeof taskEv?.scale_max === "number" ? taskEv.scale_max : null;

      runs.push({
        uuid: `${row.item_id}:${row.evaluator_id}:${row.evaluator_version_id ?? ""}`,
        job_id: "",
        item_id: row.item_id,
        evaluator_id: row.evaluator_id,
        evaluator_version_id: row.evaluator_version_id ?? "",
        value:
          row.evaluator_value === null && !row.evaluator_reasoning
            ? null
            : {
                value: row.evaluator_value,
                reasoning: row.evaluator_reasoning ?? null,
              },
        status: row.evaluator_value !== null ? "completed" : "pending",
        created_at: "",
        completed_at: null,
        evaluator_version: {
          uuid: row.evaluator_version_id ?? undefined,
          version_number: row.evaluator_version_number ?? undefined,
          scale_min: scaleMin,
          scale_max: scaleMax,
        },
        evaluator: {
          uuid: row.evaluator_id,
          name: row.evaluator_name,
          description: taskEv?.description ?? null,
          output_type: row.output_type,
        },
      });

      // Build the per-evaluator annotation list. Skip annotations with no
      // value picked (so the pills only show annotators who labelled).
      const human_annotations: HumanAnnotation[] = [];
      for (const [annUuid, ann] of Object.entries(row.annotations ?? {})) {
        if (!ann || ann.value === null || ann.value === undefined) continue;
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
      item_id: itemUuid,
      annotator_count: (summary.annotators ?? []).length,
      evaluators: haEvaluators,
    };

    return {
      evaluators,
      evaluatorNamesById,
      runs,
      versionLabels,
      humanAgreementForItem,
    };
  }, [summary, task, itemUuid]);

  const evaluatorVariables = useMemo(
    () => (item ? extractEvaluatorVariables(item.payload) : {}),
    [item],
  );

  return (
    <AppLayout
      activeItem="human-alignment"
      onItemChange={(id) => router.push(`/${id}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
    >
      <div className="h-full flex flex-col py-4 md:py-6 gap-4 md:gap-6 min-h-0">
        <button
          onClick={() =>
            router.push(`/human-alignment/tasks/${taskUuid}?tab=items`)
          }
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors cursor-pointer w-fit"
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
          Back to items
        </button>

        {task && (
          <div>
            <h1 className="text-xl md:text-2xl font-semibold">{task.name}</h1>
            <p className="text-xs text-muted-foreground mt-1">Item view</p>
          </div>
        )}

        {error && (
          <div className="rounded-md border border-border bg-muted/20 p-4 text-sm text-red-500">
            {error}
          </div>
        )}

        {loading ? (
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
            Loading item
          </div>
        ) : !item || !taskType || !adapted ? (
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
                  d="M9.879 7.519c1.171-1.025 3.071-1.025 4.242 0 1.172 1.025 1.172 2.687 0 3.712-.203.179-.43.326-.67.442-.745.361-1.45.999-1.45 1.827v.75M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9 5.25h.008v.008H12v-.008z"
                />
              </svg>
            }
            title="Item not found"
            description="This item may have been deleted or doesn't belong to this task"
          />
        ) : (
          <div className="border border-border rounded-xl [overflow:clip] flex flex-col flex-1 min-h-0">
            <ItemDetailPane
              item={item}
              taskType={taskType}
              evaluators={adapted.evaluators}
              evaluatorNamesById={adapted.evaluatorNamesById}
              runs={adapted.runs}
              versionLabels={adapted.versionLabels}
              jobStatus="completed"
              humanAgreementForItem={adapted.humanAgreementForItem}
              evaluatorVariablesByEvaluatorId={evaluatorVariables}
              filterDisagreements={false}
              linkEvaluators
            />
          </div>
        )}
      </div>
    </AppLayout>
  );
}
