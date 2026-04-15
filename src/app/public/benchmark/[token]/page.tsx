"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  TestCaseOutput,
  TestCaseData,
  StatusIcon,
  TestDetailView,
  EvaluationCriteriaPanel,
} from "@/components/test-results/shared";
import { LeaderboardBarChart, getColorMap } from "@/components/charts/LeaderboardBarChart";
import { DownloadableTable } from "@/components/DownloadableTable";
import { PublicPageLayout, PublicNotFound, PublicLoading } from "@/components/PublicPageLayout";

type BenchmarkTestResult = {
  name?: string;
  passed: boolean | null;
  reasoning?: string;
  output?: TestCaseOutput;
  test_case?: TestCaseData;
};

type ModelResult = {
  model: string;
  success: boolean | null;
  message: string;
  total_tests: number | null;
  passed: number | null;
  failed: number | null;
  test_results: BenchmarkTestResult[] | null;
};

type LeaderboardSummary = {
  model: string;
  passed: string;
  total: string;
  pass_rate: string;
};

type BenchmarkStatusResponse = {
  task_id: string;
  status: string;
  model_results?: ModelResult[];
  leaderboard_summary?: LeaderboardSummary[];
  error?: string;
};

export default function PublicBenchmarkPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<BenchmarkStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<"leaderboard" | "outputs">("leaderboard");
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());
  const [selectedTest, setSelectedTest] = useState<{ model: string; testIndex: number } | null>(null);

  useEffect(() => { document.title = "Benchmark | Calibrate"; }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) throw new Error("Backend URL not configured");

        const res = await fetch(`${backendUrl}/public/benchmark/${token}`, {
          headers: { accept: "application/json", "ngrok-skip-browser-warning": "true" },
        });

        if (res.status === 404) { setNotFound(true); return; }
        if (!res.ok) throw new Error("Failed to load results");

        const result: BenchmarkStatusResponse = await res.json();
        if (result.status !== "done" && result.status !== "completed") { setNotFound(true); return; }

        setData(result);
        // Auto-expand first model
        if (result.model_results?.length) {
          setExpandedModels(new Set([result.model_results[0].model]));
        }
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

  const toggleModel = (model: string) => {
    setExpandedModels((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  };

  const selectedModelResult = selectedTest
    ? data.model_results?.find((m) => m.model === selectedTest.model)
    : null;
  const selectedTestResult = selectedModelResult?.test_results?.[selectedTest?.testIndex ?? -1] ?? null;

  return (
    <PublicPageLayout>
      <div className="space-y-4 md:space-y-6">
        {/* Tab nav */}
        <div className="flex gap-2 border-b border-border">
          {(["leaderboard", "outputs"] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors cursor-pointer capitalize ${activeTab === tab ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Leaderboard Tab */}
        {activeTab === "leaderboard" && data.leaderboard_summary && data.leaderboard_summary.length > 0 && (
          <div className="space-y-4 md:space-y-6">
            <DownloadableTable
              columns={[
                { key: "model", header: "Model" },
                { key: "passed", header: "Passed" },
                { key: "total", header: "Total" },
                {
                  key: "pass_rate",
                  header: "Pass Rate",
                  render: (v) => {
                    const pct = parseFloat(v) * 100;
                    return `${pct.toFixed(1)}%`;
                  },
                },
              ]}
              data={data.leaderboard_summary}
              filename="benchmark-leaderboard"
            />
            {(() => {
              const models = data.leaderboard_summary!.map((s) => s.model);
              const colorMap = getColorMap(models);
              return (
                <LeaderboardBarChart
                  title="Pass Rate by Model"
                  data={data.leaderboard_summary!.map((s) => ({
                    label: s.model,
                    value: parseFloat(s.pass_rate),
                    colorKey: s.model,
                  }))}
                  colorMap={colorMap}
                  yDomain={[0, 1]}
                />
              );
            })()}
          </div>
        )}

        {/* Outputs Tab */}
        {activeTab === "outputs" && data.model_results && data.model_results.length > 0 && (
          <div className="flex border border-border rounded-xl overflow-hidden" style={{ height: "calc(100vh - 260px)", minHeight: 520 }}>
            {/* Left — model list + test list */}
            <div className="w-72 shrink-0 border-r border-border flex flex-col overflow-hidden bg-muted/10">
              <div className="overflow-y-auto flex-1">
                {data.model_results.map((mr) => {
                  const isExpanded = expandedModels.has(mr.model);
                  const passRate = mr.total_tests && mr.passed != null
                    ? `${mr.passed}/${mr.total_tests}`
                    : null;
                  return (
                    <div key={mr.model} className="border-b border-border last:border-b-0">
                      {/* Model row */}
                      <button
                        type="button"
                        onClick={() => toggleModel(mr.model)}
                        className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors cursor-pointer"
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <svg className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${isExpanded ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                          <span className="text-[13px] font-medium text-foreground truncate">{mr.model}</span>
                        </div>
                        {passRate && (
                          <span className="text-[12px] text-muted-foreground shrink-0 ml-2">{passRate}</span>
                        )}
                      </button>

                      {/* Tests within this model */}
                      {isExpanded && mr.test_results && (
                        <div className="px-2 pb-2 space-y-0.5">
                          {mr.test_results.map((tr, ti) => {
                            const isSelected = selectedTest?.model === mr.model && selectedTest.testIndex === ti;
                            const testStatus = tr.passed === true ? "passed" : tr.passed === false ? "failed" : "running";
                            const name = tr.name || tr.test_case?.name || `Test ${ti + 1}`;
                            return (
                              <button
                                key={ti}
                                type="button"
                                onClick={() => setSelectedTest({ model: mr.model, testIndex: ti })}
                                className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors text-left ${isSelected ? "bg-muted" : "hover:bg-muted/50"}`}
                              >
                                <StatusIcon status={testStatus} />
                                <span className="text-[13px] text-foreground truncate">{name}</span>
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Right — test detail */}
            <div className="flex-1 overflow-y-auto">
              {selectedTestResult ? (
                <div className="flex h-full">
                  <div className="flex-1 overflow-y-auto p-4 md:p-6">
                    <TestDetailView
                      history={selectedTestResult.test_case?.history || []}
                      output={selectedTestResult.output}
                      passed={selectedTestResult.passed ?? false}
                      reasoning={selectedTestResult.reasoning}
                    />
                  </div>
                  {selectedTestResult.test_case?.evaluation && (
                    <div className="w-72 shrink-0 border-l border-border overflow-y-auto">
                      <EvaluationCriteriaPanel evaluation={selectedTestResult.test_case.evaluation} />
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-center h-full">
                  <p className="text-[13px] text-muted-foreground">Select a test to view details</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </PublicPageLayout>
  );
}
