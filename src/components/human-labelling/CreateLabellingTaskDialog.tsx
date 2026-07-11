"use client";

import { useEffect, useMemo, useState } from "react";
import { useHideFloatingButton } from "@/components/AppLayout";
import {
  EVALUATOR_TYPE_LABELS,
  type EvaluatorType,
} from "@/components/EvaluatorPills";
import {
  EvaluatorUseCaseCards,
  EVALUATOR_USE_CASE_OPTIONS,
} from "@/components/evaluators/evaluatorUseCases";
import { apiClient, unwrapList } from "@/lib/api";
import { readNameConflictFromError } from "@/lib/parseBackendError";

// Labelling tasks support every evaluator use case.
type TaskType = Extract<
  EvaluatorType,
  "llm" | "llm-general" | "stt" | "tts" | "conversation"
>;

// Reuse the shared evaluator use-case cards. Same grouping/copy as the
// new-evaluator picker.
const TASK_TYPE_OPTIONS = EVALUATOR_USE_CASE_OPTIONS;

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

type Step = 1 | 2 | 3;
const STEPS: { n: Step; label: string }[] = [
  { n: 1, label: "Details" },
  { n: 2, label: "Type" },
  { n: 3, label: "Evaluators" },
];

export function CreateLabellingTaskDialog({
  accessToken,
  onClose,
  onCreated,
}: CreateLabellingTaskDialogProps) {
  useHideFloatingButton(true);

  const [step, setStep] = useState<Step>(1);
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
  // Duplicate-name 409 messages render inline next to the name field.
  const [nameConflictError, setNameConflictError] = useState<string | null>(
    null,
  );

  // Fetch evaluator list once on mount; filter client-side by selected type.
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      setEvaluatorsLoading(true);
      setEvaluatorsError(null);
      try {
        const data = await apiClient<unknown>(
          "/evaluators?include_defaults=true",
          accessToken,
        );
        if (!cancelled) setEvaluators(unwrapList<EvaluatorListItem>(data));
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

  // Per-step validation. Navigation between steps is free (see stepper +
  // Back/Next), but creating the task still requires every step to be valid.
  const step1Valid = !!name.trim();
  const step2Valid = !!taskType;
  const step3Valid = selectedEvaluatorIds.size >= 1;
  const canSubmit = step1Valid && step2Valid && step3Valid && !submitting;
  const stepValid: Record<Step, boolean> = {
    1: step1Valid,
    2: step2Valid,
    3: step3Valid,
  };

  const handleSubmit = async () => {
    if (!canSubmit || !taskType) return;
    setSubmitting(true);
    setSubmitError(null);
    setNameConflictError(null);
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
      const conflict = readNameConflictFromError(err);
      if (conflict) {
        setNameConflictError(conflict);
        // Surface the conflicting field by returning to the details step.
        setStep(1);
      } else {
        setSubmitError(parseApiError(err, "Failed to create task"));
      }
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-background border border-border rounded-xl w-full max-w-2xl shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header + stepper */}
        <div className="px-5 md:px-6 py-4 border-b border-border">
          <div className="flex items-start justify-between gap-3">
            <h2 className="text-base md:text-lg font-semibold text-foreground">
              Create labelling task
            </h2>
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

          {/* Stepper — each step is clickable to jump freely between stages. */}
          <div className="mt-3 flex items-center gap-2">
            {STEPS.map((s, i) => {
              const active = step === s.n;
              const done = stepValid[s.n] && !active;
              return (
                <div key={s.n} className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(s.n)}
                    className="flex items-center gap-2 cursor-pointer group"
                  >
                    <span
                      className={`flex items-center justify-center w-6 h-6 rounded-full text-xs font-semibold transition-colors ${
                        active
                          ? "bg-foreground text-background"
                          : done
                            ? "bg-teal-500/15 text-teal-700 dark:text-teal-300 border border-teal-500/40"
                            : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {done ? "✓" : s.n}
                    </span>
                    <span
                      className={`text-xs md:text-sm font-medium transition-colors ${
                        active
                          ? "text-foreground"
                          : "text-muted-foreground group-hover:text-foreground"
                      }`}
                    >
                      {s.label}
                    </span>
                  </button>
                  {i < STEPS.length - 1 && (
                    <span className="w-6 h-px bg-border" />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          {step === 1 && (
            <div className="space-y-5">
              <div>
                <label className="block text-sm font-medium mb-2">
                  Name <span className="text-red-500">*</span>
                </label>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    if (nameConflictError) setNameConflictError(null);
                  }}
                  placeholder="e.g. Copilot review — Q2 batch"
                  className={`w-full h-10 px-3 rounded-md text-sm border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent ${
                    nameConflictError ? "border-red-500" : "border-border"
                  }`}
                />
                {nameConflictError && (
                  <p className="mt-1 text-sm text-red-500">
                    {nameConflictError}
                  </p>
                )}
              </div>
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
            </div>
          )}

          {step === 2 && (
            <div>
              <label className="block text-sm font-medium mb-1">
                What are you labelling? <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-muted-foreground mb-3">
                Select carefully as it cannot be changed after the task is
                created
              </p>
              <EvaluatorUseCaseCards
                options={TASK_TYPE_OPTIONS}
                selected={taskType}
                onSelect={(v) => setTaskType(v as TaskType)}
              />
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col min-h-0">
              <label className="block text-sm font-medium mb-2">
                Evaluators <span className="text-red-500">*</span>
                <span className="ml-2 text-xs font-normal text-muted-foreground">
                  ({selectedEvaluatorIds.size} selected)
                </span>
              </label>
              {!taskType ? (
                <div className="rounded-md border border-dashed border-border bg-muted/10 px-4 py-8 text-center text-sm text-muted-foreground">
                  Pick a task type first (step 2) to see matching evaluators.
                </div>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground mb-2">
                    Pick at least one evaluator that annotators will grade
                    against.
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
                      placeholder="Search evaluators"
                      className="w-full h-9 pl-9 pr-3 rounded-md text-sm border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-accent"
                    />
                  </div>

                  <div className="border border-border rounded-md max-h-80 overflow-y-auto divide-y divide-border">
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
                </>
              )}
            </div>
          )}

          {submitError && (
            <div className="mt-5 rounded-md border border-red-500/30 bg-red-500/10 p-3 text-sm text-red-500">
              {submitError}
            </div>
          )}
        </div>

        {/* Footer — dismissal is handled by the header ✕, so no Cancel here. */}
        <div className="flex items-center justify-end gap-2 md:gap-3 px-5 md:px-6 py-4 border-t border-border">
          <div className="flex items-center gap-2 md:gap-3">
            {step > 1 && (
              <button
                onClick={() => setStep((s) => (s - 1) as Step)}
                disabled={submitting}
                className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium border border-border bg-background dark:bg-muted hover:bg-muted/50 dark:hover:bg-accent transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Back
              </button>
            )}
            {step < 3 ? (
              <button
                onClick={() => setStep((s) => (s + 1) as Step)}
                className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
              >
                Next
              </button>
            ) : (
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="h-9 md:h-10 px-4 rounded-md text-sm md:text-base font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? "Creating..." : "Create task"}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
