"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { AppLayout } from "@/components/AppLayout";
import { ShareButton } from "@/components/ShareButton";
import { useAccessToken } from "@/hooks";
import { apiClient } from "@/lib/api";
import { useSidebarState } from "@/lib/sidebar";
import { type Item } from "@/components/human-labelling/AnnotationJobView";
import {
  RunEvaluatorsDialog,
  type RunEvaluatorsSelection,
} from "@/components/human-labelling/RunEvaluatorsDialog";
import {
  EvaluatorRunDetailView,
  type EvaluatorRunJob,
  type EvaluatorRunRow,
  type LabellingTaskFull,
  agreementExportCell,
  annotatorDisplayName,
  computeEvaluatorHumanAgreement,
  computeInterAnnotatorAgreement,
  evaluatorDisplayName,
  exportInputCols,
  extractEvaluatorVariables,
  extractPayloadInputValues,
  isBelowFullEvaluatorAgreement,
  orderedSnapshotsForRun,
  runOutputType,
  snapshotToItem,
} from "@/components/human-labelling/EvaluatorRunDetailView";
import { parseBackendErrorMessage } from "@/lib/parseBackendError";

/**
 * Surface a user-renderable string from an apiClient-thrown Error.
 *
 * The Re-run flow (POST /annotation-tasks/{uuid}/evaluator-runs) can hit:
 *   - 404 `Annotation task not found`
 *   - 400 `task has no items` / `item_ids not in this task`
 *   - 400 EvaluatorResolutionError / DatasetBuildError pass-throughs
 *   - 422 (validation array) and 5xx (rendered as generic message + log)
 *
 * Backend messages on 4xx are user-facing per the API docs; 5xx are
 * replaced with a generic toast.
 */
function parseApiError(err: unknown, fallback: string): string {
  return parseBackendErrorMessage(err, fallback);
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
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const startTime = useRef(Date.now());
  // Re-run flow: opens the same RunEvaluatorsDialog used on the items table,
  // but pre-targeting this job's items so the user just picks evaluators /
  // versions and a fresh run is kicked off.
  const [rerunOpen, setRerunOpen] = useState(false);
  const [rerunSubmitting, setRerunSubmitting] = useState(false);
  const [rerunError, setRerunError] = useState<string | null>(null);

  const evaluatorNamesById = useMemo(() => {
    const m: Record<string, string> = {};
    for (const ev of task?.evaluators ?? []) {
      const n = ev.name?.trim();
      if (ev.uuid && n) m[ev.uuid] = n;
    }
    return m;
  }, [task?.evaluators]);

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
    let didFinalFetch = false;
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
      } else if (!didFinalFetch) {
        // human_agreement may be computed by the backend just after the run is
        // marked complete. One extra fetch a moment later picks it up so the
        // "Show disagreements" button appears without a manual reload.
        didFinalFetch = true;
        timer = setTimeout(tick, 1500);
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
  // re-fire when the run polls.
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

  // Items in this run, derived the same way as the body view (used by export).
  const itemsForRun = useMemo<Item[]>(() => {
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
  }, [job, task]);

  const runsByItem = useMemo(() => {
    const m: Record<string, EvaluatorRunRow[]> = {};
    for (const r of job?.runs ?? []) {
      (m[r.item_id] = m[r.item_id] ?? []).push(r);
    }
    return m;
  }, [job]);

  /** Item UUIDs covered by this job, used to pre-target a re-run. */
  const rerunItemIds = useMemo<string[]>(
    () => itemsForRun.map((it) => it.uuid).filter(Boolean),
    [itemsForRun],
  );

  const submitRerun = useCallback(
    async (selections: RunEvaluatorsSelection[]) => {
      if (!accessToken || !taskUuid || rerunSubmitting) return;
      setRerunSubmitting(true);
      setRerunError(null);
      try {
        const body: Record<string, unknown> = { evaluators: selections };
        if (rerunItemIds.length > 0) body.item_ids = rerunItemIds;
        const result = await apiClient<{
          job_uuid: string;
          status: string;
          evaluator_count: number;
          item_count: number;
        }>(`/annotation-tasks/${taskUuid}/evaluator-runs`, accessToken, {
          method: "POST",
          body,
        });
        setRerunOpen(false);
        // Navigate to the new run; rerunSubmitting stays true through unmount.
        router.push(
          `/human-alignment/tasks/${taskUuid}/evaluator-runs/${result.job_uuid}`,
        );
      } catch (err) {
        setRerunError(parseApiError(err, "Failed to start evaluation run"));
        setRerunSubmitting(false);
      }
    },
    [accessToken, taskUuid, rerunItemIds, rerunSubmitting, router],
  );

  const handleExport = useCallback(async () => {
    const exportItems = itemsForRun;
    if (!job || !task || exportItems.length === 0) return;
    setExporting(true);
    setExportError(null);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const evaluators = job.details?.evaluators ?? [];

      for (const ev of evaluators) {
        const evName = evaluatorDisplayName(ev, evaluatorNamesById);
        const versionLabel = ev.evaluator_version_id
          ? (versionLabels[ev.evaluator_version_id] ?? null)
          : null;
        const rawSheetName = versionLabel ? `${evName} ${versionLabel}` : evName;
        const sheetName = rawSheetName.replace(/[:\\/?*[\]]/g, "_").slice(0, 31);

        const allVarNames = new Set<string>();
        for (const item of exportItems) {
          const haItem = job.human_agreement?.items.find(
            (i) => i.item_id === item.uuid,
          );
          const evHumanData = haItem?.evaluators.find(
            (e) => e.evaluator_id === ev.evaluator_id,
          );
          if (!isBelowFullEvaluatorAgreement(evHumanData)) continue;
          const vars = extractEvaluatorVariables(item.payload);
          for (const k of Object.keys(vars[ev.evaluator_id] ?? {})) {
            allVarNames.add(k);
          }
        }
        const varNames = Array.from(allVarNames).sort();

        const annotatorMap = new Map<string, string>();
        for (const haItem of job.human_agreement?.items ?? []) {
          const evData = haItem.evaluators.find(
            (e) => e.evaluator_id === ev.evaluator_id,
          );
          for (const ann of evData?.human_annotations ?? []) {
            if (!annotatorMap.has(ann.annotator_id)) {
              annotatorMap.set(ann.annotator_id, annotatorDisplayName(ann));
            }
          }
        }
        const annotatorIds = Array.from(annotatorMap.keys());

        const inputCols = exportInputCols(task.type);
        const varCols = varNames.map((v) => `${evName}/${v}`);
        const annotatorCols = annotatorIds.flatMap((id) => {
          const name = annotatorMap.get(id)!;
          return [`${name}/value`, `${name}/reasoning`];
        });
        const header = [
          ...inputCols,
          ...varCols,
          "Human agreement",
          "Evaluator agreement",
          "Evaluator/value",
          "Evaluator/reasoning",
          ...annotatorCols,
        ];

        const rows: unknown[][] = [header];

        for (const item of exportItems) {
          const haItem = job.human_agreement?.items.find(
            (i) => i.item_id === item.uuid,
          );
          const evHumanData = haItem?.evaluators.find(
            (e) => e.evaluator_id === ev.evaluator_id,
          );
          if (!isBelowFullEvaluatorAgreement(evHumanData)) continue;

          const inputValues = extractPayloadInputValues(
            item.payload,
            task.type,
          );
          const vars = extractEvaluatorVariables(item.payload);
          const evVars = vars[ev.evaluator_id] ?? {};
          const varValues = varNames.map((v) => evVars[v] ?? "");

          const run = (runsByItem[item.uuid] ?? []).find(
            (r) =>
              r.evaluator_id === ev.evaluator_id &&
              (!ev.evaluator_version_id ||
                r.evaluator_version_id === ev.evaluator_version_id),
          );
          let evValue: unknown = "";
          let evReasoning = "";
          if (run) {
            const v = run.value?.value;
            evValue = v != null ? v : "";
            const reas = run.value?.reasoning;
            evReasoning = typeof reas === "string" ? reas : "";
          }

          const outputType = runOutputType(run);
          const humanAgCell = agreementExportCell(
            evHumanData?.human_agreement,
            computeInterAnnotatorAgreement(
              evHumanData?.human_annotations ?? [],
              outputType,
            ),
          );
          const evaluatorAgCell = agreementExportCell(
            evHumanData?.evaluator_agreement,
            computeEvaluatorHumanAgreement(
              evHumanData?.human_annotations ?? [],
              run?.value?.value,
              outputType,
            ),
          );
          const annotatorValues = annotatorIds.flatMap((annotatorId) => {
            const ann = evHumanData?.human_annotations.find(
              (a) => a.annotator_id === annotatorId,
            );
            if (!ann) return ["", ""];
            const v = ann.value?.value;
            const annValue = v != null ? v : "";
            const topReasoning =
              typeof ann.reasoning === "string" ? ann.reasoning : null;
            const nestedReasoning =
              typeof ann.value?.reasoning === "string"
                ? (ann.value.reasoning as string)
                : null;
            const annReasoning = topReasoning ?? nestedReasoning ?? "";
            return [annValue, annReasoning];
          });

          rows.push([
            ...inputValues,
            ...varValues,
            humanAgCell,
            evaluatorAgCell,
            evValue,
            evReasoning,
            ...annotatorValues,
          ]);
        }

        const ws = wb.addWorksheet(sheetName);
        ws.addRows(rows);
      }

      const buffer = await wb.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `evaluator-run-${job.uuid.slice(0, 8)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(false);
    }
  }, [job, task, itemsForRun, runsByItem, versionLabels, evaluatorNamesById]);

  const customHeader = (
    <button
      onClick={() =>
        router.push(`/human-alignment/tasks/${taskUuid}?tab=runs`)
      }
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
      Back to evaluation runs
    </button>
  );

  return (
    <AppLayout
      activeItem="human-alignment"
      onItemChange={(id) => router.push(`/${id}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
      customHeader={customHeader}
    >
      <div
        className="py-4 md:py-6 flex flex-col gap-4"
        style={{ height: "calc(100dvh - 56px)" }}
      >
        {/* Mobile-only back button — AppLayout hides `customHeader` below md. */}
        <button
          onClick={() =>
            router.push(`/human-alignment/tasks/${taskUuid}?tab=runs`)
          }
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
          <EvaluatorRunDetailView
            job={job}
            task={task}
            versionLabels={versionLabels}
            linkEvaluators
            actionsSlot={
              <div className="flex items-center gap-2 flex-wrap">
                {job.status === "completed" && accessToken && (
                  <ShareButton
                    entityType="annotation-evaluator-run"
                    entityId={`${taskUuid}:${runUuid}`}
                    accessToken={accessToken}
                    initialIsPublic={job.is_public ?? false}
                    initialShareToken={job.share_token ?? null}
                  />
                )}
                {accessToken && rerunItemIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setRerunError(null);
                      setRerunOpen(true);
                    }}
                    disabled={rerunSubmitting}
                    title="Run a new evaluation on the same items"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium border border-border bg-background hover:bg-muted/60 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <svg
                      className="w-3.5 h-3.5 shrink-0"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M4 4v5h.582a8 8 0 0114.95-2M20 20v-5h-.581a8 8 0 01-14.95 2"
                      />
                    </svg>
                    Re-run
                  </button>
                )}
                {job.status === "completed" && itemsForRun.length > 0 && (
                  <button
                    type="button"
                    onClick={handleExport}
                    disabled={exporting}
                    title="Download spreadsheet (XLSX)"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[13px] font-medium bg-foreground text-background shadow-sm hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {exporting ? (
                      <svg
                        className="w-3.5 h-3.5 shrink-0 animate-spin"
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
                    ) : (
                      <svg
                        className="w-3.5 h-3.5 shrink-0"
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"
                        />
                      </svg>
                    )}
                    {exporting ? "Exporting…" : "Export results"}
                  </button>
                )}
              </div>
            }
            topError={
              exportError ? `Export failed: ${exportError}` : null
            }
          />
        ) : null}
      </div>

      {accessToken && task && (
        <RunEvaluatorsDialog
          isOpen={rerunOpen}
          accessToken={accessToken}
          evaluators={(task.evaluators ?? []).map((e) => ({
            uuid: e.uuid,
            name: e.name,
          }))}
          submitting={rerunSubmitting}
          submitError={rerunError}
          onClose={() => {
            if (!rerunSubmitting) {
              setRerunOpen(false);
              setRerunError(null);
            }
          }}
          onConfirm={submitRerun}
        />
      )}
    </AppLayout>
  );
}
