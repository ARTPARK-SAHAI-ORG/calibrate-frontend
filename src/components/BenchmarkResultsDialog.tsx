"use client";
import { reportError } from "@/lib/reportError";

import React, { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import {
  CloseIcon,
  SpinnerIcon,
  ResultPager,
  type TestRunEvaluator,
  type PagerNav,
} from "./test-results/shared";
import {
  BenchmarkOutputsPanel,
  BenchmarkCombinedLeaderboard,
  benchmarkLabellingKey,
  type BenchmarkModelResult,
} from "./eval-details";
import { StatusBadge } from "@/components/ui";
import { getDefaultHeaders } from "@/lib/api";
import { POLLING_INTERVAL_MS } from "@/constants/polling";
import { useHideFloatingButton } from "@/components/AppLayout";
import { ShareButton } from "@/components/ShareButton";
import { ExportResultsButton } from "@/components/ExportResultsButton";
import {
  AddRunToLabellingTaskDialog,
  isLabellingEligibleRaw,
} from "@/components/human-labelling/AddRunToLabellingTaskDialog";
import { useLabellingSelection } from "@/components/human-labelling/useLabellingSelection";
import { buildBenchmarkCsv } from "@/lib/exportTestResults";
import { useAccessToken } from "@/hooks";
import {
  fetchDefaultLLMNextReplyEvaluator,
  type DefaultEvaluatorSummary,
} from "@/lib/defaultEvaluators";
import type { BenchmarkLeaderboardSummaryRow } from "@/lib/benchmarkEvaluatorSummary";

type BenchmarkStatusResponse = {
  task_id: string;
  name?: string;
  status: string;
  model_results?: BenchmarkModelResult[];
  leaderboard_summary?: BenchmarkLeaderboardSummaryRow[];
  /** Top-level per-evaluator metadata block — see TestRunEvaluator. */
  evaluators?: TestRunEvaluator[];
  /** The test uuids this benchmark executed, in run order (shared across all
   * models — not repeated per model). Used to rerun the same subset. Absent on
   * benchmarks that predate the backend snapshot. */
  test_uuids?: string[];
  results_s3_prefix?: string;
  error?: string;
  is_public?: boolean;
  share_token?: string | null;
};

type BenchmarkResultsDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onGoBack?: () => void; // Called when user wants to go back to model selection on error
  agentUuid: string;
  agentName: string;
  testUuids: string[];
  testNames: string[];
  models: string[];
  taskId?: string; // If provided, view existing benchmark results instead of starting new
  onBenchmarkCreated?: (taskId: string) => void; // Called when a new benchmark is created
  // Called when the user clicks "Rerun" on a completed benchmark. Hands the
  // parent the models, the executed test uuids (the subset to rerun), and the
  // test names (for progress display) so it can start a fresh benchmark and
  // open it in a new dialog. Takes precedence over `onGoBack` when provided.
  onRerun?: (
    models: string[],
    testUuids: string[],
    testNames: string[],
  ) => void;
};

export function BenchmarkResultsDialog({
  isOpen,
  onClose,
  onGoBack,
  agentUuid,
  agentName,
  testUuids,
  testNames,
  models,
  taskId,
  onBenchmarkCreated,
  onRerun,
}: BenchmarkResultsDialogProps) {
  // Hide the floating "Talk to Us" button when this dialog is open
  useHideFloatingButton(isOpen);

  const [activeTab, setActiveTab] = useState<"leaderboard" | "outputs">(
    "outputs",
  );
  // Track which providers are expanded
  const [expandedProviders, setExpandedProviders] = useState<Set<string>>(
    new Set(),
  );
  // Track selected test: { model, testIndex }
  const [selectedTest, setSelectedTest] = useState<{
    model: string;
    testIndex: number;
  } | null>(null);
  const [nav, setNav] = useState<PagerNav | null>(null);

  // Loading and data state
  const [isInitialLoading, setIsInitialLoading] = useState(true);
  const [taskStatus, setTaskStatus] = useState<string>("queued");
  const [modelResults, setModelResults] = useState<BenchmarkModelResult[]>([]);
  const [leaderboardSummary, setLeaderboardSummary] = useState<
    BenchmarkLeaderboardSummaryRow[] | undefined
  >(undefined);
  const [error, setError] = useState<string | null>(null);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [runName, setRunName] = useState<string | null>(null);
  const [isPublic, setIsPublic] = useState(false);
  const [shareToken, setShareToken] = useState<string | null>(null);
  const [defaultNextReplyEvaluator, setDefaultNextReplyEvaluator] =
    useState<DefaultEvaluatorSummary | null>(null);
  // Top-level evaluators block from the benchmark response. See the
  // matching state in TestRunnerDialog for the same plumbing.
  const [runEvaluators, setRunEvaluators] = useState<TestRunEvaluator[]>([]);
  // The test uuids this benchmark executed, from the status response. Drives
  // the rerun subset; empty on legacy benchmarks that predate the snapshot.
  const [runTestUuids, setRunTestUuids] = useState<string[]>([]);
  const [addToTaskOpen, setAddToTaskOpen] = useState(false);
  const {
    selected: labellingSelectedKeys,
    toggle: toggleLabellingSelection,
    bulkToggle: toggleLabellingBulk,
    clear: clearLabellingSelection,
  } = useLabellingSelection();
  const backendAccessToken = useAccessToken();
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  /** Once per dialog open: select first test of `models[0]` when its row exists. */
  const hasAutoSelectedFirstBenchmarkTestRef = useRef(false);
  /**
   * Which "open session" we've already kicked off — keyed by `taskId` (or a
   * sentinel for a brand-new run). Stays set across auth-token refreshes so a
   * mid-run token change re-points polling at the SAME run instead of
   * resetting state or launching a duplicate benchmark. Cleared when the
   * dialog closes so the next open starts fresh.
   */
  const initializedSessionRef = useRef<string | null>(null);

  const isDone =
    taskStatus === "completed" ||
    taskStatus === "done" ||
    taskStatus === "failed";

  const labellingModelResults = modelResults
    .map((mr) => ({
      ...mr,
      test_results: (mr.test_results ?? []).filter((_, index) =>
        labellingSelectedKeys.has(benchmarkLabellingKey(mr.model, index)),
      ),
    }))
    .filter((mr) => (mr.test_results?.length ?? 0) > 0);

  useEffect(() => {
    if (!isOpen || !backendAccessToken) return;
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) return;

    let cancelled = false;
    fetchDefaultLLMNextReplyEvaluator(backendUrl, backendAccessToken)
      .then((evaluator) => {
        if (!cancelled) setDefaultNextReplyEvaluator(evaluator);
      })
      .catch(() => {
        if (!cancelled) setDefaultNextReplyEvaluator(null);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, backendAccessToken]);

  // Drive the dialog when it opens. This effect also re-fires when
  // `backendAccessToken` changes, for two reasons:
  //   1. On a fresh mount the token resolves a tick after first render
  //      (localStorage read for email/password login); without re-firing we'd
  //      start polling with a null token and send `Bearer null`.
  //   2. The auth token can silently refresh while the dialog is open.
  // `initializedSessionRef` distinguishes the two cases so a token refresh
  // re-points polling at the in-progress run (with the fresh token) instead of
  // wiping state or launching a duplicate benchmark.
  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

    const beginPolling = (id: string) => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
      if (!backendUrl) {
        setIsInitialLoading(false);
        setError("BACKEND_URL environment variable is not set");
        return;
      }
      pollingIntervalRef.current = setInterval(() => {
        pollBenchmarkStatus(id, backendUrl);
      }, POLLING_INTERVAL_MS);
      pollBenchmarkStatus(id, backendUrl);
    };

    if (isOpen && backendAccessToken) {
      // A new run has no taskId yet — give it a stable sentinel key so token
      // refreshes during the initial run still count as the same session.
      const sessionKey = taskId ?? "__new__";

      if (initializedSessionRef.current === sessionKey) {
        // Same open session, re-firing because the token refreshed. Re-point
        // polling at the active run with the new token — no reset, no relaunch.
        const activeId = taskId ?? currentTaskId;
        if (activeId) beginPolling(activeId);
      } else {
        // First open, or switched to a different run: reset and start fresh.
        initializedSessionRef.current = sessionKey;

        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }

        setIsInitialLoading(true);
        setTaskStatus("queued");
        setModelResults([]);
        setLeaderboardSummary(undefined);
        setRunEvaluators([]);
        setRunTestUuids([]);
        setError(null);
        setExpandedProviders(new Set(models.length > 0 ? [models[0]] : []));
        setSelectedTest(null);
        hasAutoSelectedFirstBenchmarkTestRef.current = false;
        clearLabellingSelection();
        setActiveTab("outputs");
        setIsPublic(false);
        setShareToken(null);
        setCurrentTaskId(taskId ?? null);

        if (taskId) {
          // View existing benchmark - poll the task immediately
          beginPolling(taskId);
        } else if (models.length > 0) {
          // Start a new benchmark
          runBenchmark();
        } else {
          setIsInitialLoading(false);
        }
      }
    } else if (!isOpen) {
      // Dialog closed - clear polling and arm for the next open.
      initializedSessionRef.current = null;
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }
    // else: open but the token hasn't resolved yet — wait for the re-fire.

    // Cleanup on unmount or when dependencies change
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, taskId, backendAccessToken]);

  // Default selection: first test (index 0) of the first model that has
  // `test_results`. When `models` is populated (new run), prefer that order
  // and match by `model` id. When `models` is empty (e.g. past run opened
  // with only `taskId`), use the first API row that has results — the parent
  // often passes `models={[]}` in that case.
  useEffect(() => {
    if (!isOpen || hasAutoSelectedFirstBenchmarkTestRef.current) return;
    if (modelResults.length === 0) return;

    const pickDefaultSelection = (): {
      model: string;
      testIndex: number;
    } | null => {
      if (models.length > 0) {
        for (const modelId of models) {
          const mr = modelResults.find((m) => m.model === modelId);
          if (mr?.test_results && mr.test_results.length > 0) {
            return { model: modelId, testIndex: 0 };
          }
        }
        // Config order vs API label mismatch — first row with results
        const firstWith = modelResults.find(
          (m) => m.test_results && m.test_results.length > 0,
        );
        if (firstWith) return { model: firstWith.model, testIndex: 0 };
        return null;
      }
      const firstWith = modelResults.find(
        (m) => m.test_results && m.test_results.length > 0,
      );
      if (firstWith) return { model: firstWith.model, testIndex: 0 };
      return null;
    };

    const sel = pickDefaultSelection();
    if (!sel) return;

    hasAutoSelectedFirstBenchmarkTestRef.current = true;
    setSelectedTest(sel);
    setExpandedProviders((prev) => {
      const next = new Set(prev);
      next.add(sel.model);
      return next;
    });
  }, [isOpen, models, modelResults]);

  const pollBenchmarkStatus = async (taskId: string, backendUrl: string) => {
    try {
      const response = await fetch(
        `${backendUrl}/agent-tests/benchmark/${taskId}`,
        {
          method: "GET",
          headers: getDefaultHeaders(backendAccessToken),
        },
      );

      if (!response.ok) {
        throw new Error("Failed to poll benchmark status");
      }

      const result: BenchmarkStatusResponse = await response.json();

      // Update task status for display
      setTaskStatus(result.status);

      // Capture name and share state from backend
      if (result.name) setRunName(result.name);
      if (result.is_public !== undefined) setIsPublic(result.is_public);
      if (result.share_token !== undefined)
        setShareToken(result.share_token ?? null);
      // Always sync (including the empty case) so the previous
      // benchmark's evaluator metadata can't leak into a new task in
      // the same dialog lifecycle.
      setRunEvaluators(
        Array.isArray(result.evaluators) ? result.evaluators : [],
      );
      setRunTestUuids(
        Array.isArray(result.test_uuids) ? result.test_uuids : [],
      );

      // Update model results (intermediate or final)
      if (result.model_results) {
        setModelResults(result.model_results);

        // Auto-expand the first provider that has results
        if (result.model_results.length > 0) {
          setExpandedProviders((prev) => {
            if (prev.size === 0) {
              const firstWithResults = result.model_results!.find(
                (m) => m.test_results && m.test_results.length > 0,
              );
              if (firstWithResults) {
                return new Set([firstWithResults.model]);
              }
            }
            return prev;
          });
        }
      }

      // After first response, we're no longer in initial loading
      setIsInitialLoading(false);

      // Check if polling should stop
      if (
        result.status === "completed" ||
        result.status === "failed" ||
        result.status === "done"
      ) {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }

        if (result.error) {
          reportError("Benchmark error:", result.error);
          setError(result.error);
        } else {
          setLeaderboardSummary(result.leaderboard_summary);
          // Switch to leaderboard tab when done
          setActiveTab("leaderboard");
        }
      }
    } catch (err) {
      reportError("Error polling benchmark status:", err);
      setIsInitialLoading(false);
      setTaskStatus("failed");
      setError(err instanceof Error ? err.message : "Failed to poll status");
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }
  };

  const runBenchmark = async () => {
    // Clear any existing polling interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) {
      setIsInitialLoading(false);
      setError("BACKEND_URL environment variable is not set");
      return;
    }

    try {
      const response = await fetch(
        `${backendUrl}/agent-tests/agent/${agentUuid}/benchmark`,
        {
          method: "POST",
          headers: {
            ...getDefaultHeaders(backendAccessToken),
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            models: models,
            test_uuids: testUuids,
          }),
        },
      );

      if (!response.ok) {
        const detail = await response
          .json()
          .then((body) => body?.detail)
          .catch(() => null);
        throw new Error(
          typeof detail === "string" && detail
            ? detail
            : "Failed to start benchmark",
        );
      }

      const result: BenchmarkStatusResponse = await response.json();
      const newTaskId = result.task_id;
      setCurrentTaskId(newTaskId);

      // Notify parent about the new benchmark
      if (onBenchmarkCreated) {
        onBenchmarkCreated(newTaskId);
      }

      // Start polling
      pollingIntervalRef.current = setInterval(() => {
        pollBenchmarkStatus(newTaskId, backendUrl);
      }, POLLING_INTERVAL_MS);

      // Also poll immediately
      pollBenchmarkStatus(newTaskId, backendUrl);
    } catch (err) {
      reportError("Error starting benchmark:", err);
      setIsInitialLoading(false);
      setError(
        err instanceof Error ? err.message : "Failed to start benchmark",
      );
    }
  };

  const toggleProvider = (model: string) => {
    setExpandedProviders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(model)) {
        newSet.delete(model);
      } else {
        newSet.add(model);
      }
      return newSet;
    });
  };

  const handleTestSelect = (model: string, testIndex: number) => {
    setSelectedTest({ model, testIndex });
  };

  // Get providers to display (includes placeholders for models without results yet)
  const getProvidersToDisplay = (): BenchmarkModelResult[] => {
    // When in progress and no results yet, show all models as placeholders
    if (!isDone && modelResults.length === 0 && models.length > 0) {
      return models.map((model) => ({
        model,
        success: null,
        message: "",
        total_tests: testNames.length,
        passed: null,
        failed: null,
        test_results: null,
      }));
    }

    // When in progress with some results, merge with missing models
    if (!isDone && models.length > 0) {
      const existingModels = new Set(modelResults.map((m) => m.model));
      const missingModels = models.filter((m) => !existingModels.has(m));
      if (missingModels.length > 0) {
        const placeholders: BenchmarkModelResult[] = missingModels.map(
          (model) => ({
            model,
            success: null,
            message: "",
            total_tests: testNames.length,
            passed: null,
            failed: null,
            test_results: null,
          }),
        );
        return [...modelResults, ...placeholders];
      }
    }

    return modelResults;
  };

  const providersToDisplay = getProvidersToDisplay();

  if (!isOpen) return null;

  const benchmarkScoreLabel = "Test pass rate (%)";

  // Check if we have any results to show
  const hasAnyResults = modelResults.some(
    (m) => m.test_results && m.test_results.length > 0,
  );
  const hasLabellingEligibleTests = modelResults.some((mr) =>
    (mr.test_results ?? []).some((tr) => isLabellingEligibleRaw(tr)),
  );

  // Config for a rerun. When viewing a past benchmark the props are empty, so
  // fall back to what the loaded results carry: models from the model rows, the
  // executed test uuids from the run, and test names from the first model row.
  const rerunModels =
    models.length > 0 ? models : modelResults.map((m) => m.model).filter(Boolean);
  const rerunTestUuids = testUuids.length > 0 ? testUuids : runTestUuids;
  const rerunTestNames =
    testNames.length > 0
      ? testNames
      : (
          modelResults.find(
            (m) => m.test_results && m.test_results.length > 0,
          )?.test_results ?? []
        ).map((tr) => tr.name ?? "");
  // Direct rerun wins over the go-back-to-picker fallback when available. It
  // needs the executed test uuids to reproduce the run's subset — a benchmark
  // that predates the backend snapshot can't be reliably rerun, so the button
  // is hidden rather than silently rerunning the wrong test set.
  const canDirectRerun =
    !!onRerun && rerunModels.length > 0 && rerunTestUuids.length > 0;
  const showRerunButton = isDone && !error && (canDirectRerun || !!onGoBack);
  const handleRerunClick = canDirectRerun
    ? () => onRerun!(rerunModels, rerunTestUuids, rerunTestNames)
    : onGoBack;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 md:p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-background rounded-none md:rounded-xl w-full max-w-[92rem] h-full md:h-[92vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="relative flex items-center justify-between px-4 md:px-6 py-3 md:py-4">
          <div className="min-w-0">
            <div className="flex items-center gap-2 md:gap-3 min-w-0">
              <h2 className="text-base md:text-lg font-semibold text-foreground truncate">
                {runName ?? "Benchmark"}
              </h2>
              {!isDone && !isInitialLoading && (
                <StatusBadge status={taskStatus} showSpinner />
              )}
            </div>
            <p className="text-xs text-muted-foreground truncate">
              {agentName}
            </p>
          </div>
          {/* Previous/Next pager - centered, desktop only, outputs tab */}
          {activeTab === "outputs" && nav && selectedTest && (
            <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <ResultPager
                currentIndex={nav.currentIndex}
                total={nav.total}
                onPrev={nav.goPrev}
                onNext={nav.goNext}
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            {/* Export results — only shown when benchmark is done */}
            {isDone && !error && hasAnyResults && (
              <div className="hidden md:block">
                <ExportResultsButton
                  filename={`${runName ?? "benchmark"}-${agentName}`}
                  getRows={() =>
                    buildBenchmarkCsv(
                      modelResults.flatMap((m) =>
                        (m.test_results ?? []).map((tr) => ({
                          model: m.model,
                          name: tr.name,
                          passed: tr.passed,
                          reasoning: tr.reasoning,
                          output: tr.output,
                          testCase: tr.test_case,
                          judgeResults: tr.judge_results,
                        })),
                      ),
                      Object.fromEntries(runEvaluators.map((e) => [e.uuid, e])),
                    )
                  }
                />
              </div>
            )}
            {/* Share button — only shown when benchmark is done */}
            {isDone && !error && currentTaskId && backendAccessToken && (
              <div className="hidden md:block">
                <ShareButton
                  entityType="benchmark"
                  entityId={currentTaskId}
                  accessToken={backendAccessToken}
                  initialIsPublic={isPublic}
                  initialShareToken={shareToken}
                />
              </div>
            )}
            {/* Submit for labelling — only shown when benchmark is done */}
            {isDone &&
              !error &&
              hasAnyResults &&
              hasLabellingEligibleTests &&
              currentTaskId && (
                <button
                  onClick={() => {
                    if (activeTab === "leaderboard") {
                      setActiveTab("outputs");
                    }
                    if (labellingSelectedKeys.size === 0) {
                      toast.error(
                        "Select one or more tests to submit for labelling",
                      );
                      return;
                    }
                    const hasEligibleSelected = modelResults.some((mr) =>
                      (mr.test_results ?? []).some(
                        (tr, index) =>
                          labellingSelectedKeys.has(
                            benchmarkLabellingKey(mr.model, index),
                          ) && isLabellingEligibleRaw(tr),
                      ),
                    );
                    if (!hasEligibleSelected) {
                      toast.error(
                        "Tool-call tests can't be submitted for labelling",
                      );
                      return;
                    }
                    setAddToTaskOpen(true);
                  }}
                  className="hidden md:flex items-center gap-2 h-8 px-2 md:px-3 rounded-lg text-xs md:text-sm font-medium border cursor-pointer transition-colors bg-rose-500/14 border-rose-500/45 text-rose-950 dark:text-rose-100 hover:bg-rose-500/26 dark:hover:bg-rose-500/20"
                >
                  Submit for labelling
                </button>
              )}
            {/* Rerun button - show when benchmark is complete (not loading and
                no error). Prefers a direct rerun (onRerun) and falls back to
                the go-back-to-picker flow (onGoBack). */}
            {showRerunButton && (
              <button
                onClick={handleRerunClick}
                className="flex items-center gap-2 h-8 px-2 md:px-3 rounded-md text-xs md:text-sm font-medium border border-border hover:bg-muted/50 transition-colors cursor-pointer"
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
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                  />
                </svg>
                Rerun
              </button>
            )}
            <button
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Initial Loading State */}
        {isInitialLoading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <SpinnerIcon className="w-8 h-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">Loading</p>
            </div>
          </div>
        )}

        {/* Error State */}
        {!isInitialLoading && error && (
          <div className="flex-1 flex items-center justify-center p-4 md:p-6">
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 md:p-6 max-w-md w-full mx-4">
              <div className="flex items-center gap-2 mb-2">
                <svg
                  className="w-5 h-5 text-red-500"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                  />
                </svg>
                <span className="font-medium text-red-500">
                  Something went wrong
                </span>
              </div>
              <p className="text-sm text-red-400 mb-4">
                We&apos;re looking into it. Please reach out to us if this issue
                persists.
              </p>
              {onGoBack && (
                <button
                  onClick={onGoBack}
                  className="w-full h-9 md:h-10 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center gap-2"
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
                      d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
                    />
                  </svg>
                  Try again
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tab Navigation - Only show when done */}
        {!isInitialLoading && !error && isDone && (
          <div className="border-b border-border -mx-4 md:mx-0 px-4 md:px-6 pt-2 overflow-x-auto hide-scrollbar">
            <div className="flex gap-3 md:gap-4 lg:gap-6">
              <button
                onClick={() => setActiveTab("leaderboard")}
                className={`pb-3 px-1 text-sm md:text-base font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
                  activeTab === "leaderboard"
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Leaderboard
              </button>
              <button
                onClick={() => setActiveTab("outputs")}
                className={`pb-3 px-1 text-sm md:text-base font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
                  activeTab === "outputs"
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Outputs
              </button>
            </div>
          </div>
        )}

        {/* Content - Show after initial loading */}
        {!isInitialLoading && !error && (
          <div className="flex-1 overflow-hidden">
            {/* Leaderboard Tab - Only when done */}
            {isDone && activeTab === "leaderboard" && (
              <div className="p-4 md:p-6 space-y-4 md:space-y-6 overflow-y-auto h-full">
                <BenchmarkCombinedLeaderboard
                  leaderboardSummary={leaderboardSummary}
                  modelResults={modelResults}
                  filename={`benchmark-leaderboard-${agentName.replace(/[^a-zA-Z0-9_-]/g, "_")}`}
                  benchmarkScoreLabel={benchmarkScoreLabel}
                />
              </div>
            )}

            {/* Outputs Tab - Show during progress and when outputs tab is active when done */}
            {(!isDone || activeTab === "outputs") && (
              <BenchmarkOutputsPanel
                modelResults={providersToDisplay}
                expandedModels={expandedProviders}
                onToggleModel={toggleProvider}
                onSetExpandedModels={setExpandedProviders}
                selectedTest={selectedTest}
                onSelectTest={handleTestSelect}
                onClearSelection={() => setSelectedTest(null)}
                onNavChange={setNav}
                testNames={testNames}
                formatModelName={(n) => n.replace("__", "/")}
                showControls={isDone}
                showRunningSpinner={true}
                evaluatorsByUuid={Object.fromEntries(
                  runEvaluators.map((e) => [e.uuid, e]),
                )}
                legacyDefaultEvaluator={defaultNextReplyEvaluator}
                labellingSelection={isDone ? labellingSelectedKeys : undefined}
                onToggleLabellingSelection={
                  isDone ? toggleLabellingSelection : undefined
                }
                onLabellingBulkToggle={isDone ? toggleLabellingBulk : undefined}
              />
            )}
          </div>
        )}
      </div>
      {currentTaskId && (
        <AddRunToLabellingTaskDialog
          isOpen={addToTaskOpen}
          onClose={() => setAddToTaskOpen(false)}
          source={{
            type: "benchmark_run",
            benchmarkUuid: currentTaskId,
            benchmarkName: runName ?? undefined,
            modelResults: labellingModelResults,
            evaluators: runEvaluators,
          }}
        />
      )}
    </div>
  );
}
