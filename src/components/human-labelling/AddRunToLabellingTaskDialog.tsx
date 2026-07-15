"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { apiClient, unwrapList } from "@/lib/api";
import { reportError } from "@/lib/reportError";
import { useAccessToken } from "@/hooks/useAccessToken";
import type { TestCaseResult } from "@/components/TestRunnerDialog";
import type { BenchmarkModelResult } from "@/components/eval-details";
import type {
  TestCaseHistory,
  TestRunEvaluator,
} from "@/components/test-results/shared";
import { Select } from "@/components/ui/Select";

// Each source kind maps to exactly one task type: llm tests/benchmarks → "llm",
// STT runs → "stt", TTS runs → "tts", simulation runs → "conversation" (their
// transcript is a conversation). The type is derived from the source
// (`targetTaskTypeForSource`), never chosen by the user.
export const SUPPORTED_TARGET_TASK_TYPES = [
  "llm",
  "stt",
  "tts",
  "conversation",
] as const;
export type SupportedTaskType = (typeof SUPPORTED_TARGET_TASK_TYPES)[number];

/** A run evaluator reference — only the uuid is used by this dialog. */
export type SourceEvaluatorRef = { uuid: string; name?: string };

/** A normalised STT result row, pre-mapped by the STT page. */
export type SttLabellingRow = {
  name: string;
  reference_transcript: string;
  predicted_transcript: string;
};

/**
 * A normalised TTS result row, pre-mapped by the TTS page. The synthesized
 * clip lives at `audio_path` (a fetchable URL on the results page); the
 * `text` is the source string that was spoken — the inverse of an STT row.
 */
export type TtsLabellingRow = {
  name: string;
  text: string;
  audio_path: string;
};

/**
 * A normalised simulation result, pre-mapped by the simulation run page. The
 * transcript shape is permissive (role is a free string) so raw simulation
 * `TranscriptEntry[]` assigns directly; the conversation item pane normalises
 * roles itself when rendering.
 */
export type ConversationLabellingResult = {
  name: string;
  transcript: Array<{
    role: string;
    content?: string;
    tool_calls?: unknown;
    tool_call_id?: string;
    created_at?: string;
  }>;
};

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
    }
  | {
      type: "stt_run";
      runUuid: string;
      runName?: string;
      rows: SttLabellingRow[];
      evaluators?: SourceEvaluatorRef[];
    }
  | {
      type: "tts_run";
      runUuid: string;
      runName?: string;
      rows: TtsLabellingRow[];
      evaluators?: SourceEvaluatorRef[];
    }
  | {
      type: "simulation_run";
      runUuid: string;
      runName?: string;
      results: ConversationLabellingResult[];
      evaluators?: SourceEvaluatorRef[];
    };

/** The single task type each source kind targets. */
export function targetTaskTypeForSource(
  source: AddRunToLabellingTaskSource,
): SupportedTaskType {
  switch (source.type) {
    case "stt_run":
      return "stt";
    case "tts_run":
      return "tts";
    case "simulation_run":
      return "conversation";
    default:
      return "llm";
  }
}

/** Singular / plural noun for the items being submitted, per source kind. */
export function itemNounForSource(source: AddRunToLabellingTaskSource): {
  one: string;
  many: string;
} {
  switch (source.type) {
    case "stt_run":
    case "tts_run":
      return { one: "result", many: "results" };
    case "simulation_run":
      return { one: "conversation", many: "conversations" };
    default:
      return { one: "test", many: "tests" };
  }
}

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

// `name` is required (unique within a task; used for conflict handling). The
// rest of the payload shape depends on the task type: llm items carry
// `chat_history` / `agent_response` / `evaluator_variables`, stt items carry
// `reference_transcript` / `predicted_transcript`, conversation items carry
// `transcript`.
type BuiltItem = {
  payload: {
    name: string;
    description?: string;
    [key: string]: unknown;
  };
};

type TransformResult = {
  items: BuiltItem[];
  skippedCount: number;
  evaluatorUuids: Set<string>;
};

// The backend wraps failures as `Request failed: <status> - <json>`. The
// json's `detail` is sometimes a plain string and sometimes a structured
// object (`{ code, message, ... }`). Pull out the JSON body once so callers
// can both render a clean message and inspect a machine-readable `code`.
type ApiErrorDetail = {
  code?: string;
  message?: string;
  conflicting_names?: string[];
};

function extractApiErrorDetail(err: unknown): ApiErrorDetail | null {
  if (!(err instanceof Error)) return null;
  const match = err.message.match(/Request failed: \d+ - (.+)$/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    const detail = parsed?.detail;
    if (detail && typeof detail === "object") return detail as ApiErrorDetail;
    if (typeof detail === "string") return { message: detail };
  } catch {
    // not JSON
  }
  return { message: match[1] };
}

function parseApiError(err: unknown, fallback: string): string {
  const detail = extractApiErrorDetail(err);
  if (detail?.message) return detail.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
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
  judge_results?: Array<{
    evaluator_uuid?: string | null;
    variable_values?: Record<string, string> | null;
  }> | null;
};

/** Response (next-reply) tests can be added to LLM labelling tasks; tool-call tests cannot. */
export function isLabellingEligibleRaw(raw: RawTestCaseLike): boolean {
  return raw.test_case?.evaluation?.type === "response";
}

function buildOneItem(
  raw: RawTestCaseLike,
  nameOverride?: string,
): { item: BuiltItem; evaluatorUuids: string[] } | null {
  if (!isLabellingEligibleRaw(raw)) return null;

  const name =
    nameOverride ??
    raw.test_case?.name ??
    raw.test_name ??
    raw.name ??
    "Untitled test";

  const chat_history = raw.test_case?.config?.history ?? raw.chat_history ?? [];
  const agent_response = raw.output?.response ?? "";

  const evaluator_variables: Record<string, Record<string, string>> = {};
  const evaluatorUuids: string[] = [];
  // judge_results is the result-level echo populated for every response
  // test; test_case.evaluators is a config-level echo that may be absent.
  // Prefer judge_results and fall back to test_case.evaluators so we don't
  // lose variable values on either shape.
  for (const jr of raw.judge_results ?? []) {
    const uuid = jr?.evaluator_uuid ?? null;
    if (!uuid) continue;
    evaluatorUuids.push(uuid);
    if (jr?.variable_values && typeof jr.variable_values === "object") {
      evaluator_variables[uuid] = { ...jr.variable_values };
    }
  }
  for (const ref of raw.test_case?.evaluators ?? []) {
    const uuid = ref?.evaluator_uuid ?? ref?.uuid ?? null;
    if (!uuid) continue;
    evaluatorUuids.push(uuid);
    if (
      !evaluator_variables[uuid] &&
      ref?.variable_values &&
      typeof ref.variable_values === "object"
    ) {
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
): TransformResult {
  const items: BuiltItem[] = [];
  const evaluatorUuids = new Set<string>();
  let skippedCount = 0;

  switch (source.type) {
    case "test_run":
    case "benchmark_run": {
      const runSuffix =
        source.type === "test_run"
          ? source.runUuid.slice(0, 8)
          : source.benchmarkUuid.slice(0, 8);
      if (source.type === "test_run") {
        for (const r of source.results) {
          const raw = r as RawTestCaseLike;
          const baseName =
            raw.test_case?.name ?? raw.test_name ?? raw.name ?? "Untitled test";
          const built = buildOneItem(raw, `${baseName} — ${runSuffix}`);
          if (!built) {
            skippedCount += 1;
            continue;
          }
          items.push(built.item);
          for (const id of built.evaluatorUuids) evaluatorUuids.add(id);
        }
      } else {
        for (const mr of source.modelResults) {
          const testResults = mr.test_results ?? [];
          for (const r of testResults) {
            const raw = r as RawTestCaseLike;
            const baseName =
              raw.test_case?.name ??
              raw.test_name ??
              raw.name ??
              "Untitled test";
            const built = buildOneItem(
              raw,
              `${baseName} — ${runSuffix} — ${mr.model}`,
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
      // `evaluatorUuids` is built from the SELECTED tests' per-test echoes
      // (judge_results / test_case.evaluators), so the evaluator set — and
      // therefore the task filter and new-task evaluator_ids — reflects only
      // the tests being submitted. Fall back to the run-level evaluators[]
      // only when those echoes are entirely absent (sparse run payloads), so
      // we never produce an item set with zero evaluators.
      if (evaluatorUuids.size === 0) {
        for (const ev of source.evaluators ?? []) {
          if (ev?.uuid) evaluatorUuids.add(ev.uuid);
        }
      }
      return { items, skippedCount, evaluatorUuids };
    }
    case "stt_run": {
      // STT results carry no per-row judge variable echoes, so the evaluator
      // set comes wholesale from the run-level evaluators.
      for (const row of source.rows) {
        items.push({
          payload: {
            name: row.name,
            reference_transcript: row.reference_transcript,
            predicted_transcript: row.predicted_transcript,
          },
        });
      }
      for (const ev of source.evaluators ?? []) {
        if (ev?.uuid) evaluatorUuids.add(ev.uuid);
      }
      return { items, skippedCount, evaluatorUuids };
    }
    case "tts_run": {
      // TTS results carry no per-row judge variable echoes either, so the
      // evaluator set comes wholesale from the run-level evaluators. Each
      // item pairs the source `text` with the synthesized `audio_path`.
      for (const row of source.rows) {
        items.push({
          payload: {
            name: row.name,
            text: row.text,
            audio_path: row.audio_path,
          },
        });
      }
      for (const ev of source.evaluators ?? []) {
        if (ev?.uuid) evaluatorUuids.add(ev.uuid);
      }
      return { items, skippedCount, evaluatorUuids };
    }
    case "simulation_run": {
      for (const r of source.results) {
        items.push({
          payload: {
            name: r.name,
            transcript: r.transcript,
          },
        });
      }
      for (const ev of source.evaluators ?? []) {
        if (ev?.uuid) evaluatorUuids.add(ev.uuid);
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
    itemsSkipped: number;
  } | null>(null);
  const onAddedFiredRef = useRef(false);

  // Each source kind targets exactly one task type (llm / stt / conversation).
  const targetTaskType: SupportedTaskType = useMemo(
    () => targetTaskTypeForSource(source),
    [source],
  );
  const noun = useMemo(() => itemNounForSource(source), [source]);

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
        const data = await apiClient<unknown>(
          "/annotation-tasks",
          accessToken,
        );
        if (cancelled || !mountedRef.current) return;
        setTasks(unwrapList<LabellingTask>(data));
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

  const transform = useMemo(
    () => buildItemsFromSource(source),
    [source],
  );
  const { items, skippedCount, evaluatorUuids } = transform;

  // First relevance gate: the task must be of the type this source targets.
  const typeMatchedTasks = useMemo(
    () => tasks.filter((t) => t.type === targetTaskType),
    [tasks, targetTaskType],
  );

  // Second relevance gate: the task must already carry (at least) every
  // evaluator the run uses. Items reference these evaluators by uuid in
  // their `evaluator_variables`, so a task missing any of them can't be
  // labelled/evaluated against the full set. `evaluatorUuids` is the union
  // across the run's tests, so this follows any future per-test selection.
  const supportedTasks = useMemo(
    () =>
      typeMatchedTasks.filter((t) => {
        const taskEvals = new Set((t.evaluators ?? []).map((e) => e.uuid));
        for (const id of evaluatorUuids) {
          if (!taskEvals.has(id)) return false;
        }
        return true;
      }),
    [typeMatchedTasks, evaluatorUuids],
  );

  useEffect(() => {
    if (mode !== "existing") return;
    if (supportedTasks.length === 1 && !selectedTaskUuid) {
      setSelectedTaskUuid(supportedTasks[0].uuid);
    }
  }, [mode, supportedTasks, selectedTaskUuid]);

  const selectedTask = useMemo(
    () => supportedTasks.find((t) => t.uuid === selectedTaskUuid) ?? null,
    [supportedTasks, selectedTaskUuid],
  );

  const showExistingTaskPicker =
    !tasksLoading && !tasksError && supportedTasks.length > 0;
  const effectiveMode: Mode = showExistingTaskPicker ? mode : "new";

  useEffect(() => {
    if (!isOpen || tasksLoading || tasksError) return;
    setMode(supportedTasks.length === 0 ? "new" : "existing");
  }, [isOpen, tasksLoading, tasksError, supportedTasks.length]);

  const canSubmit = (() => {
    if (submitting || success) return false;
    if (items.length === 0) return false;
    if (effectiveMode === "existing") return !!selectedTaskUuid;
    return newName.trim().length > 0;
  })();

  const handleSubmit = async () => {
    if (!canSubmit || !accessToken) return;
    if (effectiveMode === "new" && !newName.trim()) {
      setNameInvalid(true);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      let taskUuid: string;
      let taskName: string;

      if (effectiveMode === "new") {
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

      // `payload.name` is unique within a task, so re-adding the same run's
      // tests conflicts. The backend reports the exact `conflicting_names`;
      // drop those and retry with the rest so partial re-adds still go
      // through instead of failing the whole batch.
      let toPost = items;
      let itemsSkipped = 0;
      try {
        await apiClient(`/annotation-tasks/${taskUuid}/items`, accessToken, {
          method: "POST",
          body: { items: toPost },
        });
      } catch (err) {
        const detail = extractApiErrorDetail(err);
        if (
          detail?.code !== "ITEM_NAME_CONFLICT" ||
          !Array.isArray(detail.conflicting_names)
        ) {
          throw err;
        }
        const conflicting = new Set(detail.conflicting_names);
        toPost = items.filter((i) => !conflicting.has(i.payload.name));
        itemsSkipped = items.length - toPost.length;
        if (toPost.length === 0) {
          if (!mountedRef.current) return;
          setSubmitError(
            items.length === 1
              ? `This ${noun.one} is already in the task`
              : `All ${items.length} ${noun.many} are already in the task`,
          );
          setSubmitting(false);
          return;
        }
        await apiClient(`/annotation-tasks/${taskUuid}/items`, accessToken, {
          method: "POST",
          body: { items: toPost },
        });
      }

      if (!mountedRef.current) return;
      setSuccess({
        taskUuid,
        taskName,
        itemsCreated: toPost.length,
        itemsSkipped,
      });
      if (onAdded && !onAddedFiredRef.current) {
        onAddedFiredRef.current = true;
        onAdded(taskUuid, toPost.length);
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

  const actionLabel =
    effectiveMode === "new" ? "Create task & add" : "Add to task";

  // "the evaluator" for one, "all N evaluators" for many — avoids the awkward
  // "all 1 evaluator" phrasing on single-evaluator runs.
  const evaluatorPhrase =
    evaluatorUuids.size === 1
      ? "the evaluator"
      : `all ${evaluatorUuids.size} evaluators`;

  const noExistingTasksMessage =
    evaluatorUuids.size > 0
      ? `No existing tasks were found that include ${evaluatorPhrase} in the selected ${noun.many}.`
      : "No existing labelling tasks were found.";

  const newTaskForm = (
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
          placeholder="e.g. Copilot review — May batch"
          disabled={submitting}
          className={`w-full h-10 px-3 rounded-md text-sm border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent disabled:opacity-50 disabled:cursor-not-allowed ${
            nameInvalid ? "border-red-500" : "border-border"
          }`}
        />
        {nameInvalid && (
          <p className="mt-1 text-sm text-red-500">Name is required.</p>
        )}
      </div>
      <div>
        <label className="block text-sm font-medium mb-2">Description</label>
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
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="w-full max-w-md rounded-xl bg-background border border-border p-6 shadow-xl max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-4">
          <h2 className="text-base md:text-lg font-semibold text-foreground">
            Submit {items.length} {items.length === 1 ? noun.one : noun.many} for
            labelling
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
          <div className="space-y-6">
            <p className="text-sm text-foreground">
              Added {success.itemsCreated}{" "}
              {success.itemsCreated === 1 ? noun.one : noun.many} to{" "}
              <span className="font-medium">{success.taskName}</span>.
              {success.itemsSkipped > 0
                ? ` ${success.itemsSkipped} ${
                    success.itemsSkipped === 1 ? noun.one : noun.many
                  } already in the task ${
                    success.itemsSkipped === 1 ? "was" : "were"
                  } skipped.`
                : ""}{" "}
              View the task to start labelling.
            </p>
            <div className="flex items-center justify-end gap-2 md:gap-3">
              <button
                onClick={onClose}
                className="h-9 md:h-10 px-4 rounded-lg text-sm md:text-base font-medium border border-border bg-background dark:bg-muted hover:bg-muted/50 dark:hover:bg-accent transition-colors cursor-pointer"
              >
                Back
              </button>
              <Link
                href={`/human-alignment/tasks/${success.taskUuid}`}
                className="h-9 md:h-10 px-4 flex items-center rounded-lg text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
              >
                View task
              </Link>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {skippedCount > 0 && (
              <div className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2.5 text-sm text-foreground">
                <svg
                  className="w-4 h-4 mt-0.5 shrink-0 text-amber-600 dark:text-amber-400"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M13 16h-1v-4h-1m1-4h.01M12 2a10 10 0 100 20 10 10 0 000-20z"
                  />
                </svg>
                <span>Tool call tests are not added to labelling tasks</span>
              </div>
            )}
            {showExistingTaskPicker && (
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
            )}

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
            ) : showExistingTaskPicker && mode === "existing" ? (
              <div>
                <label className="block text-sm font-medium mb-2">
                  Select the labelling task to add the {noun.many} to
                </label>
                <Select
                  value={selectedTaskUuid}
                  onChange={(e) => setSelectedTaskUuid(e.target.value)}
                  disabled={submitting}
                  className="cursor-pointer disabled:cursor-not-allowed"
                >
                  <option value="">Select a task</option>
                  {supportedTasks.map((t) => (
                    <option key={t.uuid} value={t.uuid}>
                      {t.name}
                      {typeof t.item_count === "number"
                        ? ` (${t.item_count} items)`
                        : ""}
                    </option>
                  ))}
                </Select>
                {evaluatorUuids.size > 0 && (
                  <p className="mt-1.5 text-xs text-muted-foreground">
                    Only tasks that already include {evaluatorPhrase} used by
                    this run are shown
                  </p>
                )}
              </div>
            ) : (
              <>
                {!showExistingTaskPicker && (
                  <p className="text-sm text-muted-foreground">
                    {noExistingTasksMessage}
                  </p>
                )}
                {newTaskForm}
              </>
            )}

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
