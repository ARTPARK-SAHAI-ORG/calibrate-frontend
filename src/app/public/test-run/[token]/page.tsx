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
import { PublicPageLayout, PublicNotFound, PublicLoading } from "@/components/PublicPageLayout";
import { TestRunOutputsPanel, TestRunSummary } from "@/components/eval-details";
import { ExportResultsButton } from "@/components/ExportResultsButton";
import { buildTestRunCsv } from "@/lib/exportTestResults";
import {
  buildEvaluatorSummaryFromResults,
  toolCallPassFail,
} from "@/lib/testRunSummary";
import type { AggStat } from "@/lib/llmMetrics";

type TestCaseResult = {
  test_uuid?: string;
  test_name?: string;
  name?: string;
  status?: "passed" | "failed" | "error";
  passed?: boolean | null;
  reasoning?: string;
  output?: TestCaseOutput | null;
  test_case?: TestCaseData | null;
  chat_history?: { role: string; content: string }[];
  evaluation?: { passed: boolean; message?: string; details?: Record<string, any> };
  judge_results?: JudgeResult[] | null;
  /** Per-case agent latency (ms) / cost (USD) / total tokens. */
  latency_ms?: number | null;
  cost?: number | null;
  total_tokens?: number | null;
  error?: string;
};

type TestRunStatusResponse = {
  task_id: string;
  status: string;
  total_tests?: number;
  passed?: number;
  failed?: number;
  results?: TestCaseResult[];
  /** Top-level per-evaluator metadata block — see TestRunEvaluator. */
  evaluators?: TestRunEvaluator[];
  /** Aggregate per-test latency / cost / total tokens ({mean,min,max,count} | null). */
  latency_ms?: AggStat;
  cost?: AggStat;
  total_tokens?: AggStat;
  error?: string;
};

function getStatus(r: TestCaseResult): "passed" | "failed" {
  if (r.passed === true || r.status === "passed") return "passed";
  return "failed";
}

export default function PublicTestRunPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<TestRunStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [nav, setNav] = useState<PagerNav | null>(null);
  const [activeTab, setActiveTab] = useState<"summary" | "outputs">("summary");

  useEffect(() => { document.title = "LLM unit test | Calibrate"; }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) throw new Error("Backend URL not configured");

        const res = await fetch(`${backendUrl}/public/test-run/${token}`, {
          headers: { accept: "application/json" },
        });

        if (res.status === 404) { setNotFound(true); return; }
        if (!res.ok) throw new Error("Failed to load results");

        const result: TestRunStatusResponse = await res.json();
        if (result.status !== "done" && result.status !== "completed") { setNotFound(true); return; }

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

  if (isLoading) return <PublicPageLayout><PublicLoading /></PublicPageLayout>;
  if (notFound || !data) return <PublicPageLayout><PublicNotFound /></PublicPageLayout>;

  const results = data.results ?? [];
  const passed = results.filter((r) => getStatus(r) === "passed").length;
  // Errored tests carry an `error`; keep them out of the pass-rate denominator
  // so the rate matches the scored tests.
  const failed = results.filter(
    (r) => getStatus(r) === "failed" && !r.error,
  ).length;
  // Tool-call pass/fail split for the Summary tab's dedicated card.
  const toolCall = toolCallPassFail(
    results.map((r) => ({
      toolCall: r.test_case?.evaluation?.type === "tool_call",
      passed: getStatus(r) === "passed",
      failed: getStatus(r) === "failed" && !r.error,
    })),
  );

  return (
    <PublicPageLayout title="LLM unit test" contentClassName="max-w-[92rem]">
      <div className="space-y-4 md:space-y-6">
        {/* Tab nav */}
        <div className="relative flex items-end justify-between gap-2 border-b border-border">
          <div className="flex gap-2">
            {(["summary", "outputs"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors cursor-pointer capitalize ${activeTab === tab ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {tab}
              </button>
            ))}
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
                      status: getStatus(r),
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
            latency={data.latency_ms ?? null}
            cost={data.cost ?? null}
            tokens={data.total_tokens ?? null}
            toolCall={toolCall}
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
          <div className="border border-border rounded-xl overflow-hidden" style={{ height: "calc(100vh - 220px)", minHeight: 620 }}>
            <TestRunOutputsPanel
              results={results.map((r, i) => ({
                id: `test-${i}`,
                name: r.name || r.test_case?.name || r.test_name || `Test ${i + 1}`,
                status: getStatus(r),
                output: r.output ?? undefined,
                testCase: r.test_case ?? undefined,
                reasoning: r.reasoning,
                evaluation: r.evaluation ?? { passed: getStatus(r) === "passed" },
                judgeResults: r.judge_results ?? null,
                error: r.error,
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
      </div>
    </PublicPageLayout>
  );
}
