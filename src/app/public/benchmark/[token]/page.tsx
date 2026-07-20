"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { PublicPageLayout, PublicNotFound, PublicLoading } from "@/components/PublicPageLayout";
import {
  BenchmarkCombinedLeaderboard,
  BenchmarkTopPicks,
  BenchmarkOutputsPanel,
  LLMEvaluationAbout,
  evaluatorColumnsToAbout,
} from "@/components/eval-details";
import type { BenchmarkModelResult } from "@/components/eval-details";
import {
  buildBenchmarkCombinedLeaderboardPayload,
  type BenchmarkLeaderboardSummaryRow,
} from "@/lib/benchmarkEvaluatorSummary";
import { ResultPager, type TestRunEvaluator, type PagerNav } from "@/components/test-results/shared";
import { ExportResultsButton } from "@/components/ExportResultsButton";
import { buildBenchmarkCsv } from "@/lib/exportTestResults";

type BenchmarkStatusResponse = {
  task_id: string;
  status: string;
  model_results?: BenchmarkModelResult[];
  leaderboard_summary?: BenchmarkLeaderboardSummaryRow[];
  /** Top-level per-evaluator metadata block — see TestRunEvaluator. */
  evaluators?: TestRunEvaluator[];
  error?: string;
};

export default function PublicBenchmarkPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<BenchmarkStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "leaderboard" | "top-picks" | "outputs" | "about"
  >("leaderboard");
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());
  const [selectedTest, setSelectedTest] = useState<{ model: string; testIndex: number } | null>(null);
  const [nav, setNav] = useState<PagerNav | null>(null);

  useEffect(() => { document.title = "LLM benchmark | Calibrate"; }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) throw new Error("Backend URL not configured");

        const res = await fetch(`${backendUrl}/public/benchmark/${token}`, {
          headers: { accept: "application/json" },
        });

        if (res.status === 404) { setNotFound(true); return; }
        if (!res.ok) throw new Error("Failed to load results");

        const result: BenchmarkStatusResponse = await res.json();
        if (result.status !== "done" && result.status !== "completed") { setNotFound(true); return; }

        setData(result);
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

  const benchmarkScoreLabel = "Test pass rate (%)";

  // Metric-presence plan for the About tab (only built when it's showing).
  const aboutPlan =
    activeTab === "about"
      ? (buildBenchmarkCombinedLeaderboardPayload(
          data.leaderboard_summary,
          data.model_results ?? [],
          benchmarkScoreLabel,
        )?.plan ?? null)
      : null;

  const toggleModel = (model: string) => {
    setExpandedModels((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  };

  return (
    <PublicPageLayout title="LLM benchmark" contentClassName="max-w-[92rem]">
      <div className="space-y-4 md:space-y-6">
        {/* Tab nav */}
        <div className="relative flex items-end justify-between gap-2 border-b border-border">
          <div className="flex gap-2">
            {(["leaderboard", "top-picks", "outputs", "about"] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors cursor-pointer capitalize ${activeTab === tab ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {{ leaderboard: "Leaderboard", "top-picks": "Top picks", outputs: "Outputs", about: "About" }[tab]}
              </button>
            ))}
          </div>
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
          {data.model_results && data.model_results.length > 0 && (
            <div className="pb-2">
              <ExportResultsButton
                filename={`benchmark-${token}`}
                getRows={() =>
                  buildBenchmarkCsv(
                    (data.model_results ?? []).flatMap((m) =>
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
                    Object.fromEntries(
                      (data.evaluators ?? []).map((e) => [e.uuid, e]),
                    ),
                  )
                }
              />
            </div>
          )}
        </div>

        {/* Leaderboard Tab */}
        {activeTab === "leaderboard" && (
          <BenchmarkCombinedLeaderboard
            leaderboardSummary={data.leaderboard_summary}
            modelResults={data.model_results ?? []}
            filename={`benchmark-leaderboard-${token.replace(/[^a-zA-Z0-9_-]/g, "_")}`}
            benchmarkScoreLabel={benchmarkScoreLabel}
          />
        )}

        {/* About Tab — explains the metrics (latency is p50, cost/tokens mean). */}
        {activeTab === "about" && (
          <LLMEvaluationAbout
            showToolCalls={!!aboutPlan?.showToolCallPassRate}
            showLatency={!!aboutPlan?.showLatency}
            showCost={!!aboutPlan?.showCost}
            showTokens={!!aboutPlan?.showTokens}
            evaluators={evaluatorColumnsToAbout(aboutPlan?.evaluators)}
          />
        )}

        {/* Top Picks Tab */}
        {activeTab === "top-picks" && (
          <BenchmarkTopPicks
            leaderboardSummary={data.leaderboard_summary}
            modelResults={data.model_results ?? []}
            filename={`benchmark-leaderboard-${token.replace(/[^a-zA-Z0-9_-]/g, "_")}`}
            benchmarkScoreLabel={benchmarkScoreLabel}
          />
        )}

        {/* Outputs Tab */}
        {activeTab === "outputs" && data.model_results && data.model_results.length > 0 && (
          <div className="border border-border rounded-xl overflow-hidden" style={{ height: "calc(100vh - 220px)", minHeight: 620 }}>
            <BenchmarkOutputsPanel
              modelResults={data.model_results}
              expandedModels={expandedModels}
              onToggleModel={toggleModel}
              onSetExpandedModels={setExpandedModels}
              selectedTest={selectedTest}
              onSelectTest={(model, testIndex) => setSelectedTest({ model, testIndex })}
              onClearSelection={() => setSelectedTest(null)}
              onNavChange={setNav}
              showControls={true}
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
