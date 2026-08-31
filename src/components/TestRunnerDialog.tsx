"use client";
import { reportError } from "@/lib/reportError";
import {
  isNotRun,
  isRunStopped,
  isUnanswered,
  runStateOf,
  stoppedRunSentence,
} from "@/lib/testTypes";

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
import {
  RerunIconButton,
  ResultTabs,
  RunStateMark,
  StopRunButton,
} from "@/components/ui";
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
  toolCallEvaluatorUuidFromRows,
  toolCallPassFail,
} from "@/lib/testRunSummary";
import {
  abortRunOrNotify,
  startTestRunOrNotify,
  fetchTestRun,
  isTerminalRunStatus,
  UnauthorizedError,
  type TestCaseResult,
  type TestRunStatusResponse,
} from "@/lib/testRunApi";
import { EditableRunName } from "@/components/EditableRunName";
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
  status: "passed" | "failed" | "running" | "not_run";
  /** The test produced no answer, so `status` is not a verdict on the agent. */
  unanswered: boolean;
  output?: TestCaseOutput;
  testCase?: TestCaseData;
  /** Effective custom inputs the agent received (defaults + overrides). */
  inputs?: Record<string, unknown>;
  /** The judge's reasoning, or — when `unanswered` — why the test could not
   * be run. */
  reasoning?: string;
  judgeResults?: JudgeResult[] | null;
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
  /** Called after the run is renamed, with the name as it now reads, so the
   * list behind this window shows it too. */
  onRenamed?: (name: string) => void;
};

export function TestRunnerDialog({
  isOpen,
  onClose,
  agentUuid,
  agentName,
  taskId,
  onNewRun,
  onRenamed,
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
        const result = await fetchTestRun(
          backendUrl,
          backendAccessToken,
          taskId,
        );
        if (cancelled) return;
        setRun(result);
        if (isTerminalRunStatus(result.status)) {
          stop();
          // Land on the Summary tab when the run finishes cleanly (mirrors the
          // benchmark dialog). Polling has stopped by now, so this fires once
          // on completion and will not fight a later manual tab switch. Skip on
          // failure since there is no useful summary to show.
          if (result.status !== "failed") {
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

  const runStatus: "queued" | "in_progress" | "done" | "failed" =
    useMemo(() => {
      if (!run) return "queued";
      if (run.status === "completed" || run.status === "done") return "done";
      if (run.status === "failed") return "failed";
      if (run.status === "in_progress") return "in_progress";
      return "queued";
    }, [run]);

  const rows: Row[] = useMemo(() => {
    const results = run?.results ?? [];
    const runStopped = run ? isRunStopped(run) : false;
    return results.map((r: TestCaseResult, i): Row => {
      // A missing verdict means the test has not finished — unless the run was
      // stopped, in which case it never started and nothing more is coming. A
      // test that produced no answer says so itself and comes back with
      // `passed: false`.
      const status: Row["status"] = isNotRun(r, runStopped)
        ? "not_run"
        : r.passed === null || r.passed === undefined
          ? "running"
          : r.passed === true
            ? "passed"
            : "failed";
      return {
        id: r.test_case_id ?? `idx-${i}`,
        testUuid: r.test_case_id,
        name: r.name || r.test_case?.name || r.test_name || `Test ${i + 1}`,
        status,
        unanswered: isUnanswered(r),
        output: r.output ?? undefined,
        testCase: r.test_case ?? undefined,
        inputs: r.inputs ?? undefined,
        reasoning: r.reasoning,
        judgeResults: r.judge_results ?? null,
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
  // Tests that produced no answer are their own category in the list; keep
  // them out of the "failed" count so the header matches.
  const failedTests = rows.filter((r) => r.status === "failed" && !r.unanswered);
  // How many produced no answer, and whether the run gave up before starting
  // every test. Both come off the run itself rather than being counted here.
  const unansweredCount = run?.unanswered_tests ?? 0;
  const stoppedEarly = run?.stopped_early === true;
  // Someone stopped this run before it finished. The tests already answered
  // are kept; the rest were never started.
  const wasStopped = run ? isRunStopped(run) : false;
  // Tool-call pass/fail split for the Summary tab's dedicated card. Keyed off
  // the test case's evaluation type.
  const toolCall = toolCallPassFail(
    rows.map((r) => ({
      toolCall: r.testCase?.evaluation?.type === "tool_call",
      passed: r.status === "passed",
      failed: r.status === "failed" && !r.unanswered,
    })),
  );
  const hasLabellingEligibleTests = rows.some((r) =>
    isLabellingEligibleRaw({ test_case: r.testCase ?? null }),
  );
  // The row checkboxes exist only to feed the "Submit for labelling" button,
  // so they appear exactly when it does — never on a run with nothing that
  // can be labelled.
  // The run is finished either way; a failed one still has rows to read.
  const isFinished = runStatus === "done" || runStatus === "failed";
  const showLabelling =
    isFinished && rows.length > 0 && hasLabellingEligibleTests;

  // Per-evaluator metrics for the Summary tab. Single test runs don't ship a
  // backend `evaluator_summary` block (only benchmarks do), so aggregate it
  // from each case's judge_results against the run's evaluator metadata.
  // The evaluator that judged the tool-call tests, when the run has one.
  // Found from the rows rather than the run's evaluator list, which carries
  // no kind, and never by name, which a workspace can change.
  const toolCallEvaluatorUuid = useMemo(
    () => toolCallEvaluatorUuidFromRows(rows),
    [rows],
  );

  const evaluatorSummary = useMemo(
    () =>
      buildEvaluatorSummaryFromResults(
        rows.map((r) => ({ judge_results: r.judgeResults })),
        evaluatorsByUuid,
      ),
    [rows, evaluatorsByUuid],
  );

  // Stop a run that is still going, then read it back, since the stop itself
  // only answers with the run's id and status. The check that follows sees a
  // finished run and stops checking on its own.
  const stopRun = async () => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) {
      toast.error("Cannot stop the run: the backend URL is not configured.");
      return;
    }
    const stopped = await abortRunOrNotify(
      backendUrl,
      backendAccessToken,
      taskId,
    );
    if (!stopped) return;
    try {
      setRun(await fetchTestRun(backendUrl, backendAccessToken, taskId));
    } catch (error) {
      reportError("Error reading a stopped test run:", error);
    }
  };

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

  // Show the error card only when the failed run left NO rows at all. When it
  // has rows, every one of them carries its own reason, and the summary is
  // where the reader learns the run stopped early — an error card would hide
  // that already produced results must stay visible.
  const isOverallError = runStatus === "failed" && rows.length === 0;

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
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-yellow-500 opacity-75 dark:bg-yellow-400" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-yellow-500 dark:bg-yellow-400" />
                  </span>
                )}
                {run &&
                  !isLoading &&
                  (() => {
                    const state = runStateOf(run);
                    return state ? <RunStateMark state={state} /> : null;
                  })()}
                {/* The name and its pencil wait for the run itself: an
                    unloaded run would show the automatic name, which is not
                    necessarily the name this run carries. */}
                {!(isLoading && !run) && (
                  <EditableRunName
                    taskId={taskId}
                    type="llm-unit-test"
                    name={run?.name}
                    onRenamed={(name) => {
                      setRun((prev) => (prev ? { ...prev, name } : prev));
                      onRenamed?.(name);
                    }}
                  />
                )}
                {isFinished &&
                  onNewRun &&
                  runTestUuids.length > 0 && (
                    <RerunIconButton
                      onClick={() => startRun(runTestUuids)}
                      loading={isStartingRun}
                      className="shrink-0"
                    />
                  )}
                {!isFinished && !isLoading && (
                  <StopRunButton onStop={stopRun} className="shrink-0" />
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
            {isFinished && rows.length > 0 && (
              <div className="hidden md:block">
                <ExportResultsButton
                  filename={`test-run-${agentName}`}
                  getRows={() =>
                    buildTestRunCsv(
                      rows.map((r) => ({
                        name: r.name,
                        status: r.unanswered ? "error" : r.status,
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
            {showLabelling && (
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
                    setAddToTaskOpen(true);
                  }}
                  className="flex items-center gap-2 h-8 px-2 md:px-3 rounded-lg text-xs md:text-sm font-medium border cursor-pointer transition-colors bg-rose-500/14 border-rose-500/45 text-rose-950 dark:text-rose-100 hover:bg-rose-500/26 dark:hover:bg-rose-500/20"
                >
                  Submit for labelling
                </button>
              </div>
            )}
            {/* Share button — only shown when run is done */}
            {isFinished && backendAccessToken && (
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
            {isFinished && (
              <div className="border-b border-border px-4 md:px-6 pt-2 overflow-x-auto hide-scrollbar shrink-0">
                <div className="flex gap-3 md:gap-4 lg:gap-6">
                  <ResultTabs
                    tabs={["summary", "outputs", "about"]}
                    activeTab={activeTab}
                    onChange={setActiveTab}
                    size="window"
                    tourPrefix="run-tab"
                  />
                </div>
              </div>
            )}

            {isFinished && activeTab === "summary" ? (
              <div
                className="flex-1 overflow-hidden"
                data-tour="test-run-summary"
              >
                <TestRunSummary
                  passed={passedTests.length}
                  total={passedTests.length + failedTests.length}
                  unanswered={unansweredCount}
                  stoppedEarly={stoppedEarly}
                  stopped={wasStopped}
                  runTotalTests={run?.total_tests ?? rows.length}
                  onReviewUnanswered={() => setActiveTab("outputs")}
                  latency={run?.latency_ms ?? null}
                  cost={run?.cost ?? null}
                  tokens={run?.total_tokens ?? null}
                  toolCall={toolCall}
                  toolCallEvaluatorUuid={toolCallEvaluatorUuid}
                  evaluatorSummary={evaluatorSummary}
                />
              </div>
            ) : isFinished && activeTab === "about" ? (
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
                    unanswered: r.unanswered,
                    output: r.output,
                    testCase: r.testCase,
                    inputs: r.inputs,
                    reasoning: r.reasoning,
                    judgeResults: r.judgeResults,
                  }))}
                  selectedId={selectedTestUuid}
                  onSelect={setSelectedTestUuid}
                  onClearSelection={() => setSelectedTestUuid(null)}
                  onNavChange={setNav}
                  evaluatorsByUuid={evaluatorsByUuid}
                  emptyMessage={
                    wasStopped
                      ? stoppedRunSentence(0, run?.total_tests ?? null)
                      : "No tests to show"
                  }
                  legacyDefaultEvaluator={defaultNextReplyEvaluator}
                  labellingSelection={
                    showLabelling ? labellingSelectedIds : undefined
                  }
                  onToggleLabellingSelection={
                    showLabelling ? toggleLabellingSelection : undefined
                  }
                  onLabellingBulkToggle={
                    showLabelling ? toggleLabellingBulk : undefined
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
              judge_results: r.judgeResults,
            })),
          evaluators: runEvaluators,
        }}
      />
    </div>
  );
}
