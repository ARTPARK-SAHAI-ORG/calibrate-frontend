"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { AppLayout } from "@/components/AppLayout";
import { BackHeader, StatusBadge } from "@/components/ui";
import { ttsProviders } from "@/components/agent-tabs/constants/providers";
import {
  LeaderboardBarChart,
  getColorMap,
} from "@/components/charts/LeaderboardBarChart";
import { DownloadableTable } from "@/components/DownloadableTable";

type MetricItem =
  | { llm_judge_score: number }
  | {
      metric_name: string;
      processor: string;
      mean: number;
      std: number;
      values: number[];
    };

type ProviderResult = {
  provider: string;
  success: boolean;
  message: string;
  metrics: MetricItem[];
  results: Array<{
    id: string;
    text: string;
    audio_path: string;
    llm_judge_score: string;
    llm_judge_reasoning: string;
  }>;
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
  status: "queued" | "in_progress" | "done";
  provider_results?: ProviderResult[];
  leaderboard_summary?: LeaderboardSummary[];
  error?: string | null;
};

// Helper function to map provider value back to label
const getProviderLabel = (value: string): string => {
  const provider = ttsProviders.find((p) => p.value === value);
  return provider ? provider.label : value;
};

export default function TTSEvaluationDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { data: session } = useSession();
  const backendAccessToken = (session as any)?.backendAccessToken;
  const taskId = params.uuid as string;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [evaluationResult, setEvaluationResult] =
    useState<EvaluationResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<
    "leaderboard" | "outputs" | "about"
  >("leaderboard");
  const [activeProviderTab, setActiveProviderTab] = useState<string | null>(
    null
  );
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Fetch evaluation result
  useEffect(() => {
    const fetchResult = async () => {
      if (!backendAccessToken || !taskId) return;

      try {
        setIsLoading(true);
        setError(null);
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error("BACKEND_URL environment variable is not set");
        }

        const response = await fetch(`${backendUrl}/tts/evaluate/${taskId}`, {
          method: "GET",
          headers: {
            accept: "application/json",
            "ngrok-skip-browser-warning": "true",
            Authorization: `Bearer ${backendAccessToken}`,
          },
        });

        if (response.status === 401) {
          await signOut({ callbackUrl: "/login" });
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to fetch evaluation result");
        }

        const result: EvaluationResult = await response.json();
        setEvaluationResult(result);

        // Set first provider as active tab if results exist
        if (result.provider_results && result.provider_results.length > 0) {
          setActiveProviderTab(result.provider_results[0].provider);
        }

        // Start polling if not done
        if (result.status !== "done" && !pollingIntervalRef.current) {
          pollingIntervalRef.current = setInterval(() => {
            pollTaskStatus(taskId, backendUrl);
          }, 2000);
        }
      } catch (err) {
        console.error("Error fetching evaluation result:", err);
        setError(
          err instanceof Error ? err.message : "Failed to load evaluation"
        );
      } finally {
        setIsLoading(false);
      }
    };

    fetchResult();
  }, [taskId, backendAccessToken]);

  const pollTaskStatus = async (taskId: string, backendUrl: string) => {
    try {
      const response = await fetch(`${backendUrl}/tts/evaluate/${taskId}`, {
        method: "GET",
        headers: {
          accept: "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
        },
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to poll task status");
      }

      const result: EvaluationResult = await response.json();
      setEvaluationResult(result);

      if (result.status === "done") {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        // Set first provider as active tab if results exist
        if (result.provider_results && result.provider_results.length > 0) {
          setActiveProviderTab(result.provider_results[0].provider);
        }
      }
    } catch (error) {
      console.error("Error polling task status:", error);
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }
  };

  const customHeader = (
    <BackHeader
      label="Back to all TTS evaluations"
      onBack={() => router.push("/tts")}
      title="Back to TTS evaluations"
    />
  );

  return (
    <AppLayout
      activeItem="tts"
      onItemChange={(itemId) => router.push(`/${itemId}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
      customHeader={customHeader}
    >
      <div className="space-y-6">
        {/* Loading State */}
        {isLoading && (
          <div className="flex items-center justify-center gap-3 py-8">
            <svg
              className="w-5 h-5 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              ></circle>
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              ></path>
            </svg>
            <span className="text-muted-foreground">Loading evaluation...</span>
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
            <p className="text-base text-red-500 mb-2">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Status Badge and Spinner - only show for queued/in_progress */}
        {!isLoading &&
          !error &&
          evaluationResult &&
          evaluationResult.status !== "done" && (
            <StatusBadge status={evaluationResult.status} showSpinner />
          )}

        {/* Evaluation Results */}
        {!isLoading &&
          !error &&
          evaluationResult &&
          evaluationResult.status === "done" && (
            <div className="space-y-4">
              {/* Tab Navigation */}
              <div className="flex gap-2 border-b border-border">
                <button
                  onClick={() => setActiveTab("leaderboard")}
                  className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors cursor-pointer ${
                    activeTab === "leaderboard"
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Leaderboard
                </button>
                <button
                  onClick={() => {
                    setActiveTab("outputs");
                    if (
                      !activeProviderTab &&
                      evaluationResult?.provider_results &&
                      evaluationResult.provider_results.length > 0
                    ) {
                      setActiveProviderTab(
                        evaluationResult.provider_results[0].provider
                      );
                    }
                  }}
                  className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors cursor-pointer ${
                    activeTab === "outputs"
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Outputs
                </button>
                <button
                  onClick={() => setActiveTab("about")}
                  className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors cursor-pointer ${
                    activeTab === "about"
                      ? "border-foreground text-foreground"
                      : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  About
                </button>
              </div>

              {/* About Tab */}
              {activeTab === "about" && (
                <div className="space-y-6">
                  <div className="border rounded-xl overflow-hidden">
                    <table className="w-full">
                      <thead className="bg-muted/50 border-b border-border">
                        <tr>
                          <th className="px-4 py-3 text-left text-[13px] font-medium text-foreground">
                            Metric
                          </th>
                          <th className="px-4 py-3 text-left text-[13px] font-medium text-foreground">
                            Description
                          </th>
                          <th className="px-4 py-3 text-left text-[13px] font-medium text-foreground">
                            Preference
                          </th>
                          <th className="px-4 py-3 text-left text-[13px] font-medium text-foreground">
                            Range
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b border-border">
                          <td className="px-4 py-3 text-[13px] font-medium text-foreground">
                            LLM Judge Score
                          </td>
                          <td className="px-4 py-3 text-[13px] text-foreground">
                            The LLM judge evaluates whether the synthesized
                            audio accurately matches the reference text. It
                            checks for semantic equivalence and pronunciation
                            accuracy.
                          </td>
                          <td className="px-4 py-3 text-[13px] text-foreground">
                            Higher is better
                          </td>
                          <td className="px-4 py-3 text-[13px] text-foreground">
                            0 - 1
                          </td>
                        </tr>
                        <tr className="border-b border-border">
                          <td className="px-4 py-3 text-[13px] font-medium text-foreground">
                            TTFB (Time To First Byte)
                          </td>
                          <td className="px-4 py-3 text-[13px] text-foreground">
                            Time to first byte measures the latency from when a
                            request is sent until the first byte of the response
                            is received.
                          </td>
                          <td className="px-4 py-3 text-[13px] text-foreground">
                            Lower is better
                          </td>
                          <td className="px-4 py-3 text-[13px] text-foreground">
                            0 - ∞
                          </td>
                        </tr>
                        <tr className="border-b border-border last:border-b-0">
                          <td className="px-4 py-3 text-[13px] font-medium text-foreground">
                            Processing Time
                          </td>
                          <td className="px-4 py-3 text-[13px] text-foreground">
                            Total time taken to process the text and generate
                            the audio output.
                          </td>
                          <td className="px-4 py-3 text-[13px] text-foreground">
                            Lower is better
                          </td>
                          <td className="px-4 py-3 text-[13px] text-foreground">
                            0 - ∞
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Leaderboard Tab */}
              {activeTab === "leaderboard" && (
                <div className="space-y-6 -mx-8 px-8 w-[calc(100vw-260px)] ml-[calc((260px-100vw)/2+50%)] relative">
                  {evaluationResult.leaderboard_summary &&
                    evaluationResult.leaderboard_summary.length > 0 && (
                      <>
                        <DownloadableTable
                          columns={[
                            {
                              key: "run",
                              header: "Run",
                              render: (value) => getProviderLabel(value),
                            },
                            { key: "count", header: "Count" },
                            {
                              key: "llm_judge_score",
                              header: "LLM Judge Score",
                            },
                            {
                              key: "ttfb",
                              header: "TTFB (s)",
                              render: (value) => value.toFixed(5),
                            },
                            {
                              key: "processing_time",
                              header: "Processing Time (s)",
                              render: (value) => value.toFixed(5),
                            },
                          ]}
                          data={evaluationResult.leaderboard_summary}
                          filename="tts-evaluation-leaderboard"
                        />

                        {/* Charts Section */}
                        {(() => {
                          const providerNames =
                            evaluationResult.leaderboard_summary.map(
                              (s) => s.run
                            );
                          const colorMap = getColorMap(providerNames);
                          return (
                            <div className="space-y-6">
                              {/* Row 1: LLM Judge Score and TTFB */}
                              <div className="grid grid-cols-2 gap-6">
                                <LeaderboardBarChart
                                  title="LLM Judge Score"
                                  data={evaluationResult.leaderboard_summary.map(
                                    (s) => ({
                                      label: getProviderLabel(s.run),
                                      value: s.llm_judge_score,
                                      colorKey: s.run,
                                    })
                                  )}
                                  colorMap={colorMap}
                                />
                                <LeaderboardBarChart
                                  title="TTFB (s)"
                                  data={evaluationResult.leaderboard_summary.map(
                                    (s) => ({
                                      label: getProviderLabel(s.run),
                                      value: s.ttfb,
                                      colorKey: s.run,
                                    })
                                  )}
                                  colorMap={colorMap}
                                />
                              </div>

                              {/* Row 2: Processing Time */}
                              <div className="grid grid-cols-2 gap-6">
                                <LeaderboardBarChart
                                  title="Processing Time (s)"
                                  data={evaluationResult.leaderboard_summary.map(
                                    (s) => ({
                                      label: getProviderLabel(s.run),
                                      value: s.processing_time,
                                      colorKey: s.run,
                                    })
                                  )}
                                  colorMap={colorMap}
                                />
                              </div>
                            </div>
                          );
                        })()}
                      </>
                    )}
                </div>
              )}

              {/* Outputs Tab */}
              {activeTab === "outputs" && evaluationResult.provider_results && (
                <div className="space-y-4 -mx-8 px-8 w-[calc(100vw-260px)] ml-[calc((260px-100vw)/2+50%)] relative">
                  {/* Provider Dropdown */}
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <select
                        value={
                          activeProviderTab ||
                          (evaluationResult.provider_results.length > 0
                            ? evaluationResult.provider_results[0].provider
                            : "")
                        }
                        onChange={(e) => setActiveProviderTab(e.target.value)}
                        className="h-10 px-4 pr-10 rounded-md text-[13px] border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent cursor-pointer appearance-none min-w-[180px]"
                      >
                        {evaluationResult.provider_results.map(
                          (providerResult) => (
                            <option
                              key={providerResult.provider}
                              value={providerResult.provider}
                            >
                              {getProviderLabel(providerResult.provider)}
                            </option>
                          )
                        )}
                      </select>
                      <div className="absolute inset-y-0 right-0 flex items-center pr-3 pointer-events-none">
                        <svg
                          className="w-4 h-4 text-muted-foreground"
                          fill="none"
                          viewBox="0 0 24 24"
                          stroke="currentColor"
                          strokeWidth={2}
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            d="M19.5 8.25l-7.5 7.5-7.5-7.5"
                          />
                        </svg>
                      </div>
                    </div>
                  </div>

                  {/* Provider Content */}
                  {(activeProviderTab ||
                    (evaluationResult.provider_results.length > 0 &&
                      evaluationResult.provider_results[0].provider)) && (
                    <>
                      {evaluationResult.provider_results
                        .filter(
                          (pr) =>
                            pr.provider ===
                            (activeProviderTab ||
                              (evaluationResult.provider_results &&
                                evaluationResult.provider_results[0]?.provider))
                        )
                        .map((providerResult) => (
                          <div
                            key={providerResult.provider}
                            className="space-y-6"
                          >
                            {/* Error Message */}
                            {!providerResult.success &&
                              providerResult.message && (
                                <div className="text-[13px] text-red-500 flex items-center gap-2">
                                  <span>❌</span>
                                  <span>{providerResult.message}</span>
                                </div>
                              )}

                            {/* Overall Metrics - Only show if success */}
                            {providerResult.success && (
                              <div className="border rounded-xl p-4 bg-muted/10">
                                <h3 className="text-[15px] font-semibold mb-4">
                                  Overall Metrics
                                </h3>
                                <div className="space-y-4">
                                  {/* First Row: LLM Judge Score */}
                                  <div className="grid grid-cols-3 gap-4">
                                    {providerResult.metrics.map(
                                      (metric, index) => {
                                        if ("llm_judge_score" in metric) {
                                          return (
                                            <div key={index}>
                                              <div className="text-[12px] text-muted-foreground mb-1">
                                                LLM Judge Score
                                              </div>
                                              <div className="text-[18px] font-semibold text-foreground">
                                                {metric.llm_judge_score}
                                              </div>
                                            </div>
                                          );
                                        }
                                        return null;
                                      }
                                    )}
                                  </div>
                                  {/* Second Row: TTFB, Processing Time */}
                                  <div className="grid grid-cols-3 gap-4">
                                    {providerResult.metrics.map(
                                      (metric, index) => {
                                        if ("metric_name" in metric) {
                                          const displayName =
                                            metric.metric_name === "ttfb"
                                              ? "TTFB (s)"
                                              : metric.metric_name ===
                                                "processing_time"
                                              ? "Processing Time (s)"
                                              : metric.metric_name;
                                          return (
                                            <div key={index}>
                                              <div className="text-[12px] text-muted-foreground mb-1">
                                                {displayName}
                                              </div>
                                              <div className="text-[18px] font-semibold text-foreground">
                                                {metric.mean.toFixed(5)}
                                              </div>
                                            </div>
                                          );
                                        }
                                        return null;
                                      }
                                    )}
                                  </div>
                                </div>
                              </div>
                            )}

                            {/* Results Table */}
                            {providerResult.results &&
                              providerResult.results.length > 0 && (
                                <div className="border rounded-xl overflow-visible">
                                  <div className="overflow-hidden rounded-xl">
                                    <table className="w-full">
                                      <thead className="bg-muted/50 border-b border-border">
                                        <tr>
                                          <th className="px-4 py-3 text-left text-[12px] font-medium text-foreground">
                                            ID
                                          </th>
                                          <th className="px-4 py-3 text-left text-[12px] font-medium text-foreground">
                                            Text
                                          </th>
                                          <th className="px-4 py-3 text-left text-[12px] font-medium text-foreground">
                                            Audio
                                          </th>
                                          <th className="px-4 py-3 text-left text-[12px] font-medium text-foreground">
                                            LLM Judge Score
                                          </th>
                                          <th className="px-4 py-3 text-left text-[12px] font-medium text-foreground">
                                            LLM Judge Reasoning
                                          </th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {providerResult.results.map(
                                          (result, index) => (
                                            <tr
                                              key={index}
                                              className="border-b border-border last:border-b-0"
                                            >
                                              <td className="px-4 py-3 text-[13px] text-foreground">
                                                {index + 1}
                                              </td>
                                              <td className="px-4 py-3 text-[13px] text-foreground">
                                                {result.text}
                                              </td>
                                              <td className="px-4 py-3 text-[13px] text-foreground">
                                                <audio
                                                  controls
                                                  className="w-full min-w-[400px]"
                                                  src={result.audio_path}
                                                >
                                                  Your browser does not support
                                                  the audio element.
                                                </audio>
                                              </td>
                                              <td className="px-4 py-3 text-[13px] text-foreground">
                                                {result.llm_judge_score}
                                              </td>
                                              <td className="px-4 py-3 text-[13px] text-muted-foreground max-w-md">
                                                {result.llm_judge_reasoning}
                                              </td>
                                            </tr>
                                          )
                                        )}
                                      </tbody>
                                    </table>
                                  </div>
                                </div>
                              )}
                          </div>
                        ))}
                    </>
                  )}
                </div>
              )}
            </div>
          )}
      </div>
    </AppLayout>
  );
}
