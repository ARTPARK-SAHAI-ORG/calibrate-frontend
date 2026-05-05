"use client";

import { Suspense, useEffect, useState, useCallback, FormEvent } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AppLayout } from "@/components/AppLayout";
import { DeleteConfirmationDialog } from "@/components/DeleteConfirmationDialog";
import { EvaluatorTypePill } from "@/components/EvaluatorPills";
import { CreateLabellingTaskDialog } from "@/components/human-labelling/CreateLabellingTaskDialog";
import { EmptyState } from "@/components/ui/LoadingState";
import { Select } from "@/components/ui/Select";
import { useAccessToken } from "@/hooks";
import { apiClient } from "@/lib/api";
import { useSidebarState } from "@/lib/sidebar";

type Tab = "overview" | "tasks" | "annotators";

type Annotator = {
  uuid: string;
  name: string;
  created_at?: string;
  updated_at?: string;
  jobs_count?: number;
  current_agreement?: number | null;
  pair_count?: number | null;
};

function parseApiError(err: unknown, fallback: string): string {
  if (!(err instanceof Error)) return fallback;
  // apiClient throws "Request failed: {status} - {body}" where body is JSON
  const match = err.message.match(/Request failed: \d+ - (.+)$/);
  if (match) {
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && typeof parsed.detail === "string") return parsed.detail;
    } catch {
      // not JSON, fall through
    }
    return match[1];
  }
  return err.message || fallback;
}

type LabellingTaskSummary = {
  uuid: string;
  name: string;
};

type LabellingTaskEvaluator = {
  uuid: string;
  name: string;
  evaluator_type?: "llm" | "stt" | "tts" | "simulation";
  output_type?: "binary" | "rating";
  owner_user_id?: string | null;
};

type LabellingTask = {
  uuid: string;
  name: string;
  type?: "llm" | "stt" | "tts" | "simulation";
  description?: string;
  created_at?: string;
  updated_at?: string;
  item_count?: number;
  evaluators?: LabellingTaskEvaluator[];
};

type SortDirection = "asc" | "desc";

type AgreementSeriesPoint = {
  bucket_start: string;
  bucket_end: string;
  agreement: number | null;
  pair_count: number;
};

type AgreementBlock = {
  current: number | null;
  pair_count: number;
  series: AgreementSeriesPoint[];
};

type EvaluatorAgreementBlock = AgreementBlock & {
  evaluator_id: string;
  name: string;
};

type AgreementResponse = {
  bucket: string;
  days: number;
  task_id?: string;
  human_human: AgreementBlock;
  evaluators: EvaluatorAgreementBlock[];
};

type Bucket = "week" | "month" | "year";

const ALL_TASKS = "all";
const DEFAULT_BUCKET: Bucket = "month";
const DEFAULT_DAYS = 180;

function agreementColor(fraction: number | null | undefined): string {
  if (fraction == null) return "";
  const pct = fraction * 100;
  if (pct >= 75) return "text-green-600 dark:text-green-400";
  if (pct <= 50) return "text-red-600 dark:text-red-400";
  return "text-yellow-600 dark:text-yellow-400";
}

function formatBucketLabel(iso: string, bucket: Bucket): string {
  // Backend returns "YYYY-MM-DD HH:MM:SS" UTC, no offset suffix.
  const d = new Date(iso.replace(" ", "T") + "Z");
  if (Number.isNaN(d.getTime())) return iso;
  if (bucket === "year") return d.getUTCFullYear().toString();
  return d.toLocaleString("en-US", {
    month: "short",
    timeZone: "UTC",
  });
}

const TABS: Tab[] = ["overview", "tasks", "annotators"];

function isTab(value: string | null): value is Tab {
  return !!value && (TABS as string[]).includes(value);
}

export default function HumanLabellingPage() {
  return (
    <Suspense fallback={null}>
      <HumanLabellingPageInner />
    </Suspense>
  );
}

function HumanLabellingPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const accessToken = useAccessToken();
  const [sidebarOpen, setSidebarOpen] = useSidebarState();
  const initialTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<Tab>(
    isTab(initialTab) ? initialTab : "overview",
  );

  const handleTabChange = useCallback((tab: Tab) => {
    setActiveTab(tab);
    window.history.replaceState(null, "", `/human-labelling?tab=${tab}`);
  }, []);

  const [annotators, setAnnotators] = useState<Annotator[]>([]);
  const [annotatorsLoading, setAnnotatorsLoading] = useState(false);
  const [annotatorsError, setAnnotatorsError] = useState<string | null>(null);

  const [newAnnotatorName, setNewAnnotatorName] = useState("");
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState<string | null>(null);

  const [annotatorToDelete, setAnnotatorToDelete] = useState<Annotator | null>(
    null,
  );
  const [isDeleting, setIsDeleting] = useState(false);

  const [taskToDelete, setTaskToDelete] = useState<LabellingTask | null>(null);
  const [isDeletingTask, setIsDeletingTask] = useState(false);

  const [agreement, setAgreement] = useState<AgreementResponse | null>(null);
  const [agreementLoading, setAgreementLoading] = useState(false);
  const [agreementError, setAgreementError] = useState<string | null>(null);
  /** False until the first agreement request for the current overview session finishes (avoids empty placeholder flash). */
  const [agreementFetchCompleted, setAgreementFetchCompleted] = useState(false);

  const [tasks, setTasks] = useState<LabellingTask[]>([]);
  const [tasksLoading, setTasksLoading] = useState(false);
  const [tasksError, setTasksError] = useState<string | null>(null);

  const sortedTasks = [...tasks].sort((a, b) => a.name.localeCompare(b.name));

  const [selectedTaskId, setSelectedTaskId] = useState<string>(ALL_TASKS);
  const [bucket] = useState<Bucket>(DEFAULT_BUCKET);
  const [days] = useState<number>(DEFAULT_DAYS);
  // Task uuids that have any agreement data (human-human or any evaluator).
  // Populated lazily after tasks load so the dropdown only lists tasks with
  // at least one comparable pair.
  const [tasksWithAgreement, setTasksWithAgreement] = useState<Set<string>>(
    new Set(),
  );

  const taskOptions: LabellingTaskSummary[] = tasks
    .filter((t) => tasksWithAgreement.has(t.uuid))
    .map((t) => ({ uuid: t.uuid, name: t.name }));

  useEffect(() => {
    document.title = "Human Labelling | Calibrate";
  }, []);

  const fetchAnnotators = useCallback(async () => {
    if (!accessToken) return;
    setAnnotatorsLoading(true);
    setAnnotatorsError(null);
    try {
      const data = await apiClient<Annotator[]>("/annotators", accessToken);
      setAnnotators(Array.isArray(data) ? data : []);
    } catch (err) {
      setAnnotatorsError(parseApiError(err, "Failed to load annotators"));
    } finally {
      setAnnotatorsLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    if (activeTab === "annotators") {
      fetchAnnotators();
    }
  }, [activeTab, fetchAnnotators]);

  const fetchTasks = useCallback(async () => {
    if (!accessToken) return;
    setTasksLoading(true);
    setTasksError(null);
    try {
      const data = await apiClient<LabellingTask[]>(
        "/annotation-tasks",
        accessToken,
      );
      setTasks(Array.isArray(data) ? data : []);
    } catch (err) {
      setTasksError(parseApiError(err, "Failed to load labelling tasks"));
    } finally {
      setTasksLoading(false);
    }
  }, [accessToken]);

  // Tasks list is needed on every tab — for the dropdown on overview, the
  // list itself on tasks, and the Tasks (n) tab counter everywhere.
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  const fetchAgreement = useCallback(async () => {
    if (!accessToken) return;
    setAgreementLoading(true);
    setAgreementError(null);
    try {
      const query = `?bucket=${bucket}&days=${days}`;
      const endpoint =
        selectedTaskId === ALL_TASKS
          ? `/annotation-agreement/trend${query}`
          : `/annotation-tasks/${encodeURIComponent(selectedTaskId)}/agreement${query}`;
      const data = await apiClient<AgreementResponse>(endpoint, accessToken);
      setAgreement(data);
    } catch (err) {
      setAgreementError(parseApiError(err, "Failed to load agreement"));
    } finally {
      setAgreementLoading(false);
      setAgreementFetchCompleted(true);
    }
  }, [accessToken, selectedTaskId, bucket, days]);

  useEffect(() => {
    if (activeTab === "overview") {
      fetchAgreement();
      // Annotators are needed for the count card; refetch is cheap.
      fetchAnnotators();
    }
  }, [activeTab, fetchAgreement, fetchAnnotators]);

  // Probe each task's agreement endpoint once so we can filter the
  // task-selector dropdown to those that actually have comparable pairs.
  useEffect(() => {
    if (!accessToken || tasks.length === 0) return;
    let cancelled = false;
    (async () => {
      const query = `?bucket=${bucket}&days=${days}`;
      const results = await Promise.all(
        tasks.map(async (t) => {
          try {
            const data = await apiClient<AgreementResponse>(
              `/annotation-tasks/${encodeURIComponent(t.uuid)}/agreement${query}`,
              accessToken,
            );
            const hh = (data.human_human?.pair_count ?? 0) > 0;
            const anyEval = (data.evaluators ?? []).some(
              (e) => (e.pair_count ?? 0) > 0,
            );
            return hh || anyEval ? t.uuid : null;
          } catch {
            return null;
          }
        }),
      );
      if (cancelled) return;
      setTasksWithAgreement(new Set(results.filter((u): u is string => !!u)));
    })();
    return () => {
      cancelled = true;
    };
  }, [tasks, accessToken, bucket, days]);

  const [createDialogOpen, setCreateDialogOpen] = useState(false);

  const handleCreateTask = () => {
    setCreateDialogOpen(true);
  };

  const handleAddAnnotator = async (e: FormEvent) => {
    e.preventDefault();
    const name = newAnnotatorName.trim();
    if (!name || !accessToken || isAdding) return;
    setIsAdding(true);
    setAddError(null);
    try {
      const { uuid } = await apiClient<{ uuid: string; message: string }>(
        "/annotators",
        accessToken,
        { method: "POST", body: { name } },
      );
      setAnnotators((prev) =>
        [...prev.filter((a) => a.uuid !== uuid), { uuid, name }].sort((a, b) =>
          a.name.localeCompare(b.name),
        ),
      );
      setNewAnnotatorName("");
    } catch (err) {
      setAddError(parseApiError(err, "Failed to add annotator"));
    } finally {
      setIsAdding(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!annotatorToDelete || !accessToken) return;
    setIsDeleting(true);
    try {
      await apiClient<{ message: string }>(
        `/annotators/${annotatorToDelete.uuid}`,
        accessToken,
        { method: "DELETE" },
      );
      setAnnotators((prev) =>
        prev.filter((a) => a.uuid !== annotatorToDelete.uuid),
      );
      setAnnotatorToDelete(null);
    } catch (err) {
      setAddError(parseApiError(err, "Failed to remove annotator"));
    } finally {
      setIsDeleting(false);
    }
  };

  const handleConfirmDeleteTask = async () => {
    if (!taskToDelete || !accessToken) return;
    setIsDeletingTask(true);
    try {
      await apiClient<{ message: string }>(
        `/annotation-tasks/${taskToDelete.uuid}`,
        accessToken,
        { method: "DELETE" },
      );
      setTasks((prev) => prev.filter((t) => t.uuid !== taskToDelete.uuid));
      setTaskToDelete(null);
    } catch (err) {
      setTasksError(parseApiError(err, "Failed to delete task"));
    } finally {
      setIsDeletingTask(false);
    }
  };

  const tasksCount = tasks.length;
  const annotatorsCount = annotators.length;

  return (
    <AppLayout
      activeItem="human-labelling"
      onItemChange={(id) => router.push(`/${id}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
    >
      <div className="space-y-4 md:space-y-6 py-4 md:py-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
          <div>
            <h1 className="text-xl md:text-2xl font-semibold">
              Human Labelling
            </h1>
            <p className="text-muted-foreground text-sm md:text-base leading-relaxed mt-1 max-w-3xl">
              Manage labelling tasks and the annotators who review them. Use the
              collected judgments to measure how well your evaluators agree with
              human experts.
            </p>
          </div>
          <button
            onClick={handleCreateTask}
            className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer flex-shrink-0"
          >
            Create new labelling task
          </button>
        </div>

        {/* Tabs */}
        <div className="border-b border-border flex items-center gap-1">
          {[
            { id: "overview" as Tab, label: "Overview" },
            {
              id: "tasks" as Tab,
              label: tasksCount > 0 ? `Tasks (${tasksCount})` : "Tasks",
            },
            {
              id: "annotators" as Tab,
              label:
                annotatorsCount > 0
                  ? `Annotators (${annotatorsCount})`
                  : "Annotators",
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

        {/* Tab Content */}
        {activeTab === "overview" && (
          <AgreementOverview
            agreement={agreement}
            agreementLoading={agreementLoading || !agreementFetchCompleted}
            agreementError={agreementError}
            bucket={bucket}
            selectedTaskId={selectedTaskId}
            onSelectTask={setSelectedTaskId}
            taskOptions={taskOptions}
            tasks={tasks}
          />
        )}

        {activeTab === "tasks" &&
          (tasksLoading ? (
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
              Loading tasks
            </div>
          ) : tasksError ? (
            <div className="rounded-md border border-border bg-muted/20 p-4 text-sm text-red-500">
              {tasksError}
            </div>
          ) : tasks.length === 0 ? (
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
                    d="M9 12h3.75M9 15h3.75M9 18h3.75m3 .75H18a2.25 2.25 0 002.25-2.25V6.108c0-1.135-.845-2.098-1.976-2.192a48.424 48.424 0 00-1.123-.08m-5.801 0c-.065.21-.1.433-.1.664 0 .414.336.75.75.75h4.5a.75.75 0 00.75-.75 2.25 2.25 0 00-.1-.664m-5.8 0A2.251 2.251 0 0113.5 2.25H15c1.012 0 1.867.668 2.15 1.586m-5.8 0c-.376.023-.75.05-1.124.08C9.095 4.01 8.25 4.973 8.25 6.108V8.25m0 0H4.875c-.621 0-1.125.504-1.125 1.125v11.25c0 .621.504 1.125 1.125 1.125h9.75c.621 0 1.125-.504 1.125-1.125V9.375c0-.621-.504-1.125-1.125-1.125H8.25zM6.75 12h.008v.008H6.75V12zm0 3h.008v.008H6.75V15zm0 3h.008v.008H6.75V18z"
                  />
                </svg>
              }
              title="No labelling tasks yet"
              description="Create a task for gathering human feedback and aligning LLM evaluators to humans"
              action={{
                label: "Create new labelling task",
                onClick: handleCreateTask,
              }}
            />
          ) : (
            <>
              {/* Desktop table */}
              <div className="hidden md:block border border-border rounded-xl overflow-hidden">
                <div className="grid grid-cols-[minmax(0,1fr)_160px_100px_minmax(0,1.2fr)_40px] gap-4 [&>*:nth-child(3)]:pl-6 px-4 py-2 border-b border-border bg-muted/30">
                  <div className="text-sm font-medium text-muted-foreground">
                    Name
                  </div>
                  <div className="text-sm font-medium text-muted-foreground">
                    Type
                  </div>
                  <div className="text-sm font-medium text-muted-foreground">
                    Items
                  </div>
                  <div className="text-sm font-medium text-muted-foreground">
                    Evaluators
                  </div>
                  <div />
                </div>
                {sortedTasks.map((task) => {
                  const evaluators = task.evaluators ?? [];
                  const evaluatorType =
                    task.type ?? evaluators[0]?.evaluator_type;
                  return (
                    <div
                      key={task.uuid}
                      onClick={() =>
                        router.push(`/human-labelling/tasks/${task.uuid}`)
                      }
                      className="grid grid-cols-[minmax(0,1fr)_160px_100px_minmax(0,1.2fr)_40px] gap-4 [&>*:nth-child(3)]:pl-6 px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer items-center"
                    >
                      <p className="text-sm font-medium text-foreground truncate">
                        {task.name}
                      </p>
                      <div>
                        {evaluatorType ? (
                          <EvaluatorTypePill evaluatorType={evaluatorType} />
                        ) : (
                          <span className="text-sm text-muted-foreground">
                            —
                          </span>
                        )}
                      </div>
                      <p className="text-sm text-muted-foreground tabular-nums">
                        {task.item_count ?? 0}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {evaluators.length === 0 ? (
                          <span className="text-sm text-muted-foreground">
                            —
                          </span>
                        ) : (
                          evaluators.map((ev) => (
                            <Link
                              key={ev.uuid}
                              href={`/evaluators/${ev.uuid}`}
                              onClick={(e) => e.stopPropagation()}
                              title={`Open ${ev.name}`}
                              className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-muted/40 text-foreground hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer max-w-full"
                            >
                              <span className="truncate">{ev.name}</span>
                            </Link>
                          ))
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTaskToDelete(task);
                        }}
                        aria-label={`Delete ${task.name}`}
                        title="Delete task"
                        className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
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
                  );
                })}
              </div>

              {/* Mobile cards */}
              <div className="md:hidden space-y-2">
                {sortedTasks.map((task) => {
                  const evaluators = task.evaluators ?? [];
                  const evaluatorType =
                    task.type ?? evaluators[0]?.evaluator_type;
                  return (
                    <div
                      key={task.uuid}
                      onClick={() =>
                        router.push(`/human-labelling/tasks/${task.uuid}`)
                      }
                      className="border border-border rounded-xl p-4 hover:bg-muted/20 transition-colors cursor-pointer flex items-start gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <p className="text-sm font-medium text-foreground truncate">
                            {task.name}
                          </p>
                          {evaluatorType && (
                            <EvaluatorTypePill evaluatorType={evaluatorType} />
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {task.item_count ?? 0} item
                          {(task.item_count ?? 0) === 1 ? "" : "s"}
                        </p>
                        {evaluators.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2">
                            {evaluators.map((ev) => (
                              <Link
                                key={ev.uuid}
                                href={`/evaluators/${ev.uuid}`}
                                onClick={(e) => e.stopPropagation()}
                                title={`Open ${ev.name}`}
                                className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-muted/40 text-foreground hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer max-w-full"
                              >
                                <span className="truncate">{ev.name}</span>
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setTaskToDelete(task);
                        }}
                        aria-label={`Delete ${task.name}`}
                        className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer flex-shrink-0"
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
                  );
                })}
              </div>
            </>
          ))}

        {activeTab === "annotators" && (
          <div className="space-y-4">
            {/* Add annotator form */}
            <form
              onSubmit={handleAddAnnotator}
              className="flex flex-col sm:flex-row gap-2 sm:gap-3"
            >
              <input
                type="text"
                value={newAnnotatorName}
                onChange={(e) => {
                  setNewAnnotatorName(e.target.value);
                  if (addError) setAddError(null);
                }}
                placeholder="Annotator name"
                disabled={isAdding}
                className={`flex-1 max-w-md h-9 md:h-10 px-3 rounded-md text-sm md:text-base border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent disabled:opacity-50 disabled:cursor-not-allowed ${
                  addError ? "border-red-500" : "border-border"
                }`}
              />
              <button
                type="submit"
                disabled={!newAnnotatorName.trim() || isAdding}
                className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isAdding ? "Adding..." : "Add"}
              </button>
            </form>

            {addError && <p className="text-sm text-red-500">{addError}</p>}

            {/* Annotator list */}
            {annotatorsLoading ? (
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
                Loading annotators
              </div>
            ) : annotatorsError ? (
              <div className="rounded-md border border-border bg-muted/20 p-4 text-sm text-red-500">
                {annotatorsError}
              </div>
            ) : annotators.length === 0 ? (
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
                      d="M15 19.128a9.38 9.38 0 002.625.372 9.337 9.337 0 004.121-.952 4.125 4.125 0 00-7.533-2.493M15 19.128v-.003c0-1.113-.285-2.16-.786-3.07M15 19.128v.106A12.318 12.318 0 018.624 21c-2.331 0-4.512-.645-6.374-1.766l-.001-.109a6.375 6.375 0 0111.964-3.07M12 6.375a3.375 3.375 0 11-6.75 0 3.375 3.375 0 016.75 0zm8.25 2.25a2.625 2.625 0 11-5.25 0 2.625 2.625 0 015.25 0z"
                    />
                  </svg>
                }
                title="No annotators yet"
                description="Add annotators above so they can be assigned to labelling tasks"
              />
            ) : (
              <>
                {/* Desktop table */}
                <div className="hidden md:block border border-border rounded-xl overflow-hidden">
                  <div className="grid grid-cols-[minmax(0,1fr)_120px_180px_40px] gap-4 px-4 py-2 border-b border-border bg-muted/30">
                    <div className="text-sm font-medium text-muted-foreground">
                      Name
                    </div>
                    <div className="text-sm font-medium text-muted-foreground">
                      Jobs
                    </div>
                    <div className="text-sm font-medium text-muted-foreground">
                      Current agreement
                    </div>
                    <div />
                  </div>
                  {annotators.map((annotator) => {
                    const agreement = annotator.current_agreement;
                    return (
                      <div
                        key={annotator.uuid}
                        onClick={() =>
                          router.push(
                            `/human-labelling/annotators/${annotator.uuid}`,
                          )
                        }
                        className="grid grid-cols-[minmax(0,1fr)_120px_180px_40px] gap-4 px-4 py-3 border-b border-border last:border-b-0 hover:bg-muted/20 transition-colors cursor-pointer items-center"
                      >
                        <p className="text-sm font-medium text-foreground truncate">
                          {annotator.name}
                        </p>
                        <p className="text-sm text-muted-foreground tabular-nums">
                          {annotator.jobs_count ?? 0}
                        </p>
                        <p
                          className={`text-sm font-semibold tabular-nums ${agreementColor(agreement)}`}
                        >
                          {agreement != null
                            ? `${Math.round(agreement * 100)}%`
                            : "—"}
                        </p>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setAnnotatorToDelete(annotator);
                          }}
                          aria-label={`Remove ${annotator.name}`}
                          title="Remove annotator"
                          className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer"
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
                    );
                  })}
                </div>

                {/* Mobile cards */}
                <div className="md:hidden space-y-2">
                  {annotators.map((annotator) => {
                    const agreement = annotator.current_agreement;
                    return (
                      <div
                        key={annotator.uuid}
                        onClick={() =>
                          router.push(
                            `/human-labelling/annotators/${annotator.uuid}`,
                          )
                        }
                        className="border border-border rounded-xl p-4 hover:bg-muted/20 transition-colors cursor-pointer flex items-start gap-3"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate mb-1">
                            {annotator.name}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {annotator.jobs_count ?? 0} job
                            {(annotator.jobs_count ?? 0) === 1 ? "" : "s"}
                            {" · "}
                            <span
                              className={`font-semibold tabular-nums ${agreementColor(agreement)}`}
                            >
                              {agreement != null
                                ? `${Math.round(agreement * 100)}% agreement`
                                : "No agreement yet"}
                            </span>
                          </p>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setAnnotatorToDelete(annotator);
                          }}
                          aria-label={`Remove ${annotator.name}`}
                          className="w-8 h-8 flex items-center justify-center rounded-md text-muted-foreground hover:text-red-500 hover:bg-red-500/10 transition-colors cursor-pointer flex-shrink-0"
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
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {createDialogOpen && accessToken && (
        <CreateLabellingTaskDialog
          accessToken={accessToken}
          onClose={() => setCreateDialogOpen(false)}
          onCreated={(taskUuid) => {
            setCreateDialogOpen(false);
            router.push(`/human-labelling/tasks/${taskUuid}`);
          }}
        />
      )}

      <DeleteConfirmationDialog
        isOpen={!!taskToDelete}
        onClose={() => {
          if (!isDeletingTask) setTaskToDelete(null);
        }}
        onConfirm={handleConfirmDeleteTask}
        title="Delete labelling task"
        message={
          taskToDelete
            ? `Delete "${taskToDelete.name}"? All items, jobs, and annotations in this task will be lost. This cannot be undone.`
            : ""
        }
        confirmText="Delete"
        isDeleting={isDeletingTask}
      />

      <DeleteConfirmationDialog
        isOpen={!!annotatorToDelete}
        onClose={() => {
          if (!isDeleting) setAnnotatorToDelete(null);
        }}
        onConfirm={handleConfirmDelete}
        title="Remove annotator"
        message={
          annotatorToDelete
            ? `Are you sure you want to remove "${annotatorToDelete.name}"?`
            : ""
        }
        confirmText="Remove"
        isDeleting={isDeleting}
      />
    </AppLayout>
  );
}

type SeriesRow = {
  key: string;
  name: string;
  color: string;
  current: number | null;
  pairCount: number;
  series: AgreementSeriesPoint[];
  evaluatorType?: "llm" | "stt" | "tts" | "simulation";
  emptyTitle: string;
  emptyDescription: string;
};

const EVAL_COLORS = [
  "#3b82f6",
  "#a855f7",
  "#06b6d4",
  "#ec4899",
  "#f59e0b",
  "#14b8a6",
  "#6366f1",
];

type SortKey = "name" | "current";

function AgreementOverview({
  agreement,
  agreementLoading,
  agreementError,
  bucket,
  selectedTaskId,
  onSelectTask,
  taskOptions,
  tasks,
}: {
  agreement: AgreementResponse | null;
  agreementLoading: boolean;
  agreementError: string | null;
  bucket: Bucket;
  selectedTaskId: string;
  onSelectTask: (id: string) => void;
  taskOptions: LabellingTaskSummary[];
  tasks: LabellingTask[];
}) {
  const evaluatorTypeMap = (() => {
    const m = new Map<string, "llm" | "stt" | "tts" | "simulation">();
    for (const t of tasks) {
      for (const ev of t.evaluators ?? []) {
        const type = ev.evaluator_type ?? t.type;
        if (type && !m.has(ev.uuid)) m.set(ev.uuid, type);
      }
    }
    return m;
  })();
  const [sortKey, setSortKey] = useState<SortKey>("current");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const rows: SeriesRow[] = (() => {
    if (!agreement) return [];
    const out: SeriesRow[] = [];
    const hh = agreement.human_human;
    out.push({
      key: "human_human",
      name: "Annotator agreement",
      color: "#10b981",
      current: hh?.current ?? null,
      pairCount: hh?.pair_count ?? 0,
      series: hh?.series ?? [],
      emptyTitle: "Not enough annotations yet to compute agreement",
      emptyDescription:
        "Inter-rater agreement will appear here once two or more annotators have labelled at least one of the same items",
    });
    (agreement.evaluators ?? []).forEach((ev, i) => {
      out.push({
        key: ev.evaluator_id,
        name: ev.name,
        color: EVAL_COLORS[i % EVAL_COLORS.length],
        current: ev.current ?? null,
        pairCount: ev.pair_count ?? 0,
        series: ev.series ?? [],
        evaluatorType: evaluatorTypeMap.get(ev.evaluator_id),
        emptyTitle: "Not enough overlap yet to compute alignment",
        emptyDescription: `This evaluator's alignment with humans will appear here once it's been run on items that humans have also labelled`,
      });
    });
    return out;
  })();

  const sorted = [...rows].sort((a, b) => {
    // Pin the inter-rater (human ↔ human) row to the top regardless of
    // sort — it's the baseline every evaluator row is compared against.
    if (a.key === "human_human" && b.key !== "human_human") return -1;
    if (b.key === "human_human" && a.key !== "human_human") return 1;

    // Group evaluators by type so all of the same type sit together.
    // Rows missing a type sort after typed groups; within a group the
    // user's chosen sort applies.
    const aType = a.evaluatorType ?? "";
    const bType = b.evaluatorType ?? "";
    if (aType !== bType) {
      if (!aType) return 1;
      if (!bType) return -1;
      return aType.localeCompare(bType);
    }

    const dir = sortDir === "desc" ? -1 : 1;
    const cmp = (x: number | null, y: number | null) => {
      if (x == null && y == null) return 0;
      if (x == null) return 1; // nulls last
      if (y == null) return -1;
      return x === y ? 0 : x < y ? -1 : 1;
    };
    if (sortKey === "name") return dir * a.name.localeCompare(b.name);
    return dir * cmp(a.current, b.current);
  });

  const buildChartData = (series: AgreementSeriesPoint[]) =>
    series.map((p) => ({
      month: formatBucketLabel(p.bucket_end, bucket),
      agreement: p.agreement == null ? null : Math.round(p.agreement * 100),
    }));

  const toggleRow = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    } else {
      setSortKey(key);
      setSortDir(key === "name" ? "asc" : "desc");
    }
  };

  const hasNoAgreementData =
    rows.length === 0 ||
    rows.every((r) => r.current == null && r.pairCount === 0);

  return (
    <div className="space-y-4 md:space-y-6">
      {agreementError && (
        <div className="rounded-md border border-border bg-muted/20 p-4 text-sm text-red-500">
          {agreementError}
        </div>
      )}

      {!agreementLoading && !hasNoAgreementData && (
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold">Agreement summary</h2>
            <p className="text-xs text-muted-foreground">
              Agreement between annotators, and how closely each evaluator
              aligns with the annotators
            </p>
          </div>
          <Select
            value={selectedTaskId}
            onChange={(e) => onSelectTask(e.target.value)}
            wrapperClassName="w-48"
            className="h-9"
          >
            <option value={ALL_TASKS}>All tasks</option>
            {taskOptions.map((task) => (
              <option key={task.uuid} value={task.uuid}>
                {task.name}
              </option>
            ))}
          </Select>
        </div>
      )}

      {agreementLoading ? (
        <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
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
          Loading agreement
        </div>
      ) : hasNoAgreementData ? (
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
              <br />
              once annotators start labelling and evaluators are run on the
              task items
            </>
          }
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block border border-border rounded-xl overflow-hidden">
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_32px] gap-4 px-4 py-2 border-b border-border bg-muted/30 items-center">
              <SortHeader
                label="Name"
                active={sortKey === "name"}
                dir={sortDir}
                onClick={() => handleSort("name")}
              />
              <div className="text-sm font-medium text-muted-foreground">
                Type
              </div>
              <SortHeader
                label="Current agreement"
                active={sortKey === "current"}
                dir={sortDir}
                onClick={() => handleSort("current")}
              />
              <div />
            </div>
            {sorted.map((row) => {
              const isOpen = expanded.has(row.key);
              const hasData =
                row.series.length > 0 &&
                row.pairCount > 0 &&
                row.current != null;
              return (
                <div
                  key={row.key}
                  className="border-b border-border last:border-b-0"
                >
                  <div
                    onClick={() => toggleRow(row.key)}
                    className="grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_32px] gap-4 px-4 py-3 hover:bg-muted/20 transition-colors cursor-pointer items-center"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {row.key === "human_human" ? (
                        <p className="text-sm font-medium text-foreground truncate">
                          {row.name}
                        </p>
                      ) : (
                        <>
                          <Link
                            href={`/evaluators/${row.key}`}
                            onClick={(e) => e.stopPropagation()}
                            title={`Open ${row.name}`}
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-muted/40 text-foreground hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer truncate max-w-full min-w-0"
                          >
                            <span className="truncate">{row.name}</span>
                          </Link>
                          <span className="text-sm font-medium text-foreground shrink-0">
                            alignment
                          </span>
                        </>
                      )}
                    </div>
                    <div>
                      {row.key === "human_human" ? (
                        <HumanTypePill />
                      ) : row.evaluatorType ? (
                        <EvaluatorTypePill evaluatorType={row.evaluatorType} />
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </div>
                    <div
                      className={`text-sm font-semibold tabular-nums ${agreementColor(row.current)}`}
                    >
                      {row.current != null
                        ? `${Math.round(row.current * 100)}%`
                        : "—"}
                    </div>
                    <div className="flex justify-end">
                      <svg
                        className={`w-4 h-4 text-muted-foreground transition-transform ${isOpen ? "rotate-180" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                        />
                      </svg>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="border-t border-border bg-muted/10 p-4">
                      <ExpandedChart
                        hasData={hasData}
                        data={buildChartData(row.series)}
                        color={row.color}
                        seriesName={row.name}
                        emptyTitle={row.emptyTitle}
                        emptyDescription={row.emptyDescription}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Mobile cards */}
          <div className="md:hidden space-y-2">
            {sorted.map((row) => {
              const isOpen = expanded.has(row.key);
              const hasData =
                row.series.length > 0 &&
                row.pairCount > 0 &&
                row.current != null;
              return (
                <div
                  key={row.key}
                  className="border border-border rounded-xl overflow-hidden"
                >
                  <div
                    onClick={() => toggleRow(row.key)}
                    className="p-4 hover:bg-muted/20 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      {row.key === "human_human" ? (
                        <p className="text-sm font-medium text-foreground truncate flex-1">
                          {row.name}
                        </p>
                      ) : (
                        <>
                          <Link
                            href={`/evaluators/${row.key}`}
                            onClick={(e) => e.stopPropagation()}
                            title={`Open ${row.name}`}
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border border-border bg-muted/40 text-foreground hover:bg-muted hover:border-foreground/30 transition-colors cursor-pointer truncate flex-1 min-w-0"
                          >
                            <span className="truncate">{row.name}</span>
                          </Link>
                          <span className="text-sm font-medium text-foreground shrink-0">
                            alignment
                          </span>
                        </>
                      )}
                      {row.key === "human_human" ? (
                        <HumanTypePill />
                      ) : (
                        row.evaluatorType && (
                          <EvaluatorTypePill
                            evaluatorType={row.evaluatorType}
                          />
                        )
                      )}
                      <svg
                        className={`w-4 h-4 text-muted-foreground transition-transform flex-shrink-0 ${isOpen ? "rotate-180" : ""}`}
                        fill="none"
                        viewBox="0 0 24 24"
                        stroke="currentColor"
                        strokeWidth={2}
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                        />
                      </svg>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                      <span
                        className={`text-base font-semibold tabular-nums ${agreementColor(row.current)}`}
                      >
                        {row.current != null
                          ? `${Math.round(row.current * 100)}%`
                          : "—"}
                      </span>
                    </div>
                  </div>
                  {isOpen && (
                    <div className="border-t border-border bg-muted/10 p-4">
                      <ExpandedChart
                        hasData={hasData}
                        data={buildChartData(row.series)}
                        color={row.color}
                        seriesName={row.name}
                        emptyTitle={row.emptyTitle}
                        emptyDescription={row.emptyDescription}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function HumanTypePill() {
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] md:text-[11px] font-medium uppercase tracking-wide bg-green-500/10 text-green-600 dark:text-green-400">
      Human
    </span>
  );
}

function SortHeader({
  label,
  active,
  dir,
  onClick,
  align = "left",
}: {
  label: string;
  active: boolean;
  dir: SortDirection;
  onClick: () => void;
  align?: "left" | "right";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-1 text-sm font-medium transition-colors cursor-pointer w-fit ${
        active
          ? "text-foreground"
          : "text-muted-foreground hover:text-foreground"
      } ${align === "right" ? "justify-self-end" : ""}`}
    >
      {label}
      <svg
        className={`w-3.5 h-3.5 ${active ? "opacity-100" : "opacity-40"}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d={
            dir === "desc"
              ? "M19.5 8.25l-7.5 7.5-7.5-7.5"
              : "M4.5 15.75l7.5-7.5 7.5 7.5"
          }
        />
      </svg>
    </button>
  );
}

function ExpandedChart({
  hasData,
  data,
  color,
  seriesName,
  emptyTitle,
  emptyDescription,
}: {
  hasData: boolean;
  data: Array<{ month: string; agreement: number | null }>;
  color: string;
  seriesName: string;
  emptyTitle: string;
  emptyDescription: string;
}) {
  if (!hasData) {
    return (
      <div className="flex flex-col items-center justify-center text-center h-48 px-6">
        <p className="text-sm font-medium text-foreground">{emptyTitle}</p>
        <p className="text-xs text-muted-foreground mt-1.5 max-w-md">
          {emptyDescription}
        </p>
      </div>
    );
  }
  return (
    <div className="w-full h-56 md:h-64">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="rgba(125,125,125,0.15)"
          />
          <XAxis dataKey="month" fontSize={11} />
          <YAxis domain={[0, 100]} fontSize={11} unit="%" />
          <Tooltip
            contentStyle={{
              background: "var(--background, #fff)",
              border: "1px solid rgba(125,125,125,0.2)",
              borderRadius: 8,
              fontSize: 12,
            }}
          />
          <Line
            type="monotone"
            dataKey="agreement"
            name={seriesName}
            stroke={color}
            strokeWidth={2}
            dot={{ r: 3 }}
            connectNulls={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
