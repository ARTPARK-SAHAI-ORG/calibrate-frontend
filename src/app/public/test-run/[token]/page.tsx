"use client";

import React, { useState, useEffect } from "react";
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
  buildEvaluatorSummaryFromResults,
  toolCallEvaluatorUuidFromRows,
  toolCallPassFail,
} from "@/lib/testRunSummary";
import type { AggStat, LatencyStat } from "@/lib/llmMetrics";
import { isNotRun, isRunStopped, isUnanswered } from "@/lib/testTypes";
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
  output?: TestCaseOutput | null;
  test_case?: TestCaseData | null;
  judge_results?: JudgeResult[] | null;
  /** Per-case agent latency (ms) / cost (USD). */
  latency_ms?: number | null;
  cost?: number | null;
};

type TestRunStatusResponse = {
  task_id: string;
  status: string;
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

  useEffect(() => {
    document.title = "LLM component test | Calibrate";
  }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) throw new Error("Backend URL not configured");

        const res = await fetch(`${backendUrl}/public/test-run/${token}`, {
          headers: { accept: "application/json" },
        });

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
      toolCall: r.test_case?.evaluation?.type === "tool_call",
      passed: getStatus(r, wasStopped) === "passed",
      failed: getStatus(r, wasStopped) === "failed" && !isUnanswered(r),
    })),
  );

  return (
    <PublicPageLayout
      title="LLM component test"
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
                getRows={() =>
                  buildTestRunCsv(
                    results.map((r) => ({
                      name: r.name || r.test_case?.name || r.test_name,
                      status: isUnanswered(r)
                        ? "error"
                        : getStatus(r, wasStopped),
                      output: r.output,
                      testCase: r.test_case,
                      reasoning: r.reasoning,
                      judgeResults: r.judge_results,
                    })),
                    Object.fromEntries(
                      (data.evaluators ?? []).map((e) => [e.uuid, e]),
                    ),
                  )
                }
              />
            </div>
          )}
        </div>

        {/* Summary tab. Single runs don't carry a backend evaluator_summary,
            so derive per-evaluator metrics from the cases' judge_results. */}
        {activeTab === "summary" && (
          <TestRunSummary
            passed={passed}
            total={passed + failed}
            unanswered={data.unanswered_tests ?? 0}
            stoppedEarly={data.stopped_early === true}
            stopped={data.aborted === true}
            onReviewUnanswered={() => setActiveTab("outputs")}
            latency={data.latency_ms ?? null}
            cost={data.cost ?? null}
            tokens={data.total_tokens ?? null}
            toolCall={toolCall}
            toolCallEvaluatorUuid={toolCallEvaluatorUuidFromRows(
              results.map((r) => ({
                testCase: r.test_case,
                judgeResults: r.judge_results,
              })),
            )}
            evaluatorSummary={buildEvaluatorSummaryFromResults(
              results,
              Object.fromEntries(
                (data.evaluators ?? []).map((e) => [e.uuid, e]),
              ),
            )}
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
              results={results.map((r, i) => ({
                id: `test-${i}`,
                name:
                  r.name || r.test_case?.name || r.test_name || `Test ${i + 1}`,
                status: getStatus(r, wasStopped),
                unanswered: isUnanswered(r),
                output: r.output ?? undefined,
                testCase: r.test_case ?? undefined,
                reasoning: r.reasoning,
                judgeResults: r.judge_results ?? null,
              }))}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onClearSelection={() => setSelectedId(null)}
              onNavChange={setNav}
              evaluatorsByUuid={Object.fromEntries(
                (data.evaluators ?? []).map((e) => [e.uuid, e]),
              )}
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
            evaluators={evaluatorSummaryToAbout(
              buildEvaluatorSummaryFromResults(
                results,
                Object.fromEntries(
                  (data.evaluators ?? []).map((e) => [e.uuid, e]),
                ),
              ),
            )}
          />
        )}
      </div>
    </PublicPageLayout>
  );
}
