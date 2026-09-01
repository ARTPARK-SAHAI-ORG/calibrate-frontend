"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
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
import { ResultTabs } from "@/components/ui";
import { buildTestRunCsv } from "@/lib/exportTestResults";
import {
  isToolCallRow,
  runEvaluatorSummary,
  toolCallEvaluatorUuidFromRows,
  toolCallPassFail,
} from "@/lib/testRunSummary";
import type { BenchmarkEvaluatorSummaryEntry } from "@/lib/benchmarkEvaluatorSummary";
import type { AggStat, LatencyStat } from "@/lib/llmMetrics";
import {
  isNotRun,
  isRunStopped,
  isUnanswered,
  runDisplayName,
} from "@/lib/testTypes";
import { StoppedRunPill } from "@/components/ui";

type TestCaseResult = {
  test_case_id?: string;
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
  error?: string;
};

function getStatus(
  r: TestCaseResult,
  runStopped: boolean,
): "passed" | "failed" | "not_run" {
  if (isNotRun(r, runStopped)) return "not_run";
  return r.passed === true ? "passed" : "failed";
}

export default function PublicTestRunPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<TestRunStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nav, setNav] = useState<PagerNav | null>(null);
  const [activeTab, setActiveTab] = useState<"summary" | "outputs" | "about">(
    "summary",
  );
  // Cases read in full, keyed by test id, so reopening one costs nothing.
  const [cases, setCases] = useState<Record<string, TestCaseResult>>({});
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
      if (requestedCases.current.has(testCaseId)) return;
      requestedCases.current.add(testCaseId);
      try {
        const res = await fetch(
          `${backendUrl}/public/test-run/${token}/results/${testCaseId}`,
          { headers: { accept: "application/json" } },
        );
        if (!res.ok) {
          requestedCases.current.delete(testCaseId);
          return;
        }
        const full: TestCaseResult = await res.json();
        setCases((prev) => ({ ...prev, [testCaseId]: full }));
      } catch {
        // The rest of the page stays up; the row keeps what the run gave it.
        requestedCases.current.delete(testCaseId);
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
        if (result.status !== "done" && result.status !== "completed") {
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
    if (row?.test_case_id) fetchCase(row.test_case_id);
  }, [selectedId, data, fetchCase]);

  // ponytail: the id of the evaluator that judged the tool-call tests is only
  // in a case's judge_results, which the summary leaves out, so read the first
  // tool-call case in full. Drop this once the run itself names it.
  useEffect(() => {
    const row = (data?.results ?? []).find(isToolCallRow);
    if (row?.test_case_id) fetchCase(row.test_case_id);
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
  const merged = results.map((r) =>
    r.test_case_id && cases[r.test_case_id]
      ? { ...r, ...cases[r.test_case_id] }
      : r,
  );
  // Someone stopped this run before it finished, so the tests it never started
  // are neither passes nor failures.
  const wasStopped = isRunStopped(data);
  const passed = results.filter((r) => getStatus(r, wasStopped) === "passed")
    .length;
  // A test that produced no answer was never scored; keep it out of the
  // pass-rate denominator so the rate matches the tests that were.
  const failed = results.filter(
    (r) => getStatus(r, wasStopped) === "failed" && !isUnanswered(r),
  ).length;
  // Tool-call pass/fail split for the Summary tab's dedicated card.
  const toolCall = toolCallPassFail(
    results.map((r) => ({
      toolCall: isToolCallRow(r),
      passed: getStatus(r, wasStopped) === "passed",
      failed: getStatus(r, wasStopped) === "failed" && !isUnanswered(r),
    })),
  );
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
      pills={wasStopped ? <StoppedRunPill /> : undefined}
      contentClassName="max-w-[92rem]"
    >
      <div className="space-y-4 md:space-y-6">
        {/* Tab nav */}
        <div className="relative flex items-end justify-between gap-2 border-b border-border">
          <div className="flex gap-2">
            <ResultTabs
              tabs={["summary", "outputs", "about"]}
              activeTab={activeTab}
              onChange={setActiveTab}
            />
          </div>
          {activeTab === "outputs" && nav && selectedId && (
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
                        : getStatus(r, wasStopped),
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

        {/* Summary tab */}
        {activeTab === "summary" && (
          <TestRunSummary
            passed={passed}
            total={passed + failed}
            unanswered={data.unanswered_tests ?? 0}
            stoppedEarly={data.stopped_early === true}
            stopped={data.aborted === true}
            runTotalTests={data.total_tests ?? results.length}
            onReviewUnanswered={() => setActiveTab("outputs")}
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

        {/* Outputs tab */}
        {activeTab === "outputs" && results.length > 0 && (
          <div
            className="border border-border rounded-xl overflow-hidden"
            style={{ height: "calc(100vh - 220px)", minHeight: 620 }}
          >
            <TestRunOutputsPanel
              results={merged.map((r, i) => ({
                id: `test-${i}`,
                name:
                  r.name || r.test_case?.name || r.test_name || `Test ${i + 1}`,
                status: getStatus(r, wasStopped),
                unanswered: isUnanswered(r),
                output: r.output ?? undefined,
                testCase: r.test_case ?? undefined,
                reasoning: r.reasoning,
                inputs: r.inputs ?? undefined,
                judgeResults: r.judge_results ?? null,
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
