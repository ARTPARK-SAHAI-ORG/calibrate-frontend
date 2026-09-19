"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { runErrorText } from "@/lib/testRunApi";
import { useParams } from "next/navigation";
import {
  TestCaseOutput,
  TestCaseData,
  JudgeResult,
  TestRunEvaluator,
  ResultPager,
  type PagerNav,
} from "@/components/test-results/shared";
import {
  PublicPageLayout,
  PublicNotFound,
  PublicLoading,
} from "@/components/PublicPageLayout";
import {
  TestRunOutputsPanel,
  TestRunSummary,
  LLMEvaluationAbout,
  evaluatorSummaryToAbout,
} from "@/components/eval-details";
import { ExportResultsButton } from "@/components/ExportResultsButton";
import { ResultTabs, RunStateMark } from "@/components/ui";
import { buildTestRunCsv } from "@/lib/exportTestResults";
import {
  isToolCallRow,
  rowTestUuid,
  runEvaluatorSummary,
  toolCallEvaluatorUuidFromRows,
  toolCallPassFail,
} from "@/lib/testRunSummary";
import type { BenchmarkEvaluatorSummaryEntry } from "@/lib/benchmarkEvaluatorSummary";
import type { AggStat, LatencyStat } from "@/lib/llmMetrics";
import {
  isRunStopped,
  isUnanswered,
  rowVerdict,
  runDisplayName,
  runStateOf,
} from "@/lib/testTypes";

type TestCaseResult = {
  test_case_id?: string;
  /** The uuid of the test this row ran. Absent on a run answered before the
   * backend started stamping it, which is why `rowTestUuid` falls back. */
  test_uuid?: string | null;
  test_name?: string;
  name?: string;
  /** null / absent means the test has not finished. It never means the test
   * produced no answer — read `unanswered` for that. */
  passed?: boolean | null;
  /** True when the test produced no answer. `reasoning` then holds why. */
  unanswered?: boolean;
  reasoning?: string;
  /** True when the run was stopped before this test started. */
  not_run?: boolean;
  /** What kind of test this row ran. Sent on every case in both modes. Absent
   * on runs answered before the backend started sending it, which is why
   * `rowTestType` falls back to the test's own config. */
  test_type?: "response" | "general" | "tool_call" | "conversation" | null;
  /** The four fields below are left out of the summary response. They arrive
   * when one case is read in full. */
  output?: TestCaseOutput | null;
  test_case?: TestCaseData | null;
  judge_results?: JudgeResult[] | null;
  inputs?: Record<string, unknown> | null;
  /** Per-case agent latency (ms) / cost (USD). */
  latency_ms?: number | null;
  cost?: number | null;
};

type TestRunStatusResponse = {
  task_id: string;
  status: string;
  /** What the run is called. Absent on a backend that predates naming. */
  name?: string | null;
  total_tests?: number;
  passed?: number;
  failed?: number;
  /** How many of the tests produced no answer. */
  unanswered_tests?: number;
  /** True when the run gave up before it started every test. */
  stopped_early?: boolean;
  /** True when someone stopped the run before it finished. */
  aborted?: boolean;
  results?: TestCaseResult[];
  /** Top-level per-evaluator metadata block — see TestRunEvaluator. */
  evaluators?: TestRunEvaluator[];
  /** The run's totals for each evaluator that judged something. An evaluator
   * that judged nothing is left out. Read it through `runEvaluatorSummary`. */
  evaluator_summary?: BenchmarkEvaluatorSummaryEntry[] | null;
  /** Aggregate per-test latency ({p50,p95,p99,count}; legacy runs use
   * {mean,min,max,count}) plus cost / total tokens ({mean,min,max,count} | null). */
  latency_ms?: LatencyStat;
  cost?: AggStat;
  total_tokens?: AggStat;
  error?: string | boolean | null;
};

/** The run broke: it either says so outright or left an error behind. The same
 * two signals the run window and the shared comparison page read, so a run
 * cannot look broken on one screen and finished on another. */
function runBroke(run: TestRunStatusResponse): boolean {
  return run.status === "failed" || Boolean(run.error);
}

/** Has the run ended, whichever way it ended? A test with no verdict is still
 * going only while the run is; once the run is over nothing more is coming for
 * it, so it never ran. */
function isRunOver(run: TestRunStatusResponse): boolean {
  return (
    run.status === "done" ||
    run.status === "completed" ||
    runBroke(run) ||
    isRunStopped(run)
  );
}

export default function PublicTestRunPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<TestRunStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nav, setNav] = useState<PagerNav | null>(null);
  const [activeTab, setActiveTab] = useState<"summary" | "tests" | "about">(
    "summary",
  );
  // Cases read in full, keyed by test id, so reopening one costs nothing.
  const [cases, setCases] = useState<Record<string, TestCaseResult>>({});
  /** The test whose answer is being read, so the detail pane can say so. The
   * row keeps its own verdict, so it stays in its group. */
  const [loadingCaseId, setLoadingCaseId] = useState<string | null>(null);
  const requestedCases = useRef<Set<string>>(new Set());

  useEffect(() => {
    document.title = "LLM component test | Calibrate";
  }, []);

  /** Read one case in full: its conversation, the agent's answer and each
   * judge's verdict. The run itself is fetched without any of that. */
  const fetchCase = useCallback(
    async (testCaseId: string) => {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) return;
      if (requestedCases.current.has(testCaseId)) {
        setLoadingCaseId(null);
        return;
      }
      requestedCases.current.add(testCaseId);
      setLoadingCaseId(testCaseId);
      try {
        const res = await fetch(
          `${backendUrl}/public/test-run/${token}/results/${testCaseId}`,
          { headers: { accept: "application/json" } },
        );
        if (!res.ok) {
          requestedCases.current.delete(testCaseId);
          setLoadingCaseId(null);
          return;
        }
        const full: TestCaseResult = await res.json();
        setCases((prev) => ({ ...prev, [testCaseId]: full }));
        setLoadingCaseId(null);
      } catch {
        // The rest of the page stays up; the row keeps what the run gave it.
        requestedCases.current.delete(testCaseId);
        setLoadingCaseId(null);
      }
    },
    [token],
  );

  useEffect(() => {
    const fetchData = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) throw new Error("Backend URL not configured");

        const res = await fetch(
          `${backendUrl}/public/test-run/${token}?mode=summary`,
          { headers: { accept: "application/json" } },
        );

        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error("Failed to load results");

        const result: TestRunStatusResponse = await res.json();
        // A run still going has nothing to share yet. A failed one is shown
        // with what it did finish, the same as in the app.
        if (
          result.status !== "done" &&
          result.status !== "completed" &&
          result.status !== "failed"
        ) {
          setNotFound(true);
          return;
        }

        setData(result);
        if (result.results?.length) setSelectedId(`test-0`);
      } catch {
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [token]);

  // The test on screen is the only one read in full.
  useEffect(() => {
    if (!selectedId) return;
    const row = (data?.results ?? [])[Number(selectedId.replace("test-", ""))];
    const uuid = row ? rowTestUuid(row) : null;
    if (uuid) fetchCase(uuid);
  }, [selectedId, data, fetchCase]);

  // ponytail: the id of the evaluator that judged the tool-call tests is only
  // in a case's judge_results, which the summary leaves out, so read the first
  // tool-call case in full. Drop this once the run itself names it.
  useEffect(() => {
    const row = (data?.results ?? []).find(isToolCallRow);
    const uuid = row ? rowTestUuid(row) : null;
    if (uuid) fetchCase(uuid);
  }, [data, fetchCase]);

  if (isLoading)
    return (
      <PublicPageLayout>
        <PublicLoading />
      </PublicPageLayout>
    );
  if (notFound || !data)
    return (
      <PublicPageLayout>
        <PublicNotFound />
      </PublicPageLayout>
    );

  const results = data.results ?? [];
  // Each row with whatever has been read in full laid over it.
  const merged = results.map((r) => {
    const uuid = rowTestUuid(r);
    const full = uuid ? cases[uuid] : undefined;
    if (full) return { ...r, ...full, loading: false };
    return { ...r, loading: uuid !== null && uuid === loadingCaseId };
  });
  // Someone stopped this run before it finished, so the tests it never started
  // are neither passes nor failures.
  const wasStopped = isRunStopped(data);
  const runOver = isRunOver(data);
  // How one row reads. The one rule, so this page and the run window in the app
  // cannot show two different pass rates for the same run.
  const statusOf = (r: TestCaseResult) => rowVerdict(r, wasStopped, runOver);
  const passed = results.filter((r) => statusOf(r) === "passed").length;
  // A test that produced no answer was never scored; keep it out of the
  // pass-rate denominator so the rate matches the tests that were.
  const failed = results.filter(
    (r) => statusOf(r) === "failed" && !isUnanswered(r),
  ).length;
  // Tool-call pass/fail split for the Results tab's dedicated card.
  const toolCall = toolCallPassFail(
    results.map((r) => ({
      toolCall: isToolCallRow(r),
      passed: statusOf(r) === "passed",
      failed: statusOf(r) === "failed" && !isUnanswered(r),
    })),
  );
  const runFailed = runBroke(data);
  // Every test the run has no answer for: the ones it says produced none, and
  // the rows it ended without a verdict for. They are left out of the pass
  // rate, so the mark by the name and the note above the numbers have to count
  // them. A run from before the backend flagged an unanswered test reports it
  // in its own count and again as a row with no verdict, so take the larger of
  // the two rather than adding them and counting it twice.
  const unansweredCount = data.unanswered_tests ?? 0;
  const notRunRows = results.filter(
    (r) => isUnanswered(r) || statusOf(r) === "not_run",
  ).length;
  const couldNotRun = Math.max(unansweredCount, notRunRows);
  const runState = runStateOf({
    status: runFailed ? "failed" : data.status,
    aborted: data.aborted,
    stopped_early: data.stopped_early,
    unanswered_tests: couldNotRun,
    // The total the count is read against: without it, one test that could
    // not be run would read as none of them having run.
    total_tests: data.total_tests ?? results.length,
  });
  const evaluatorsByUuid = Object.fromEntries(
    (data.evaluators ?? []).map((e) => [e.uuid, e]),
  );
  const evaluatorSummary = runEvaluatorSummary(data.evaluator_summary);

  /** The whole run, read only when someone exports it: the file carries each
   * case's conversation, answer and judge reasoning, none of which the page
   * itself downloads. Falls back to what is on screen if it cannot be read. */
  const fetchFullResults = async (): Promise<TestCaseResult[]> => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) return merged;
    try {
      const res = await fetch(`${backendUrl}/public/test-run/${token}`, {
        headers: { accept: "application/json" },
      });
      if (!res.ok) return merged;
      const full: TestRunStatusResponse = await res.json();
      return full.results ?? merged;
    } catch {
      return merged;
    }
  };

  return (
    <PublicPageLayout
      title={
        data.name
          ? runDisplayName("llm-unit-test", data.name)
          : "LLM component test"
      }
      pills={runState ? <RunStateMark state={runState} /> : undefined}
      contentClassName="max-w-[92rem]"
    >
      <div className="space-y-4 md:space-y-6">
        {/* Tab nav */}
        <div className="relative flex items-end justify-between gap-2 border-b border-border">
          <div className="flex gap-2">
            <ResultTabs
              tabs={["summary", "tests", "about"]}
              activeTab={activeTab}
              onChange={setActiveTab}
            />
          </div>
          {activeTab === "tests" && nav && selectedId && (
            <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <ResultPager
                currentIndex={nav.currentIndex}
                total={nav.total}
                onPrev={nav.goPrev}
                onNext={nav.goNext}
              />
            </div>
          )}
          {results.length > 0 && (
            <div className="pb-2">
              <ExportResultsButton
                filename={`test-run-${token}`}
                getRows={async () =>
                  buildTestRunCsv(
                    (await fetchFullResults()).map((r) => ({
                      name: r.name || r.test_case?.name || r.test_name,
                      status: isUnanswered(r)
                        ? "error"
                        : statusOf(r),
                      output: r.output,
                      testCase: r.test_case,
                      reasoning: r.reasoning,
                      judgeResults: r.judge_results,
                    })),
                    evaluatorsByUuid,
                  )
                }
              />
            </div>
          )}
        </div>

        {/* Results tab */}
        {activeTab === "summary" && (
          <TestRunSummary
            passed={passed}
            total={passed + failed}
            unanswered={unansweredCount}
            notRun={couldNotRun - unansweredCount}
            stoppedEarly={data.stopped_early === true}
            stopped={data.aborted === true}
            failureDetails={runFailed ? (runErrorText(data.error) ?? "") : null}
            runTotalTests={data.total_tests ?? results.length}
            onReviewUnanswered={() => setActiveTab("tests")}
            latency={data.latency_ms ?? null}
            cost={data.cost ?? null}
            tokens={data.total_tokens ?? null}
            toolCall={toolCall}
            toolCallEvaluatorUuid={toolCallEvaluatorUuidFromRows(
              merged.map((r) => ({
                testCase: r.test_case,
                judgeResults: r.judge_results,
              })),
            )}
            evaluatorSummary={evaluatorSummary}
            enableEvaluatorLinks={false}
          />
        )}

        {/* Tests tab */}
        {activeTab === "tests" && results.length > 0 && (
          <div
            className="border border-border rounded-xl overflow-hidden"
            style={{ height: "calc(100vh - 220px)", minHeight: 620 }}
          >
            <TestRunOutputsPanel
              results={merged.map((r, i) => ({
                id: `test-${i}`,
                name:
                  r.name || r.test_case?.name || r.test_name || `Test ${i + 1}`,
                status: statusOf(r),
                unanswered: isUnanswered(r),
                output: r.output ?? undefined,
                testCase: r.test_case ?? undefined,
                reasoning: r.reasoning,
                inputs: r.inputs ?? undefined,
                judgeResults: r.judge_results ?? null,
                loading: r.loading,
              }))}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onClearSelection={() => setSelectedId(null)}
              onNavChange={setNav}
              evaluatorsByUuid={evaluatorsByUuid}
              enableEvaluatorLinks={false}
            />
          </div>
        )}

        {/* About tab — explains the metrics (latency is p50, cost/tokens mean). */}
        {activeTab === "about" && (
          <LLMEvaluationAbout
            showToolCalls={toolCall.total > 0}
            showLatency={!!data.latency_ms}
            showCost={!!data.cost}
            showTokens={!!data.total_tokens}
            evaluators={evaluatorSummaryToAbout(evaluatorSummary)}
          />
        )}
      </div>
    </PublicPageLayout>
  );
}
