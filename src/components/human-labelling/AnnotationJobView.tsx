"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import confetti from "canvas-confetti";
import { getBackendUrl } from "@/lib/api";
import { EvaluatorVerdictCard } from "@/components/EvaluatorVerdictCard";
import { LlmItemPane } from "./item-panes/LlmItemPane";
import { Section } from "./item-panes/shared";
import { SimulationItemPane } from "./item-panes/SimulationItemPane";
import { SttItemPane } from "./item-panes/SttItemPane";

function fireConfetti() {
  if (typeof window === "undefined") return;
  const burst = (originX: number) => {
    confetti({
      particleCount: 80,
      spread: 70,
      startVelocity: 45,
      origin: { x: originX, y: 0.7 },
      colors: ["#22c55e", "#3b82f6", "#a855f7", "#f59e0b", "#ef4444"],
    });
  };
  burst(0.2);
  burst(0.5);
  burst(0.8);
  setTimeout(() => burst(0.5), 250);
}

type Job = {
  uuid: string;
  status: "pending" | "in_progress" | "completed";
  created_at: string;
  completed_at: string | null;
};

type Annotator = { uuid: string; name: string };

export type Task = {
  uuid: string;
  name: string;
  type: "llm" | "stt" | "tts" | "simulation";
  description: string | null;
};

type Evaluator = {
  uuid: string;
  name: string;
  description: string | null;
  evaluator_type: string;
  output_type: "binary" | "rating" | string;
  // Rating bounds returned by the backend (null/absent for binary
  // evaluators). Threaded into EvaluatorVerdictCard so the rating
  // buttons render `scale_min..scale_max` instead of the default 1..5.
  scale_min?: number | null;
  scale_max?: number | null;
};

export type Item = {
  id: number;
  uuid: string;
  task_id: string;
  payload: Record<string, unknown> | unknown;
  created_at: string;
  deleted_at: string | null;
};

type Annotation = {
  uuid: string;
  job_id: string;
  item_id: string;
  evaluator_id: string | null;
  value: { value?: unknown; comment?: unknown } | unknown;
  created_at: string;
  updated_at: string;
};

type JobResponse = {
  job: Job;
  annotator: Annotator;
  task: Task;
  evaluators: Evaluator[];
  items: Item[];
  annotations: Annotation[];
};

type LoadState =
  | { status: "loading" }
  | { status: "ok"; data: JobResponse }
  | { status: "not_found" }
  | { status: "error"; message: string };

type FieldKey = string;
type FieldValue = { value: unknown; comment: string };

function fieldKey(itemId: string, evaluatorId: string): FieldKey {
  return `${itemId}:${evaluatorId}`;
}

function readSavedValue(v: unknown): unknown {
  if (v && typeof v === "object" && "value" in (v as Record<string, unknown>)) {
    return (v as Record<string, unknown>).value;
  }
  return v;
}

function readSavedComment(v: unknown): string {
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    if ("reasoning" in obj && typeof obj.reasoning === "string") {
      return obj.reasoning as string;
    }
    if ("comment" in obj && typeof obj.comment === "string") {
      return obj.comment as string;
    }
  }
  return "";
}

async function publicFetch<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<
  { ok: true; data: T } | { ok: false; status: number; text: string }
> {
  const res = await fetch(`${getBackendUrl()}${path}`, {
    method: init?.method ?? "GET",
    headers: {
      accept: "application/json",
      "ngrok-skip-browser-warning": "true",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init?.body ? JSON.stringify(init.body) : undefined,
  });
  if (!res.ok) {
    let text = "";
    try {
      text = await res.text();
    } catch {
      // ignore
    }
    return { ok: false, status: res.status, text };
  }
  const data = (await res.json()) as T;
  return { ok: true, data };
}

export type AnnotationJobMode = "public" | "admin";

export type AnnotationJobMeta = {
  task: { uuid: string; name: string; type: string };
  annotator: { uuid: string; name: string };
  jobStatus: "pending" | "in_progress" | "completed";
  evaluators: { uuid: string; name: string }[];
};

export function AnnotationJobView({
  token,
  mode,
  fillViewport = true,
  onLoaded,
}: {
  token: string;
  mode: AnnotationJobMode;
  /** Use min-h-screen on the outer wrapper. Set false when embedded in AppLayout. */
  fillViewport?: boolean;
  /** Called once the job data is fetched. Useful for the admin wrapper to render task/annotator info above the card. */
  onLoaded?: (meta: AnnotationJobMeta) => void;
}) {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [fields, setFields] = useState<Record<FieldKey, FieldValue>>({});
  const [savedKeys, setSavedKeys] = useState<Set<FieldKey>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [topError, setTopError] = useState<string | null>(null);

  const initialise = useCallback(
    (data: JobResponse) => {
      const next: Record<FieldKey, FieldValue> = {};
      const saved = new Set<FieldKey>();
      for (const a of data.annotations) {
        if (!a.evaluator_id) continue;
        const k = fieldKey(a.item_id, a.evaluator_id);
        next[k] = {
          value: readSavedValue(a.value),
          comment: readSavedComment(a.value),
        };
        saved.add(k);
      }
      setFields(next);
      setSavedKeys(saved);

      // Admin (read-only) view always starts on the first item — admins
      // are reviewing what's been labelled, not picking up where the
      // annotator left off. Write mode jumps to the first item that
      // still has at least one unlabelled evaluator.
      if (mode === "admin") {
        setCurrentIndex(0);
        return;
      }
      const firstIncomplete = data.items.findIndex((it) =>
        data.evaluators.some((ev) => !saved.has(fieldKey(it.uuid, ev.uuid))),
      );
      setCurrentIndex(firstIncomplete >= 0 ? firstIncomplete : 0);
    },
    [mode],
  );

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    const run = async () => {
      const result = await publicFetch<JobResponse>(
        `/public/annotation-jobs/${encodeURIComponent(token)}`,
      );
      if (cancelled) return;
      if (!result.ok) {
        if (result.status === 404) setState({ status: "not_found" });
        else
          setState({
            status: "error",
            message: `Request failed (${result.status})`,
          });
        return;
      }
      initialise(result.data);
      setState({ status: "ok", data: result.data });
      onLoaded?.({
        task: {
          uuid: result.data.task.uuid,
          name: result.data.task.name,
          type: result.data.task.type,
        },
        annotator: {
          uuid: result.data.annotator.uuid,
          name: result.data.annotator.name,
        },
        jobStatus: result.data.job.status,
        evaluators: result.data.evaluators.map((e) => ({
          uuid: e.uuid,
          name: e.name,
        })),
      });
    };
    run().catch((err) => {
      if (!cancelled)
        setState({
          status: "error",
          message: err instanceof Error ? err.message : "Network error",
        });
    });
    return () => {
      cancelled = true;
    };
  }, [token, initialise, onLoaded]);

  const wrapperClass = fillViewport
    ? "h-screen bg-background text-foreground flex flex-col overflow-hidden"
    : "flex flex-col flex-1 min-h-0";

  if (state.status === "loading") {
    return (
      <div className={`${wrapperClass} items-center justify-center p-6`}>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
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
          Loading
        </div>
      </div>
    );
  }

  if (state.status === "not_found") {
    return (
      <div className={`${wrapperClass} items-center justify-center p-6`}>
        <div className="max-w-md w-full text-center space-y-3">
          <div className="text-5xl font-bold">404</div>
          <h1 className="text-lg font-semibold">Link not found</h1>
          <p className="text-sm text-muted-foreground">
            This annotation link is invalid or has been removed
          </p>
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className={`${wrapperClass} items-center justify-center p-6`}>
        <div className="max-w-md w-full text-center space-y-2">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">{state.message}</p>
        </div>
      </div>
    );
  }

  const { data } = state;
  const isAdmin = mode === "admin";
  const items = data.items;
  const evaluators = data.evaluators;
  const total = items.length;
  const safeIndex = Math.min(Math.max(currentIndex, 0), Math.max(total - 1, 0));
  const currentItem = items[safeIndex];

  return (
    <AnnotateView
      data={data}
      isAdmin={isAdmin}
      currentIndex={safeIndex}
      onJumpTo={setCurrentIndex}
      currentItem={currentItem}
      evaluators={evaluators}
      fields={fields}
      setFields={setFields}
      savedKeys={savedKeys}
      setSavedKeys={setSavedKeys}
      submitting={submitting}
      setSubmitting={setSubmitting}
      topError={topError}
      setTopError={setTopError}
      token={token}
      fillViewport={fillViewport}
      onJobUpdate={(job) => setState({ status: "ok", data: { ...data, job } })}
    />
  );
}

type ViewProps = {
  data: JobResponse;
  isAdmin: boolean;
  fillViewport: boolean;
  currentIndex: number;
  onJumpTo: (i: number) => void;
  currentItem: Item;
  evaluators: Evaluator[];
  fields: Record<FieldKey, FieldValue>;
  setFields: React.Dispatch<React.SetStateAction<Record<FieldKey, FieldValue>>>;
  savedKeys: Set<FieldKey>;
  setSavedKeys: React.Dispatch<React.SetStateAction<Set<FieldKey>>>;
  submitting: boolean;
  setSubmitting: (b: boolean) => void;
  topError: string | null;
  setTopError: (s: string | null) => void;
  token: string;
  onJobUpdate: (job: Job) => void;
};

function AnnotateView({
  data,
  isAdmin,
  fillViewport,
  currentIndex,
  onJumpTo,
  currentItem,
  evaluators,
  fields,
  setFields,
  savedKeys,
  setSavedKeys,
  submitting,
  setSubmitting,
  topError,
  setTopError,
  token,
  onJobUpdate,
}: ViewProps) {
  const items = data.items;
  const total = items.length;
  const isCompleted = data.job.status === "completed";

  const prevStatus = useRef(data.job.status);
  useEffect(() => {
    if (
      !isAdmin &&
      prevStatus.current !== "completed" &&
      data.job.status === "completed"
    ) {
      fireConfetti();
    }
    prevStatus.current = data.job.status;
  }, [data.job.status, isAdmin]);

  const itemCompleted = useCallback(
    (itemId: string) =>
      evaluators.every((ev) => savedKeys.has(fieldKey(itemId, ev.uuid))),
    [evaluators, savedKeys],
  );

  const setField = (key: FieldKey, partial: Partial<FieldValue>) => {
    setFields((prev) => ({
      ...prev,
      [key]: {
        value: prev[key]?.value,
        comment: prev[key]?.comment ?? "",
        ...partial,
      },
    }));
  };

  const handleSubmitItem = async () => {
    if (isAdmin) return;
    if (!currentItem || submitting) return;
    setTopError(null);

    const annotationsBody: {
      evaluator_id: string;
      value: Record<string, unknown>;
    }[] = [];
    for (const ev of evaluators) {
      const k = fieldKey(currentItem.uuid, ev.uuid);
      const f = fields[k];
      if (!f || f.value === undefined || f.value === null || f.value === "") {
        return;
      }
      annotationsBody.push({
        evaluator_id: ev.uuid,
        value: {
          value: f.value,
          ...(f.comment ? { reasoning: f.comment } : {}),
        },
      });
    }

    setSubmitting(true);
    try {
      const result = await publicFetch<{
        saved: string[];
        count: number;
        status: Job["status"];
      }>(`/public/annotation-jobs/${encodeURIComponent(token)}/annotations`, {
        method: "POST",
        body: {
          item_id: currentItem.uuid,
          annotations: annotationsBody,
        },
      });
      if (!result.ok) {
        if (result.status === 400) {
          setTopError("This job has already been marked complete.");
        } else {
          setTopError(`Save failed (${result.status})`);
        }
        return;
      }

      const justSaved = new Set<FieldKey>();
      for (const ev of evaluators) {
        justSaved.add(fieldKey(currentItem.uuid, ev.uuid));
      }
      setSavedKeys((prev) => {
        const next = new Set(prev);
        justSaved.forEach((k) => next.add(k));
        return next;
      });

      if (result.data.status === "completed") {
        onJobUpdate({
          ...data.job,
          status: "completed",
          completed_at: data.job.completed_at ?? new Date().toISOString(),
        });
        return;
      }

      const isItemDone = (itemId: string) =>
        evaluators.every((ev) => {
          const k = fieldKey(itemId, ev.uuid);
          return justSaved.has(k) || savedKeys.has(k);
        });
      const nextIncomplete = items.findIndex(
        (it, i) => i !== currentIndex && !isItemDone(it.uuid),
      );
      if (nextIncomplete >= 0) onJumpTo(nextIncomplete);
      else if (currentIndex < total - 1) onJumpTo(currentIndex + 1);
    } finally {
      setSubmitting(false);
    }
  };

  const wrapperClass = fillViewport
    ? "h-screen bg-background text-foreground flex flex-col overflow-hidden"
    : "flex flex-col flex-1 min-h-0";

  return (
    <div className={wrapperClass}>
      <header className="border-b border-border px-4 md:px-6 py-3 flex flex-col gap-3 md:grid md:grid-cols-3 md:items-center md:gap-4">
        <div className="min-w-0">
          {!isAdmin && (
            <>
              <div className="flex items-center gap-2 min-w-0">
                <h1 className="text-base md:text-lg font-semibold truncate">
                  {data.task.name}
                </h1>
                {isCompleted && (
                  <span className="shrink-0 inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium border border-green-200 bg-green-100 text-green-700 dark:border-green-500/30 dark:bg-green-500/20 dark:text-green-400">
                    <svg
                      className="w-3 h-3"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={3}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="M5 13l4 4L19 7"
                      />
                    </svg>
                    Completed
                  </span>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                {data.annotator.name}
              </p>
            </>
          )}
        </div>
        <div className="flex items-center justify-center gap-2 flex-wrap">
          <button
            onClick={() => onJumpTo(Math.max(0, currentIndex - 1))}
            disabled={currentIndex === 0}
            className="h-9 px-3 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Previous
          </button>
          <span className="text-sm text-muted-foreground tabular-nums px-2">
            Item {Math.min(currentIndex + 1, Math.max(total, 1))} of {total}
          </span>
          <button
            onClick={() => onJumpTo(Math.min(total - 1, currentIndex + 1))}
            disabled={currentIndex >= total - 1}
            className="h-9 px-3 rounded-md text-sm font-medium border border-border bg-background hover:bg-muted/50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Next
          </button>
        </div>
        <div className="flex justify-stretch md:justify-end [&>button]:w-full md:[&>button]:w-auto">
          {!isAdmin &&
            (() => {
              const currentItemSaved = currentItem
                ? evaluators.every((ev) =>
                    savedKeys.has(fieldKey(currentItem.uuid, ev.uuid)),
                  )
                : false;
              const unsavedCount = items.reduce(
                (n, it) =>
                  evaluators.every((ev) =>
                    savedKeys.has(fieldKey(it.uuid, ev.uuid)),
                  )
                    ? n
                    : n + 1,
                0,
              );
              const isLastUnsaved =
                !!currentItem && !currentItemSaved && unsavedCount === 1;
              const allEvaluatorsAnswered =
                !!currentItem &&
                evaluators.length > 0 &&
                evaluators.every((ev) => {
                  const f = fields[fieldKey(currentItem.uuid, ev.uuid)];
                  return (
                    f &&
                    f.value !== undefined &&
                    f.value !== null &&
                    f.value !== ""
                  );
                });
              const disabled =
                submitting || total === 0 || !allEvaluatorsAnswered;
              const label = submitting
                ? "Saving..."
                : currentItemSaved
                  ? "Update"
                  : isLastUnsaved
                    ? "Mark as complete"
                    : "Submit & Next";
              const tooltip = !allEvaluatorsAnswered
                ? "Judgements should be given for all evaluators before submitting"
                : undefined;
              return (
                <button
                  onClick={handleSubmitItem}
                  disabled={disabled}
                  title={tooltip}
                  className="h-9 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {label}
                </button>
              );
            })()}
        </div>
      </header>

      {topError && (
        <div className="mx-4 md:mx-6 mt-3 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-500">
          {topError}
        </div>
      )}

      <div className="flex-1 flex flex-col md:flex-row min-h-0">
        <aside className="w-full md:w-20 max-h-32 md:max-h-none border-b md:border-b-0 md:border-r border-border bg-muted/20 overflow-y-auto">
          <div className="p-2 md:p-3 grid grid-cols-8 md:grid-cols-1 gap-2">
            {items.map((it, i) => {
              const done = itemCompleted(it.uuid);
              const isCurrent = i === currentIndex;
              return (
                <button
                  key={it.uuid}
                  onClick={() => onJumpTo(i)}
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

        <main className="flex-1 min-h-0 flex flex-col md:flex-row overflow-y-auto md:overflow-hidden">
          {!currentItem ? (
            <div className="flex items-center justify-center h-full p-8 text-sm text-muted-foreground w-full">
              No items in this job.
            </div>
          ) : data.task.type === "stt" ? (
            // STT shows two short transcripts side-by-side; keep a single
            // outer scroll container so they stay vertically aligned.
            <div className="p-4 md:p-6 grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6 w-full md:overflow-y-auto">
              <ItemPane item={currentItem} taskType={data.task.type} />
              <EvaluatorsPane
                evaluators={evaluators}
                item={currentItem}
                fields={fields}
                setField={setField}
                readOnly={isAdmin}
              />
            </div>
          ) : (
            // LLM / simulation: long conversation on the left, evaluators
            // on the right. Each panel scrolls independently so the
            // evaluator controls stay visible while the annotator scrolls
            // through history.
            <>
              <div
                className={`${
                  isAdmin ? "md:flex-[6]" : "md:flex-[7]"
                } md:min-h-0 md:overflow-y-auto md:border-r border-border p-4 md:p-6`}
              >
                <ItemPane item={currentItem} taskType={data.task.type} />
              </div>
              <div
                className={`${
                  isAdmin ? "md:flex-[4]" : "md:flex-[3]"
                } md:min-h-0 md:overflow-y-auto p-4 md:p-6`}
              >
                <EvaluatorsPane
                  evaluators={evaluators}
                  item={currentItem}
                  fields={fields}
                  setField={setField}
                  readOnly={isAdmin}
                />
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export function ItemPane({
  item,
  taskType,
}: {
  item: Item;
  taskType: Task["type"];
}) {
  const payload = (item.payload ?? {}) as Record<string, unknown>;
  if (taskType === "stt") return <SttItemPane payload={payload} />;
  if (taskType === "llm") return <LlmItemPane payload={payload} />;
  if (taskType === "simulation")
    return <SimulationItemPane payload={payload} />;
  return (
    <div className="space-y-2">
      <Section title="Item payload">
        <pre className="text-xs font-mono whitespace-pre-wrap break-words text-muted-foreground">
          {JSON.stringify(payload, null, 2)}
        </pre>
      </Section>
    </div>
  );
}

function EvaluatorsPane({
  evaluators,
  item,
  fields,
  setField,
  readOnly,
}: {
  evaluators: Evaluator[];
  item: Item;
  fields: Record<FieldKey, FieldValue>;
  setField: (key: FieldKey, partial: Partial<FieldValue>) => void;
  readOnly: boolean;
}) {
  if (evaluators.length === 0) {
    return (
      <div className="border border-border rounded-xl p-4 text-sm text-muted-foreground">
        No evaluators are attached to this task.
      </div>
    );
  }

  // Per-item, per-evaluator variable values live on
  // `payload.evaluator_variables[<evaluator_uuid>]`. Surface them on
  // each card so annotators (and admins reviewing) can see the criteria
  // / variable values they're judging against.
  const itemPayload = (item.payload ?? {}) as Record<string, unknown>;
  const itemEvaluatorVariables = (() => {
    const raw = itemPayload.evaluator_variables;
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
    const out: Record<string, Record<string, string>> = {};
    for (const [evUuid, vals] of Object.entries(
      raw as Record<string, unknown>,
    )) {
      if (!vals || typeof vals !== "object" || Array.isArray(vals)) continue;
      const inner: Record<string, string> = {};
      for (const [k, v] of Object.entries(vals as Record<string, unknown>)) {
        if (typeof v === "string") inner[k] = v;
        else if (v != null) inner[k] = String(v);
      }
      out[evUuid] = inner;
    }
    return out;
  })();

  return (
    <div className="space-y-3 pb-4 md:pb-6">
      {evaluators.map((ev) => {
        const k = fieldKey(item.uuid, ev.uuid);
        const f = fields[k];
        const variableValues = itemEvaluatorVariables[ev.uuid];
        const outputType =
          ev.output_type === "binary" || ev.output_type === "rating"
            ? ev.output_type
            : null;
        if (!outputType) {
          return (
            <div
              key={ev.uuid}
              className="border border-border rounded-xl p-4 space-y-2"
            >
              <h3 className="text-sm font-semibold">{ev.name}</h3>
              <p className="text-xs text-muted-foreground">
                Unsupported evaluator type ({ev.output_type})
              </p>
            </div>
          );
        }

        const scaleMin =
          typeof ev.scale_min === "number" ? ev.scale_min : undefined;
        const scaleMax =
          typeof ev.scale_max === "number" ? ev.scale_max : undefined;

        if (readOnly) {
          // Admin / "view submitted" surface — show the verdict the
          // annotator picked (and any reasoning) using the read view.
          return (
            <EvaluatorVerdictCard
              key={ev.uuid}
              mode="read"
              name={ev.name}
              description={ev.description}
              outputType={outputType}
              evaluatorUuid={ev.uuid}
              scaleMin={scaleMin}
              scaleMax={scaleMax}
              variableValues={variableValues}
              match={
                outputType === "binary" && typeof f?.value === "boolean"
                  ? f.value
                  : null
              }
              score={
                outputType === "rating" && typeof f?.value === "number"
                  ? f.value
                  : null
              }
              reasoning={typeof f?.comment === "string" ? f.comment : null}
            />
          );
        }
        return (
          <EvaluatorVerdictCard
            key={ev.uuid}
            mode="write"
            name={ev.name}
            description={ev.description}
            outputType={outputType}
            evaluatorUuid={ev.uuid}
            scaleMin={scaleMin}
            scaleMax={scaleMax}
            variableValues={variableValues}
            value={f?.value as boolean | number | undefined}
            comment={typeof f?.comment === "string" ? f.comment : ""}
            onValueChange={(v) => setField(k, { value: v })}
            onCommentChange={(s) => setField(k, { comment: s })}
          />
        );
      })}
    </div>
  );
}
