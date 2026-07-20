"use client";
import { reportError } from "@/lib/reportError";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { toast } from "sonner";
import { signOut } from "next-auth/react";
import { useAccessToken } from "@/hooks";
import {
  TestCaseOutput,
  TestCaseData,
  JudgeResult,
  CloseIcon,
  ResultPager,
  type PagerNav,
} from "./test-results/shared";
import { POLLING_INTERVAL_MS } from "@/constants/polling";
import { useHideFloatingButton } from "@/components/AppLayout";
import { ShareButton } from "@/components/ShareButton";
import { RerunIconButton } from "@/components/ui";
import { ExportResultsButton } from "@/components/ExportResultsButton";
import {
  AddRunToLabellingTaskDialog,
  isLabellingEligibleRaw,
} from "@/components/human-labelling/AddRunToLabellingTaskDialog";
import { useLabellingSelection } from "@/components/human-labelling/useLabellingSelection";
import {
  TestRunOutputsPanel,
  TestRunSummary,
  LLMEvaluationAbout,
  evaluatorSummaryToAbout,
} from "./eval-details";
import { buildTestRunCsv } from "@/lib/exportTestResults";
import {
  buildEvaluatorSummaryFromResults,
  toolCallPassFail,
} from "@/lib/testRunSummary";
import {
  startTestRunOrNotify,
  fetchTestRun,
  isTerminalRunStatus,
  UnauthorizedError,
  type TestCaseResult,
  type ChatMessage,
  type TestRunStatusResponse,
} from "@/lib/testRunApi";
import {
  fetchDefaultLLMNextReplyEvaluator,
  type DefaultEvaluatorSummary,
} from "@/lib/defaultEvaluators";

// Re-exported for AddRunToLabellingTaskDialog, which imports the type from here.
export type { TestCaseResult };

/** A single result row, derived straight from the server response every poll. */
type Row = {
  /** React key / selection id. The test uuid when the backend sent one,
   * otherwise a stable index key for legacy rows. */
  id: string;
  /** Present only when the backend sent one. Required to rerun this test. */
  testUuid?: string;
  name: string;
  status: "passed" | "failed" | "running";
  chatHistory?: ChatMessage[];
  output?: TestCaseOutput;
  testCase?: TestCaseData;
  reasoning?: string;
  evaluation?: TestCaseResult["evaluation"];
  judgeResults?: JudgeResult[] | null;
  error?: string;
};

type TestRunnerDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  agentUuid: string;
  agentName: string;
  taskId: string;
  /** Called after the user starts a fresh run from this dialog. The parent
   * re-points `taskId` at the new run, which this dialog then loads. */
  onNewRun?: (taskId: string, testUuids: string[]) => void;
};

export function TestRunnerDialog({
  isOpen,
  onClose,
  agentUuid,
  agentName,
  taskId,
  onNewRun,
}: TestRunnerDialogProps) {
  // Hide the floating "Talk to Us" button when this dialog is open
  useHideFloatingButton(isOpen);

  const backendAccessToken = useAccessToken();
  // The last server response. The only source of truth for run content.
  const [run, setRun] = useState<TestRunStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedTestUuid, setSelectedTestUuid] = useState<string | null>(null);
  const [nav, setNav] = useState<PagerNav | null>(null);
  const [defaultNextReplyEvaluator, setDefaultNextReplyEvaluator] =
    useState<DefaultEvaluatorSummary | null>(null);
  // Which tab is showing. Tabs only render once the run is done; we default to
  // the Summary tab on completion (mirrors the benchmark dialog).
  const [activeTab, setActiveTab] = useState<"summary" | "outputs" | "about">(
    "outputs",
  );
  const [addToTaskOpen, setAddToTaskOpen] = useState(false);
  // Guards the rerun POST: a test run is billed, so a second click while the
  // first request is in flight must not start a second run.
  const [isStartingRun, setIsStartingRun] = useState(false);
  const {
    selected: labellingSelectedIds,
    toggle: toggleLabellingSelection,
    bulkToggle: toggleLabellingBulk,
    clear: clearLabellingSelection,
  } = useLabellingSelection();
  // Tracks whether the dialog has already auto-opened a completed test for
  // this open lifecycle. Set back to false on every dialog open / new run /
  // past-run-view init, and flipped to true after the auto-open fires once.
  // Without this guard, clicking the in-dialog "back to list" button would
  // immediately re-trigger the auto-open, making the list view unreachable.
  const hasAutoSelectedRef = useRef(false);

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

  // Fetch the run once, then poll until it reaches a terminal status.
  useEffect(() => {
    if (!isOpen || !taskId || !backendAccessToken) return;
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) return;

    setRun(null);
    setIsLoading(true);
    setSelectedTestUuid(null);
    setActiveTab("outputs");
    hasAutoSelectedRef.current = false;
    clearLabellingSelection();

    let cancelled = false;
    let interval: ReturnType<typeof setInterval> | null = null;
    const stop = () => {
      if (interval) {
        clearInterval(interval);
        interval = null;
      }
    };

    const tick = async () => {
      try {
        const result = await fetchTestRun(backendUrl, backendAccessToken, taskId);
        if (cancelled) return;
        setRun(result);
        if (isTerminalRunStatus(result.status)) {
          stop();
          // Land on the Summary tab when the run finishes cleanly (mirrors the
          // benchmark dialog). Polling has stopped by now, so this fires once
          // on completion and will not fight a later manual tab switch. Skip on
          // failure since there is no useful summary to show.
          if (result.status !== "failed" && !result.error) {
            setActiveTab("summary");
          }
        }
      } catch (error) {
        if (cancelled) return;
        if (error instanceof UnauthorizedError) {
          stop();
          await signOut({ callbackUrl: "/login" });
          return;
        }
        reportError("Error polling test run status:", error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    tick();
    interval = setInterval(tick, POLLING_INTERVAL_MS);

    return () => {
      cancelled = true;
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, taskId, backendAccessToken]);

  const runStatus: "queued" | "in_progress" | "done" | "failed" = useMemo(() => {
    if (!run) return "queued";
    if (run.status === "completed" || run.status === "done") return "done";
    if (run.status === "failed") return "failed";
    if (run.status === "in_progress") return "in_progress";
    return "queued";
  }, [run]);

  const rows: Row[] = useMemo(() => {
    const results = run?.results ?? [];
    const runFailed = run?.status === "failed";
    return results.map((r: TestCaseResult, i): Row => {
      let status: Row["status"];
      if (r.passed === null || r.passed === undefined) {
        status = "running";
      } else {
        status = r.passed === true || r.status === "passed" ? "passed" : "failed";
      }
      // A run-level failure ends any case the backend left mid-flight.
      const error =
        r.error ?? (runFailed && status === "running" ? run?.error : undefined);
      if (error && status === "running") status = "failed";
      return {
        id: r.test_uuid ?? `idx-${i}`,
        testUuid: r.test_uuid,
        name: r.name || r.test_case?.name || r.test_name || `Test ${i + 1}`,
        status,
        chatHistory: r.chat_history,
        output: r.output ?? undefined,
        testCase: r.test_case ?? undefined,
        reasoning: r.reasoning,
        judgeResults: r.judge_results ?? null,
        evaluation:
          status !== "running"
            ? (r.evaluation ?? { passed: status === "passed" })
            : undefined,
        error,
      };
    });
  }, [run]);

  const runEvaluators = useMemo(
    () => (Array.isArray(run?.evaluators) ? run.evaluators : []),
    [run],
  );
  const evaluatorsByUuid = useMemo(
    () => Object.fromEntries(runEvaluators.map((e) => [e.uuid, e])),
    [runEvaluators],
  );
  const runTestUuids = useMemo(
    () => (Array.isArray(run?.test_uuids) ? run.test_uuids : []),
    [run],
  );
  const runName = run?.name ?? null;

  // Auto-open the first completed test when nothing is selected. Covers both
  // - live runs: as soon as one test transitions to passed/failed (and the
  //   user hasn't manually picked anything), open it.
  // - past completed runs: on dialog open every test is already passed/failed
  //   so this picks index 0 (i.e. always opens the first test).
  // Fires at most once per dialog open thanks to `hasAutoSelectedRef`.
  useEffect(() => {
    if (hasAutoSelectedRef.current) return;
    if (selectedTestUuid !== null) return;
    const firstCompleted = rows.find(
      (r) => r.status === "passed" || r.status === "failed",
    );
    if (firstCompleted) {
      hasAutoSelectedRef.current = true;
      setSelectedTestUuid(firstCompleted.id);
    }
  }, [rows, selectedTestUuid]);

  const passedTests = rows.filter((r) => r.status === "passed");
  // Errored tests carry an `error` and are surfaced as their own category in
  // the list; keep them out of the "failed" count so the header matches.
  const failedTests = rows.filter((r) => r.status === "failed" && !r.error);
  // Tool-call pass/fail split for the Summary tab's dedicated card. Keyed off
  // the test case's evaluation type.
  const toolCall = toolCallPassFail(
    rows.map((r) => ({
      toolCall: r.testCase?.evaluation?.type === "tool_call",
      passed: r.status === "passed",
      failed: r.status === "failed" && !r.error,
    })),
  );
  const hasLabellingEligibleTests = rows.some((r) =>
    isLabellingEligibleRaw({ test_case: r.testCase ?? null }),
  );

  // Per-evaluator metrics for the Summary tab. Single test runs don't ship a
  // backend `evaluator_summary` block (only benchmarks do), so aggregate it
  // from each case's judge_results against the run's evaluator metadata.
  const evaluatorSummary = useMemo(
    () =>
      buildEvaluatorSummaryFromResults(
        rows.map((r) => ({ judge_results: r.judgeResults })),
        evaluatorsByUuid,
      ),
    [rows, evaluatorsByUuid],
  );

  // Start a fresh run of the same tests and hand it to the parent, which
  // re-points `taskId` so this dialog loads it.
  const startRun = async (testUuids: string[]) => {
    if (testUuids.length === 0 || isStartingRun) return;
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) {
      toast.error("Cannot start a run: the backend URL is not configured.");
      return;
    }
    setIsStartingRun(true);
    try {
      const newTaskId = await startTestRunOrNotify(
        backendUrl,
        backendAccessToken,
        agentUuid,
        testUuids,
      );
      if (newTaskId) onNewRun?.(newTaskId, testUuids);
    } finally {
      setIsStartingRun(false);
    }
  };

  // Show the error card only when the failed run left NO usable result: every
  // row errored, or the run died before any case started (zero rows, and
  // `[].every` is true). A run-level `error` alone is not enough, since cases
  // that already produced results must stay visible.
  const isOverallError = runStatus === "failed" && rows.every((r) => !!r.error);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-0 md:p-4">
      <div className="bg-background rounded-none md:rounded-xl w-full max-w-[92rem] h-full md:h-[92vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="relative flex items-center justify-between gap-3 px-4 md:px-6 py-3 md:py-4">
          {/* Left: title + agent name */}
          <div className="flex items-center gap-3 min-w-0">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                {(runStatus === "queued" || runStatus === "in_progress") && (
                  <span
                    className="relative flex h-2.5 w-2.5 shrink-0"
                    title="Run in progress"
                  >
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-400 opacity-75" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-yellow-400" />
                  </span>
                )}
                <h2 className="text-base md:text-lg font-semibold text-foreground truncate">
                  {runName ?? "Test run"}
                </h2>
                {runStatus === "done" && onNewRun && runTestUuids.length > 0 && (
                  <RerunIconButton
                    onClick={() => startRun(runTestUuids)}
                    loading={isStartingRun}
                    className="shrink-0"
                  />
                )}
              </div>
              <p className="text-xs text-muted-foreground truncate">
                {agentName}
              </p>
            </div>
          </div>
          {/* Previous/Next pager - centered, desktop only. Outputs tab only. */}
          {activeTab === "outputs" && nav && selectedTestUuid && (
            <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <ResultPager
                currentIndex={nav.currentIndex}
                total={nav.total}
                onPrev={nav.goPrev}
                onNext={nav.goNext}
              />
            </div>
          )}
          {/* Right: action buttons + close */}
          <div className="flex items-center gap-2 shrink-0">
            {/* Export results — only shown when run is done */}
            {runStatus === "done" && rows.length > 0 && (
              <div className="hidden md:block">
                <ExportResultsButton
                  filename={`${runName ?? "test-run"}-${agentName}`}
                  getRows={() =>
                    buildTestRunCsv(
                      rows.map((r) => ({
                        name: r.name,
                        status: r.status,
                        output: r.output,
                        testCase: r.testCase,
                        reasoning: r.reasoning,
                        judgeResults: r.judgeResults,
                      })),
                      evaluatorsByUuid,
                    )
                  }
                />
              </div>
            )}
            {runStatus === "done" &&
              rows.length > 0 &&
              hasLabellingEligibleTests && (
                <div className="hidden md:block">
                  <button
                    type="button"
                    onClick={() => {
                      if (activeTab === "summary") {
                        setActiveTab("outputs");
                      }
                      if (labellingSelectedIds.size === 0) {
                        toast.error(
                          "Select one or more tests to submit for labelling",
                        );
                        return;
                      }
                      const hasEligibleSelected = rows.some(
                        (r) =>
                          labellingSelectedIds.has(r.id) &&
                          isLabellingEligibleRaw({
                            test_case: r.testCase ?? null,
                          }),
                      );
                      if (!hasEligibleSelected) {
                        toast.error(
                          "Tool-call tests can't be submitted for labelling",
                        );
                        return;
                      }
                      setAddToTaskOpen(true);
                    }}
                    className="flex items-center gap-2 h-8 px-2 md:px-3 rounded-lg text-xs md:text-sm font-medium border cursor-pointer transition-colors bg-rose-500/14 border-rose-500/45 text-rose-950 dark:text-rose-100 hover:bg-rose-500/26 dark:hover:bg-rose-500/20"
                  >
                    Submit for labelling
                  </button>
                </div>
              )}
            {/* Share button — only shown when run is done */}
            {runStatus === "done" && backendAccessToken && (
              <div className="hidden md:block">
                <ShareButton
                  entityType="test-run"
                  entityId={taskId}
                  accessToken={backendAccessToken}
                  initialIsPublic={run?.is_public ?? false}
                  initialShareToken={run?.share_token ?? null}
                />
              </div>
            )}
            <button
              onClick={onClose}
              data-tour="run-close"
              className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer shrink-0"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {isLoading && !run ? (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="w-8 h-8 border-2 border-muted-foreground/30 border-t-foreground rounded-full animate-spin" />
          </div>
        ) : isOverallError ? (
          /* Overall Error State - replaces split panel */
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 max-w-md text-center">
              <div className="flex items-center justify-center gap-2 mb-3">
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
              <p className="text-sm text-red-400">
                We&apos;re looking into it. Please reach out to us if this issue
                persists.
              </p>
            </div>
          </div>
        ) : (
          /* Content */
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tab nav - only once the run is done (mirrors the benchmark dialog) */}
            {runStatus === "done" && (
              <div className="border-b border-border px-4 md:px-6 pt-2 overflow-x-auto hide-scrollbar shrink-0">
                <div className="flex gap-3 md:gap-4 lg:gap-6">
                  <button
                    data-tour="run-tab-summary"
                    onClick={() => setActiveTab("summary")}
                    className={`pb-3 px-1 text-sm md:text-base font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
                      activeTab === "summary"
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Summary
                  </button>
                  <button
                    data-tour="run-tab-outputs"
                    onClick={() => setActiveTab("outputs")}
                    className={`pb-3 px-1 text-sm md:text-base font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
                      activeTab === "outputs"
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    Outputs
                  </button>
                  <button
                    onClick={() => setActiveTab("about")}
                    className={`pb-3 px-1 text-sm md:text-base font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap flex-shrink-0 ${
                      activeTab === "about"
                        ? "border-foreground text-foreground"
                        : "border-transparent text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    About
                  </button>
                </div>
              </div>
            )}

            {runStatus === "done" && activeTab === "summary" ? (
              <div className="flex-1 overflow-hidden" data-tour="test-run-summary">
                <TestRunSummary
                  passed={passedTests.length}
                  total={passedTests.length + failedTests.length}
                  latency={run?.latency_ms ?? null}
                  cost={run?.cost ?? null}
                  tokens={run?.total_tokens ?? null}
                  toolCall={toolCall}
                  evaluatorSummary={evaluatorSummary}
                />
              </div>
            ) : runStatus === "done" && activeTab === "about" ? (
              <div className="flex-1 overflow-y-auto p-4 md:p-6">
                <LLMEvaluationAbout
                  showToolCalls={toolCall.total > 0}
                  showLatency={!!run?.latency_ms}
                  showCost={!!run?.cost}
                  showTokens={!!run?.total_tokens}
                  evaluators={evaluatorSummaryToAbout(evaluatorSummary)}
                />
              </div>
            ) : (
              <div className="flex-1 overflow-hidden">
                <TestRunOutputsPanel
                  results={rows.map((r) => ({
                    id: r.id,
                    name: r.name,
                    status: r.status,
                    output: r.output,
                    testCase: r.testCase,
                    reasoning: r.reasoning,
                    evaluation: r.evaluation,
                    judgeResults: r.judgeResults,
                    error: r.error,
                  }))}
                  selectedId={selectedTestUuid}
                  onSelect={setSelectedTestUuid}
                  onClearSelection={() => setSelectedTestUuid(null)}
                  onNavChange={setNav}
                  evaluatorsByUuid={evaluatorsByUuid}
                  legacyDefaultEvaluator={defaultNextReplyEvaluator}
                  labellingSelection={
                    runStatus === "done" ? labellingSelectedIds : undefined
                  }
                  onToggleLabellingSelection={
                    runStatus === "done" ? toggleLabellingSelection : undefined
                  }
                  onLabellingBulkToggle={
                    runStatus === "done" ? toggleLabellingBulk : undefined
                  }
                />
              </div>
            )}
          </div>
        )}
      </div>
      <AddRunToLabellingTaskDialog
        isOpen={addToTaskOpen}
        onClose={() => setAddToTaskOpen(false)}
        source={{
          type: "test_run",
          runUuid: taskId,
          runName: runName ?? undefined,
          results: rows
            .filter((r) => labellingSelectedIds.has(r.id))
            .map((r) => ({
              test_uuid: r.testUuid,
              test_name: r.name,
              status:
                r.status === "passed" || r.status === "failed"
                  ? r.status
                  : undefined,
              passed:
                r.status === "passed"
                  ? true
                  : r.status === "failed"
                    ? false
                    : null,
              reasoning: r.reasoning,
              output: r.output ?? null,
              test_case: r.testCase ?? null,
              chat_history: r.chatHistory,
              evaluation: r.evaluation,
              judge_results: r.judgeResults,
              error: r.error,
            })),
          evaluators: runEvaluators,
        }}
      />
    </div>
  );
}
