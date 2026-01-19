"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { AppLayout } from "@/components/AppLayout";
import { BackHeader, StatusBadge, NotFoundState } from "@/components/ui";
import { sttProviders } from "@/components/agent-tabs/constants/providers";
import {
  LeaderboardBarChart,
  getColorMap,
} from "@/components/charts/LeaderboardBarChart";
import { DownloadableTable } from "@/components/DownloadableTable";
import { POLLING_INTERVAL_MS } from "@/constants/polling";

type MetricItem =
  | { wer: number }
  | { string_similarity: number }
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
    gt: string;
    pred: string;
    wer: string;
    string_similarity: string;
    llm_judge_score: string;
    llm_judge_reasoning: string;
  }>;
};

type LeaderboardSummary = {
  run: string;
  count: number;
  wer: number;
  string_similarity: number;
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
  const provider = sttProviders.find((p) => p.value === value);
  return provider ? provider.label : value;
};

export default function STTEvaluationDetailPage() {
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
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "leaderboard" | "outputs" | "about"
  >("outputs");
  const [activeProviderTab, setActiveProviderTab] = useState<string | null>(
    null
  );
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Set page title
  useEffect(() => {
    document.title = "STT Evaluation | Pense";
  }, []);

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

        const response = await fetch(`${backendUrl}/stt/evaluate/${taskId}`, {
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

        if (response.status === 404) {
          setNotFound(true);
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
          }, POLLING_INTERVAL_MS);
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
      const response = await fetch(`${backendUrl}/stt/evaluate/${taskId}`, {
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

      // Set first provider as active tab when results first become available
      if (result.provider_results && result.provider_results.length > 0) {
        setActiveProviderTab(
          (current) => current || result.provider_results![0].provider
        );
      }

      if (result.status === "done") {
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
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
      label="Back to all STT evaluations"
      onBack={() => router.push("/stt")}
      title="Back to STT evaluations"
    />
  );

  return (
    <AppLayout
      activeItem="stt"
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

        {/* Not Found State */}
        {notFound && <NotFoundState />}

        {/* Evaluation Results */}
        {!isLoading && !error && !notFound && evaluationResult && (
          <div className="space-y-4">
            {/* Status Badge - show when evaluation is not done */}
            {evaluationResult.status !== "done" && (
              <StatusBadge status={evaluationResult.status} showSpinner />
            )}

            {/* Only show tabs and content when we have at least one provider result */}
            {evaluationResult.provider_results &&
              evaluationResult.provider_results.length > 0 && (
                <>
                  {/* Tab Navigation */}
                  <div className="flex gap-2 border-b border-border">
                    {/* Only show Leaderboard tab when done */}
                    {evaluationResult.status === "done" && (
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
                    )}
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
                                WER (Word Error Rate)
                              </td>
                              <td className="px-4 py-3 text-[13px] text-foreground">
                                Word error rate measures the percentage of words
                                that differ between the reference transcription
                                and the predicted transcription.
                              </td>
                              <td className="px-4 py-3 text-[13px] text-foreground">
                                Lower is better
                              </td>
                              <td className="px-4 py-3 text-[13px] text-foreground">
                                0 - ∞
                              </td>
                            </tr>
                            <tr className="border-b border-border">
                              <td className="px-4 py-3 text-[13px] font-medium text-foreground">
                                String Similarity
                              </td>
                              <td className="px-4 py-3 text-[13px] text-foreground">
                                Measures the similarity between the reference
                                and predicted strings using string matching
                                algorithms.
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
                                LLM Judge Score
                              </td>
                              <td className="px-4 py-3 text-[13px] text-foreground">
                                This metric is used because WER and string
                                similarity may not provide an accurate picture.
                                For example, when a transcript says "9" but the
                                model predicts "nine", both might be considered
                                correct for the agent's specific use case. The
                                LLM judge evaluates semantic equivalence rather
                                than exact string matching.
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
                                Time to first byte measures the latency from
                                when a request is sent until the first byte of
                                the response is received.
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
                                Total time taken to process the audio and
                                generate the transcription.
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
                                { key: "wer", header: "WER" },
                                {
                                  key: "string_similarity",
                                  header: "String Similarity",
                                  render: (value) => value.toFixed(5),
                                },
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
                              filename="stt-evaluation-leaderboard"
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
                                  {/* Row 1: WER and String Similarity */}
                                  <div className="grid grid-cols-2 gap-6">
                                    <LeaderboardBarChart
                                      title="WER"
                                      data={evaluationResult.leaderboard_summary.map(
                                        (s) => ({
                                          label: getProviderLabel(s.run),
                                          value: s.wer,
                                          colorKey: s.run,
                                        })
                                      )}
                                      colorMap={colorMap}
                                    />
                                    <LeaderboardBarChart
                                      title="String Similarity"
                                      data={evaluationResult.leaderboard_summary.map(
                                        (s) => ({
                                          label: getProviderLabel(s.run),
                                          value: s.string_similarity,
                                          colorKey: s.run,
                                        })
                                      )}
                                      colorMap={colorMap}
                                    />
                                  </div>

                                  {/* Row 2: LLM Judge Score and TTFB */}
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

                                  {/* Row 3: Processing Time */}
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

                  {/* Outputs Tab - Two Panel Layout */}
                  {activeTab === "outputs" && (
                    <div className="flex border border-border rounded-xl overflow-hidden h-[calc(100vh-220px)]">
                      {/* Left Panel - Provider List */}
                      <div className="w-64 border-r border-border flex flex-col overflow-hidden bg-muted/10">
                        <div className="flex-1 overflow-y-auto p-2">
                          <div className="space-y-1">
                            {evaluationResult.provider_results!.map(
                              (providerResult) => {
                                const isSelected =
                                  (activeProviderTab ||
                                    evaluationResult.provider_results![0]
                                      ?.provider) === providerResult.provider;
                                return (
                                  <div
                                    key={providerResult.provider}
                                    onClick={() =>
                                      setActiveProviderTab(
                                        providerResult.provider
                                      )
                                    }
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                                      isSelected
                                        ? "bg-muted"
                                        : "hover:bg-muted/50"
                                    }`}
                                  >
                                    {/* Status Icon */}
                                    {providerResult.success === null ? (
                                      // In progress - yellow dot
                                      <div className="w-2 h-2 rounded-full bg-yellow-500 animate-pulse flex-shrink-0"></div>
                                    ) : providerResult.success === true ? (
                                      // Done, passed - green tick
                                      <div className="w-5 h-5 rounded-full bg-green-500/20 flex items-center justify-center flex-shrink-0">
                                        <svg
                                          className="w-3 h-3 text-green-500"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                          strokeWidth={3}
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M4.5 12.75l6 6 9-13.5"
                                          />
                                        </svg>
                                      </div>
                                    ) : (
                                      // Done, failed - red X
                                      <div className="w-5 h-5 rounded-full bg-red-500/20 flex items-center justify-center flex-shrink-0">
                                        <svg
                                          className="w-3 h-3 text-red-500"
                                          fill="none"
                                          viewBox="0 0 24 24"
                                          stroke="currentColor"
                                          strokeWidth={3}
                                        >
                                          <path
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            d="M6 18L18 6M6 6l12 12"
                                          />
                                        </svg>
                                      </div>
                                    )}
                                    <span className="text-sm text-foreground truncate">
                                      {getProviderLabel(
                                        providerResult.provider
                                      )}
                                    </span>
                                  </div>
                                );
                              }
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Right Panel - Provider Details */}
                      <div className="flex-1 overflow-y-auto p-6">
                        {(() => {
                          const selectedProvider =
                            activeProviderTab ||
                            evaluationResult.provider_results[0]?.provider;
                          const providerResult =
                            evaluationResult.provider_results.find(
                              (pr) => pr.provider === selectedProvider
                            );

                          if (!providerResult) {
                            return (
                              <div className="flex items-center justify-center h-full">
                                <p className="text-muted-foreground">
                                  Select a provider to view details
                                </p>
                              </div>
                            );
                          }

                          return (
                            <div className="space-y-6">
                              {/* Error Message - only show when evaluation is done */}
                              {evaluationResult.status === "done" &&
                                !providerResult.success &&
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
                                    {/* First Row: WER, String Similarity, LLM Judge Score */}
                                    <div className="grid grid-cols-3 gap-4">
                                      {providerResult.metrics.map(
                                        (metric, index) => {
                                          if ("wer" in metric) {
                                            return (
                                              <div key={index}>
                                                <div className="text-[12px] text-muted-foreground mb-1">
                                                  WER
                                                </div>
                                                <div className="text-[18px] font-semibold text-foreground">
                                                  {metric.wer}
                                                </div>
                                              </div>
                                            );
                                          }
                                          if ("string_similarity" in metric) {
                                            return (
                                              <div key={index}>
                                                <div className="text-[12px] text-muted-foreground mb-1">
                                                  String Similarity
                                                </div>
                                                <div className="text-[18px] font-semibold text-foreground">
                                                  {metric.string_similarity.toFixed(
                                                    5
                                                  )}
                                                </div>
                                              </div>
                                            );
                                          }
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
                                              Ground Truth
                                            </th>
                                            <th className="px-4 py-3 text-left text-[12px] font-medium text-foreground">
                                              Prediction
                                            </th>
                                            {evaluationResult.status ===
                                              "done" && (
                                              <>
                                                <th className="px-4 py-3 text-left text-[12px] font-medium text-foreground">
                                                  WER
                                                </th>
                                                <th className="px-4 py-3 text-left text-[12px] font-medium text-foreground">
                                                  String Similarity
                                                </th>
                                                <th className="px-4 py-3 text-left text-[12px] font-medium text-foreground">
                                                  LLM Judge Score
                                                </th>
                                                <th className="px-4 py-3 text-left text-[12px] font-medium text-foreground">
                                                  LLM Judge Reasoning
                                                </th>
                                              </>
                                            )}
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
                                                  {result.gt}
                                                </td>
                                                <td className="px-4 py-3 text-[13px] text-foreground">
                                                  {result.pred}
                                                </td>
                                                {evaluationResult.status ===
                                                  "done" && (
                                                  <>
                                                    <td className="px-4 py-3 text-[13px] text-foreground">
                                                      {result.wer}
                                                    </td>
                                                    <td className="px-4 py-3 text-[13px] text-foreground">
                                                      {parseFloat(
                                                        result.string_similarity
                                                      ).toFixed(5)}
                                                    </td>
                                                    <td className="px-4 py-3 text-[13px] text-foreground">
                                                      {result.llm_judge_score}
                                                    </td>
                                                    <td className="px-4 py-3 text-[13px] text-muted-foreground max-w-md">
                                                      {
                                                        result.llm_judge_reasoning
                                                      }
                                                    </td>
                                                  </>
                                                )}
                                              </tr>
                                            )
                                          )}
                                        </tbody>
                                      </table>
                                    </div>
                                  </div>
                                )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  )}
                </>
              )}
          </div>
        )}
      </div>
    </AppLayout>
  );
}
