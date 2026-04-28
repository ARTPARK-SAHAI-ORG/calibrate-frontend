"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { PublicPageLayout, PublicNotFound, PublicLoading } from "@/components/PublicPageLayout";
import { LeaderboardTab, BenchmarkOutputsPanel } from "@/components/eval-details";
import type { BenchmarkTestResult, BenchmarkModelResult } from "@/components/eval-details";
import { ExportResultsButton } from "@/components/ExportResultsButton";
import { buildBenchmarkCsv } from "@/lib/exportTestResults";

type LeaderboardSummary = {
  model: string;
  passed: string;
  total: string;
  pass_rate: string;
};

type BenchmarkStatusResponse = {
  task_id: string;
  status: string;
  model_results?: BenchmarkModelResult[];
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

  useEffect(() => { document.title = "LLM benchmark | Calibrate"; }, []);

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

  return (
    <PublicPageLayout title="LLM benchmark">
      <div className="space-y-4 md:space-y-6">
        {/* Tab nav */}
        <div className="flex items-end justify-between gap-2 border-b border-border">
          <div className="flex gap-2">
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
                      })),
                    ),
                  )
                }
              />
            </div>
          )}
        </div>

        {/* Leaderboard Tab */}
        {activeTab === "leaderboard" && data.leaderboard_summary && (
          <LeaderboardTab
            columns={[
              { key: "model", header: "Model" },
              { key: "passed", header: "Passed" },
              { key: "total", header: "Total" },
              { key: "pass_rate", header: "Test pass rate (%)", render: (v) => `${parseFloat(v).toFixed(1)}%` },
            ]}
            data={data.leaderboard_summary}
            charts={[[{ title: "Pass Rate by Model", dataKey: "pass_rate", yDomain: [0, 100], formatTooltip: (v) => `${v.toFixed(1)}%` }]]}
            filename="benchmark-leaderboard"
            getLabel={(key) => key}
            nameKey="model"
          />
        )}

        {/* Outputs Tab */}
        {activeTab === "outputs" && data.model_results && data.model_results.length > 0 && (
          <div className="border border-border rounded-xl overflow-hidden" style={{ height: "calc(100vh - 260px)", minHeight: 520 }}>
            <BenchmarkOutputsPanel
              modelResults={data.model_results}
              expandedModels={expandedModels}
              onToggleModel={toggleModel}
              onSetExpandedModels={setExpandedModels}
              selectedTest={selectedTest}
              onSelectTest={(model, testIndex) => setSelectedTest({ model, testIndex })}
              onClearSelection={() => setSelectedTest(null)}
              showControls={true}
            />
          </div>
        )}
      </div>
    </PublicPageLayout>
  );
}
