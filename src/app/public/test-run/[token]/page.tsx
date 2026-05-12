"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { TestCaseOutput, TestCaseData, JudgeResult } from "@/components/test-results/shared";
import { PublicPageLayout, PublicNotFound, PublicLoading } from "@/components/PublicPageLayout";
import { TestRunOutputsPanel } from "@/components/eval-details";
import { ExportResultsButton } from "@/components/ExportResultsButton";
import { buildTestRunCsv } from "@/lib/exportTestResults";

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
  error?: string;
};

type TestRunStatusResponse = {
  task_id: string;
  status: string;
  total_tests?: number;
  passed?: number;
  failed?: number;
  results?: TestCaseResult[];
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
  const failed = results.filter((r) => getStatus(r) === "failed").length;

  return (
    <PublicPageLayout title="LLM unit test" contentClassName="max-w-[92rem]">
      <div className="space-y-4 md:space-y-6">
        {/* Summary stats */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400">
                {passed} passed
              </span>
              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400">
                {failed} failed
              </span>
            </div>
            <span className="text-[13px] text-muted-foreground">{results.length} total tests</span>
          </div>
          {results.length > 0 && (
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
                )
              }
            />
          )}
        </div>

        {results.length > 0 && (
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
              enableEvaluatorLinks={false}
            />
          </div>
        )}
      </div>
    </PublicPageLayout>
  );
}
