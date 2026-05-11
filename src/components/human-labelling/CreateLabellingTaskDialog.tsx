"use client";

import { useEffect, useMemo, useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import {
  EVALUATOR_TYPE_LABELS,
  EvaluatorTypePill,
  type EvaluatorType,
} from "@/components/EvaluatorPills";
import { apiClient } from "@/lib/api";

// Only these three task types are allowed for labelling tasks
type TaskType = Extract<EvaluatorType, "llm" | "stt" | "simulation">;

const TASK_TYPE_OPTIONS: {
  value: TaskType;
  title: string;
  description: string;
}[] = [
  {
    value: "llm",
    title: "LLM response",
    description:
      "Given a conversation history, evaluate the agent's next response.",
  },
  {
    value: "stt",
    title: "Speech to Text",
    description: "Evaluate the transcription quality against a reference text.",
  },
  {
    value: "simulation",
    title: "Simulation",
    description:
      "Evaluate the agent's performance in an entire conversation history.",
  },
];

// Per-type tints, mirroring EvaluatorTypePill's palette
// (llm=orange, stt=blue, simulation=pink) so the picker reads as the
// same "type" affordance the user sees on evaluator cards. We use a
// subtle tint by default (so the cards announce their type at rest)
// and a stronger tint + bordered ring when active.
const TASK_TYPE_INACTIVE_CLASSES: Record<TaskType, string> = {
  llm: "border-orange-500/20 bg-orange-500/[0.04] hover:bg-orange-500/10 hover:border-orange-500/40",
  stt: "border-blue-500/20 bg-blue-500/[0.04] hover:bg-blue-500/10 hover:border-blue-500/40",
  simulation:
    "border-pink-500/20 bg-pink-500/[0.04] hover:bg-pink-500/10 hover:border-pink-500/40",
};

const TASK_TYPE_ACTIVE_CLASSES: Record<TaskType, string> = {
  llm: "border-orange-500/60 bg-orange-500/15 ring-1 ring-orange-500/40",
  stt: "border-blue-500/60 bg-blue-500/15 ring-1 ring-blue-500/40",
  simulation: "border-pink-500/60 bg-pink-500/15 ring-1 ring-pink-500/40",
};

const TASK_TYPE_TITLE_CLASSES: Record<TaskType, string> = {
  llm: "text-orange-700 dark:text-orange-300",
  stt: "text-blue-700 dark:text-blue-300",
  simulation: "text-pink-700 dark:text-pink-300",
};

type EvaluatorListItem = {
  uuid: string;
  name: string;
  description?: string;
  evaluator_type?: EvaluatorType;
  owner_user_id?: string | null;
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

type CreateLabellingTaskDialogProps = {
  accessToken: string;
  onClose: () => void;
  onCreated: (taskUuid: string) => void;
};

export function CreateLabellingTaskDialog({
  accessToken,
  onClose,
  onCreated,
}: CreateLabellingTaskDialogProps) {
  useHideFloatingButton(true);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [taskType, setTaskType] = useState<TaskType | null>(null);
  const [selectedEvaluatorIds, setSelectedEvaluatorIds] = useState<Set<string>>(
    new Set(),
  );
  const [evaluatorSearch, setEvaluatorSearch] = useState("");

  const [evaluators, setEvaluators] = useState<EvaluatorListItem[]>([]);
  const [evaluatorsLoading, setEvaluatorsLoading] = useState(false);
  const [evaluatorsError, setEvaluatorsError] = useState<string | null>(null);

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // Fetch evaluator list once on mount; filter client-side by selected type.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setEvaluatorsLoading(true);
      setEvaluatorsError(null);
      try {
        const data = await apiClient<EvaluatorListItem[]>(
          "/evaluators?include_defaults=true",
          accessToken,
        );
        if (!cancelled) setEvaluators(Array.isArray(data) ? data : []);
      } catch (err) {
        if (!cancelled)
          setEvaluatorsError(parseApiError(err, "Failed to load evaluators"));
      } finally {
        if (!cancelled) setEvaluatorsLoading(false);
      }
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  // When the type changes, drop selections that don't belong to the new type.
  useEffect(() => {
    if (!taskType) return;
    setSelectedEvaluatorIds((prev) => {
      const next = new Set<string>();
      for (const ev of evaluators) {
        if (ev.evaluator_type === taskType && prev.has(ev.uuid)) {
          next.add(ev.uuid);
        }
      }
      return next;
    });
  }, [taskType, evaluators]);

  const filteredEvaluators = useMemo(() => {
    if (!taskType) return [];
    const q = evaluatorSearch.trim().toLowerCase();
    return evaluators
      .filter((ev) => ev.evaluator_type === taskType)
      .filter((ev) => (q ? ev.name.toLowerCase().includes(q) : true));
  }, [evaluators, taskType, evaluatorSearch]);

  const toggleEvaluator = (uuid: string) => {
    setSelectedEvaluatorIds((prev) => {
      const next = new Set(prev);
      if (next.has(uuid)) next.delete(uuid);
      else next.add(uuid);
      return next;
    });
  };

  const canSubmit =
    !!name.trim() &&
    !!taskType &&
    !submitting &&
    selectedEvaluatorIds.size >= 1;

  const handleSubmit = async () => {
    if (!canSubmit || !taskType) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body: {
        name: string;
        type: TaskType;
        description?: string;
        evaluator_ids?: string[];
      } = { name: name.trim(), type: taskType };
      if (description.trim()) body.description = description.trim();
      if (selectedEvaluatorIds.size > 0)
        body.evaluator_ids = Array.from(selectedEvaluatorIds);
      const res = await apiClient<{ uuid: string; message: string }>(
        "/annotation-tasks",
        accessToken,
        { method: "POST", body },
      );
      onCreated(res.uuid);
    } catch (err) {
      setSubmitError(parseApiError(err, "Failed to create task"));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4"
      onClick={() => {
        if (!submitting) onClose();
      }}
    >
      <div
        className={`bg-background border border-border rounded-xl w-full ${
          taskType ? "max-w-6xl" : "max-w-2xl"
        } shadow-2xl flex flex-col max-h-[90vh] transition-all`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 px-5 md:px-6 py-4 border-b border-border">
          <div>
            <h2 className="text-base md:text-lg font-semibold text-foreground">
              Create labelling task
            </h2>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer flex-shrink-0 disabled:opacity-50 disabled:cursor-not-allowed"
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

        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {/* When a type is selected we make the left column the
              flow-sized parent and float the right column absolutely
              over its remainder. That way the right column's bottom
              aligns with the bottom of the type-picker cards (left
              column's last child) — never extending past it. */}
          <div className={taskType ? "md:relative" : ""}>
          <div
            className={`min-w-0 space-y-5 ${
              taskType ? "md:max-w-[42rem]" : ""
            }`}
          >
          {/* Name */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Name <span className="text-red-500">*</span>
            </label>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Helpfulness review — Q2 batch"
              className="w-full h-10 px-3 rounded-md text-sm border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent"
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-2">
              Description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Short description of the labelling task"
              rows={3}
              className="w-full px-3 py-2 rounded-md text-sm border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent resize-y"
            />
          </div>

          {/* Type picker */}
          <div>
            <label className="block text-sm font-medium mb-1">
              Type <span className="text-red-500">*</span>
            </label>
            <p className="text-xs text-muted-foreground mb-2">
              Type can&apos;t be changed after the task is created.
            </p>
            <div className="mb-2 flex items-start gap-2.5 p-3 rounded-lg bg-yellow-500/10 border border-yellow-500/20">
              <svg
                className="w-4 h-4 flex-shrink-0 mt-0.5 text-yellow-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                />
              </svg>
              <span className="text-xs md:text-sm text-foreground inline-flex items-center gap-1.5 flex-wrap">
                Human alignment for
                <EvaluatorTypePill evaluatorType="tts" />
                evaluators is not supported yet
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              {TASK_TYPE_OPTIONS.map((opt) => {
                const active = taskType === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setTaskType(opt.value)}
                    className={`flex flex-col items-start text-left p-3 rounded-md border transition-colors cursor-pointer ${
                      active
                        ? TASK_TYPE_ACTIVE_CLASSES[opt.value]
                        : TASK_TYPE_INACTIVE_CLASSES[opt.value]
                    }`}
                  >
                    <div
                      className={`text-sm font-medium ${TASK_TYPE_TITLE_CLASSES[opt.value]}`}
                    >
                      {opt.title}
                    </div>
                    <div className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      {opt.description}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
          </div>

          {/* Evaluator picker — only shown once a type is chosen.
              On md+ this is positioned absolutely so its top/bottom
              align with the left column's content (bottom = bottom of
              the type-picker cards). On mobile it falls back to the
              normal flow underneath. The list inside flexes to fill
              the remaining vertical space. */}
          {taskType && (
            <div
              className="mt-5 md:mt-0 md:absolute md:top-0 md:bottom-0 md:left-[calc(42rem+1.5rem)] md:right-0 flex flex-col md:overflow-hidden"
            >
              <label className="block text-sm font-medium mb-2">
                Evaluators <span className="text-red-500">*</span>
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({selectedEvaluatorIds.size} selected)
                </span>
              </label>
              <p className="text-xs text-muted-foreground mb-2">
                Pick at least one evaluator that annotators will grade against.
              </p>

              <div className="relative mb-2">
                <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                  <svg
                    className="w-4 h-4 text-muted-foreground"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z"
                    />
                  </svg>
                </div>
                <input
                  type="text"
                  value={evaluatorSearch}
                  onChange={(e) => setEvaluatorSearch(e.target.value)}
                  placeholder={`Search evaluators`}
                  className="w-full h-9 pl-9 pr-3 rounded-md text-sm border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div className="border border-border rounded-md min-h-0 overflow-y-auto divide-y divide-border">
                {evaluatorsLoading ? (
                  <div className="p-4 flex items-center gap-2 text-sm text-muted-foreground">
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
                    Loading evaluators
                  </div>
                ) : evaluatorsError ? (
                  <div className="p-4 text-sm text-red-500">
                    {evaluatorsError}
                  </div>
                ) : filteredEvaluators.length === 0 ? (
                  <div className="p-4 text-sm text-muted-foreground">
                    {evaluatorSearch.trim()
                      ? "No matching evaluators."
                      : `No ${EVALUATOR_TYPE_LABELS[taskType]} evaluators yet.`}
                  </div>
                ) : (
                  filteredEvaluators.map((ev) => {
                    const checked = selectedEvaluatorIds.has(ev.uuid);
                    return (
                      <label
                        key={ev.uuid}
                        className="flex items-start gap-3 px-3 py-2.5 hover:bg-muted/30 transition-colors cursor-pointer"
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleEvaluator(ev.uuid)}
                          className="mt-0.5 w-4 h-4 cursor-pointer accent-foreground"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate">
                            {ev.name}
                          </div>
                          {ev.description && (
                            <div className="text-xs text-muted-foreground line-clamp-2 mt-0.5">
                              {ev.description}
                            </div>
                          )}
                        </div>
                      </label>
                    );
                  })
                )}
              </div>
            </div>
          )}
          </div>

          {submitError && (
            <div
              className={`mt-5 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500`}
            >
              {submitError}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 md:gap-3 px-5 md:px-6 py-4 border-t border-border">
          <button
            onClick={onClose}
            disabled={submitting}
            className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium border border-border bg-background dark:bg-muted hover:bg-muted/50 dark:hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Creating..." : "Create task"}
          </button>
        </div>
      </div>
    </div>
  );
}
