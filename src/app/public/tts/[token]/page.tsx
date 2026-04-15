"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import { ttsProviders } from "@/components/agent-tabs/constants/providers";
import { LeaderboardBarChart, getColorMap } from "@/components/charts/LeaderboardBarChart";
import { DownloadableTable } from "@/components/DownloadableTable";
import { Tooltip } from "@/components/Tooltip";
import { PublicPageLayout, PublicNotFound, PublicLoading } from "@/components/PublicPageLayout";

type LatencyMetric = { mean: number; std: number; values: number[] };

type ProviderMetrics = {
  llm_judge_score: number;
  ttfb: LatencyMetric;
  processing_time: LatencyMetric;
};

type ProviderResult = {
  provider: string;
  success: boolean | null;
  message: string;
  metrics: ProviderMetrics | null;
  results: Array<{
    id: string;
    text: string;
    audio_path: string;
    llm_judge_score?: string;
    llm_judge_reasoning?: string;
  }> | null;
};

type LeaderboardSummary = {
  run: string;
  count: number;
  llm_judge_score: number;
  ttfb: number;
  processing_time: number;
};

type EvaluationResult = {
  task_id: string;
  status: "queued" | "in_progress" | "done" | "failed";
  language?: string;
  dataset_name?: string | null;
  provider_results?: ProviderResult[];
  leaderboard_summary?: LeaderboardSummary[];
  error?: string | null;
};

const getProviderLabel = (value: string): string => {
  const provider = ttsProviders.find((p) => p.value === value);
  return provider ? provider.label : value;
};

export default function PublicTTSPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<EvaluationResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<"leaderboard" | "outputs" | "about">("leaderboard");
  const [activeProviderTab, setActiveProviderTab] = useState<string | null>(null);

  useEffect(() => { document.title = "Text-to-speech evaluation | Calibrate"; }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) throw new Error("Backend URL not configured");

        const res = await fetch(`${backendUrl}/public/tts/${token}`, {
          headers: { accept: "application/json", "ngrok-skip-browser-warning": "true" },
        });

        if (res.status === 404) { setNotFound(true); return; }
        if (!res.ok) throw new Error("Failed to load results");

        const result: EvaluationResult = await res.json();
        if (result.status !== "done") { setNotFound(true); return; }

        setData(result);
        if (result.provider_results?.length) {
          setActiveProviderTab(result.provider_results[0].provider);
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

  return (
    <PublicPageLayout
      title="Text-to-speech evaluation"
      pills={
        <>
          {data.language && (
            <span className="px-2 py-0.5 text-[11px] font-medium bg-muted rounded-full text-muted-foreground capitalize">
              {data.language}
            </span>
          )}
          {data.dataset_name && (
            <span className="flex items-center gap-1 px-2 py-0.5 text-[11px] font-medium bg-muted rounded-full text-muted-foreground">
              <svg className="w-3 h-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25 4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125" />
              </svg>
              {data.dataset_name}
            </span>
          )}
        </>
      }
    >
      <div className="space-y-4 md:space-y-6">

        {data.provider_results && data.provider_results.length > 0 && (
          <>
            {/* Tab Nav */}
            <div className="flex gap-2 border-b border-border">
              {(["leaderboard", "outputs", "about"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors cursor-pointer capitalize ${
                    activeTab === tab ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Leaderboard Tab */}
            {activeTab === "leaderboard" && (
              <div className="space-y-4 md:space-y-6">
                {data.leaderboard_summary && data.leaderboard_summary.length > 0 && (
                  <>
                    <DownloadableTable
                      columns={[
                        { key: "run", header: "Run", render: (v) => getProviderLabel(v) },
                        { key: "llm_judge_score", header: "LLM Judge Score" },
                        { key: "ttfb", header: "TTFB (s)", render: (v) => v != null ? parseFloat(v.toFixed(4)) : "-" },
                      ]}
                      data={data.leaderboard_summary}
                      filename="tts-evaluation-leaderboard"
                    />
                    {(() => {
                      const names = data.leaderboard_summary!.map((s) => s.run);
                      const colorMap = getColorMap(names);
                      return (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
                          <LeaderboardBarChart
                            title="LLM Judge Score"
                            data={data.leaderboard_summary!.map((s) => ({ label: getProviderLabel(s.run), value: s.llm_judge_score, colorKey: s.run }))}
                            colorMap={colorMap}
                            yDomain={[0, 1]}
                          />
                          <LeaderboardBarChart
                            title="TTFB (s)"
                            data={data.leaderboard_summary!.map((s) => ({ label: getProviderLabel(s.run), value: s.ttfb, colorKey: s.run }))}
                            colorMap={colorMap}
                          />
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>
            )}

            {/* Outputs Tab */}
            {activeTab === "outputs" && (
              <div className="flex flex-col md:flex-row border border-border rounded-xl overflow-hidden" style={{ minHeight: 480 }}>
                {/* Provider sidebar */}
                <div className="md:w-64 border-b md:border-b-0 md:border-r border-border flex flex-col overflow-hidden bg-muted/10">
                  <div className="overflow-x-auto md:overflow-x-visible md:overflow-y-auto md:flex-1 p-2">
                    <div className="flex md:flex-col gap-1 min-w-max md:min-w-0">
                      {data.provider_results!.map((pr) => {
                        const isSelected = (activeProviderTab ?? data.provider_results![0]?.provider) === pr.provider;
                        return (
                          <div
                            key={pr.provider}
                            onClick={() => setActiveProviderTab(pr.provider)}
                            className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors whitespace-nowrap ${isSelected ? "bg-muted" : "hover:bg-muted/50"}`}
                          >
                            {pr.success === true ? (
                              <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                                <svg className="w-3 h-3 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" /></svg>
                              </div>
                            ) : (
                              <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                                <svg className="w-3 h-3 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                              </div>
                            )}
                            <span className="text-sm text-foreground truncate">{getProviderLabel(pr.provider)}</span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                {/* Right panel */}
                <div className="flex-1 overflow-y-auto p-4 md:p-6">
                  {(() => {
                    const selectedProvider = activeProviderTab ?? data.provider_results![0]?.provider;
                    const pr = data.provider_results!.find((p) => p.provider === selectedProvider);
                    if (!pr) return <p className="text-muted-foreground">Select a provider</p>;
                    if (pr.success === false) return (
                      <div className="border border-red-500/50 bg-red-500/10 rounded-lg p-4 max-w-md text-center">
                        <div className="text-red-500 text-[14px] font-medium">There was an error running this provider.</div>
                      </div>
                    );

                    return (
                      <div className="space-y-4 md:space-y-6">
                        {/* Overall Metrics */}
                        {pr.metrics && (
                          <div className="border rounded-xl p-4 bg-muted/10">
                            <h3 className="text-[15px] font-semibold mb-4">Overall Metrics</h3>
                            <div className="grid grid-cols-2 gap-4">
                              <div>
                                <div className="text-[12px] text-muted-foreground mb-1">LLM Judge Score</div>
                                <div className="text-base md:text-[18px] font-semibold text-foreground">{pr.metrics.llm_judge_score ?? "-"}</div>
                              </div>
                              <div>
                                <div className="text-[12px] text-muted-foreground mb-1">TTFB (s)</div>
                                <div className="text-base md:text-[18px] font-semibold text-foreground">
                                  {pr.metrics.ttfb?.mean != null ? parseFloat(pr.metrics.ttfb.mean.toFixed(4)) : "-"}
                                </div>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* Results */}
                        {pr.results && pr.results.length > 0 && (
                          <>
                            <div className="hidden md:block border rounded-xl overflow-hidden">
                              <table className="w-full table-fixed">
                                <thead className="bg-muted/50 border-b border-border">
                                  <tr>
                                    <th className="w-12 px-4 py-3 text-left text-[12px] font-medium text-foreground">ID</th>
                                    <th className="w-[30%] px-4 py-3 text-left text-[12px] font-medium text-foreground">Text</th>
                                    <th className="w-[50%] px-4 py-3 text-left text-[12px] font-medium text-foreground">Audio</th>
                                    <th className="w-28 px-4 py-3 text-left text-[12px] font-medium text-foreground">LLM Judge</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {pr.results.map((row, i) => {
                                    const scoreStr = String(row.llm_judge_score || "").toLowerCase();
                                    const passed = scoreStr === "true" || scoreStr === "1";
                                    return (
                                      <tr key={i} className="border-b border-border last:border-b-0">
                                        <td className="px-4 py-3 text-[13px] text-foreground">{i + 1}</td>
                                        <td className="px-4 py-3 text-[13px] text-foreground break-words">{row.text}</td>
                                        <td className="px-4 py-3">
                                          {row.audio_path ? (
                                            <audio controls src={row.audio_path} className="h-8 w-full" />
                                          ) : (
                                            <span className="text-muted-foreground text-[12px]">—</span>
                                          )}
                                        </td>
                                        <td className="px-4 py-3">
                                          {row.llm_judge_score ? (
                                            <div className="flex items-center gap-1.5">
                                              <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${passed ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"}`}>
                                                {passed ? "Pass" : "Fail"}
                                              </span>
                                              {row.llm_judge_reasoning && (
                                                <Tooltip content={row.llm_judge_reasoning}>
                                                  <button type="button" className="p-1 rounded-md hover:bg-muted transition-colors cursor-pointer">
                                                    <svg className="w-4 h-4 text-muted-foreground" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
                                                  </button>
                                                </Tooltip>
                                              )}
                                            </div>
                                          ) : <span className="text-muted-foreground text-[12px]">—</span>}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>

                            {/* Mobile cards */}
                            <div className="md:hidden space-y-3">
                              {pr.results.map((row, i) => {
                                const scoreStr = String(row.llm_judge_score || "").toLowerCase();
                                const passed = scoreStr === "true" || scoreStr === "1";
                                return (
                                  <div key={i} className="border border-border rounded-xl p-4 space-y-3">
                                    <span className="text-[12px] text-muted-foreground font-medium">#{i + 1}</span>
                                    <div>
                                      <span className="text-[11px] text-muted-foreground uppercase tracking-wide">Text</span>
                                      <p className="text-[13px] text-foreground mt-0.5">{row.text}</p>
                                    </div>
                                    {row.audio_path && <audio controls src={row.audio_path} className="w-full h-8" />}
                                    {row.llm_judge_score && (
                                      <span className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${passed ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400" : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"}`}>
                                        {passed ? "Pass" : "Fail"}
                                      </span>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          </>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* About Tab */}
            {activeTab === "about" && (
              <div className="border rounded-xl overflow-hidden">
                <table className="w-full">
                  <thead className="bg-muted/50 border-b border-border">
                    <tr>
                      {["Metric", "Description", "Preference", "Range"].map((h) => (
                        <th key={h} className="px-4 py-3 text-left text-[13px] font-medium text-foreground">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      { metric: "LLM Judge", description: "Evaluates whether synthesized audio accurately matches the reference text, returning Pass if the audio correctly represents the input.", preference: "Pass is better", range: "Pass / Fail" },
                      { metric: "TTFB (Time To First Byte)", description: "Latency from when a request is sent until the first byte of the response is received.", preference: "Lower is better", range: "0 - ∞" },
                      { metric: "Processing Time", description: "Total time taken to synthesize the audio.", preference: "Lower is better", range: "0 - ∞" },
                    ].map((row) => (
                      <tr key={row.metric} className="border-b border-border last:border-b-0">
                        <td className="px-4 py-3 text-[13px] font-medium text-foreground">{row.metric}</td>
                        <td className="px-4 py-3 text-[13px] text-foreground">{row.description}</td>
                        <td className="px-4 py-3 text-[13px] text-foreground">{row.preference}</td>
                        <td className="px-4 py-3 text-[13px] text-foreground">{row.range}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </PublicPageLayout>
  );
}
