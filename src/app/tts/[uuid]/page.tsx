"use client";

import React, { useState, useEffect, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { signOut } from "next-auth/react";
import { useAccessToken } from "@/hooks";
import { AppLayout } from "@/components/AppLayout";
import { BackHeader, StatusBadge, NotFoundState } from "@/components/ui";
import { Tooltip } from "@/components/Tooltip";
import { ttsProviders } from "@/components/agent-tabs/constants/providers";
import {
  LeaderboardBarChart,
  getColorMap,
} from "@/components/charts/LeaderboardBarChart";
import { DownloadableTable } from "@/components/DownloadableTable";
import { POLLING_INTERVAL_MS } from "@/constants/polling";
import { useSidebarState } from "@/lib/sidebar";
import { getDataset } from "@/lib/datasets";

type LatencyMetric = {
  mean: number;
  std: number;
  values: number[];
};

type ProviderMetrics = {
  llm_judge_score: number;
  ttfb: LatencyMetric;
  processing_time: LatencyMetric;
};

type ProviderResult = {
  provider: string;
  success: boolean | null; // null means in progress
  message: string;
  metrics: ProviderMetrics | null;
  results: Array<{
    id: string;
    text: string;
    audio_path: string;
    llm_judge_score?: string; // Only present when complete
    llm_judge_reasoning?: string; // Only present when complete
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
  dataset_id?: string | null;
  dataset_name?: string | null;
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
  const backendAccessToken = useAccessToken();
  const taskId = params.uuid as string;
  const [sidebarOpen, setSidebarOpen] = useSidebarState();
  const [evaluationResult, setEvaluationResult] =
    useState<EvaluationResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<401 | 403 | 404 | null>(null);
  const [activeTab, setActiveTab] = useState<
    "leaderboard" | "outputs" | "about"
  >("outputs");
  const [activeProviderTab, setActiveProviderTab] = useState<string | null>(
    null
  );
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Set page title
  useEffect(() => {
    document.title = "TTS Evaluation | Calibrate";
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

        if (response.status === 404) {
          setErrorCode(404);
          return;
        }

        if (response.status === 403) {
          setErrorCode(403);
          return;
        }

        if (!response.ok) {
          throw new Error("Failed to fetch evaluation result");
        }

        const result: EvaluationResult = await response.json();

        if (result.dataset_id) {
          try {
            await getDataset(backendAccessToken, result.dataset_id);
          } catch {
            result.dataset_id = null;
            result.dataset_name = null;
          }
        }

        setEvaluationResult(result);

        // Set first provider as active tab if results exist (use functional setState to avoid stale closures)
        if (result.provider_results && result.provider_results.length > 0) {
          setActiveProviderTab(
            (current) => current || result.provider_results![0].provider
          );
        }

        // If already done, show leaderboard tab by default
        if (result.status === "done") {
          setActiveTab("leaderboard");
        }

        // Start polling if not done or failed
        if (
          result.status !== "done" &&
          result.status !== "failed" &&
          !pollingIntervalRef.current
        ) {
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

      // Set first provider as active tab if results exist (use functional setState to avoid stale closures)
      if (result.provider_results && result.provider_results.length > 0) {
        setActiveProviderTab(
          (current) => current || result.provider_results![0].provider
        );
      }

      if (result.status === "done" || result.status === "failed") {
        // Switch to leaderboard tab when evaluation completes successfully
        if (result.status === "done") {
          setActiveTab("leaderboard");
        }
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
      }
    } catch (error) {
      console.error("Error polling task status:", error);
      // Set status to failed so the UI shows the error state
      setEvaluationResult((prev) =>
        prev ? { ...prev, status: "failed" } : prev
      );
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
      <div className="space-y-4 md:space-y-6">
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
        {errorCode && <NotFoundState errorCode={errorCode} />}

        {/* Evaluation Results */}
        {!isLoading && !error && !errorCode && evaluationResult && (
          <div className="space-y-4">
            {/* Language Pill, Dataset link, and Status Badge */}
            <div className="flex items-center gap-3 flex-wrap">
              {evaluationResult.language && (
                <span className="px-3 py-1 text-[12px] font-medium bg-muted rounded-full text-foreground capitalize">
                  {evaluationResult.language}
                </span>
              )}
              {evaluationResult.dataset_id && evaluationResult.dataset_name && (
                <Link
                  href={`/datasets/${evaluationResult.dataset_id}`}
                  className="flex items-center gap-1.5 px-3 py-1 text-[12px] font-medium bg-muted rounded-full text-foreground hover:bg-muted/70 transition-colors"
                >
                  <svg
                    className="w-3 h-3"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
                    />
                  </svg>
                  {evaluationResult.dataset_name}
                </Link>
              )}
              {evaluationResult.status !== "done" && (
                <StatusBadge status={evaluationResult.status} showSpinner />
              )}
            </div>

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
                    <div className="space-y-4 md:space-y-6">
                      {/* Desktop: Table layout */}
                      <div className="hidden md:block border rounded-xl overflow-hidden">
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
                                LLM Judge
                              </td>
                              <td className="px-4 py-3 text-[13px] text-foreground">
                                The LLM judge evaluates whether the synthesized
                                audio accurately matches the reference text. It
                                checks for semantic equivalence and
                                pronunciation accuracy, returning Pass if the
                                audio correctly represents the input text.
                              </td>
                              <td className="px-4 py-3 text-[13px] text-foreground">
                                Pass is better
                              </td>
                              <td className="px-4 py-3 text-[13px] text-foreground">
                                Pass / Fail
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
                          </tbody>
                        </table>
                      </div>

                      {/* Mobile: Card layout */}
                      <div className="md:hidden space-y-3">
                        {[
                          {
                            metric: "LLM Judge",
                            description:
                              "The LLM judge evaluates whether the synthesized audio accurately matches the reference text. It checks for semantic equivalence and pronunciation accuracy, returning Pass if the audio correctly represents the input text.",
                            preference: "Pass is better",
                            range: "Pass / Fail",
                          },
                          {
                            metric: "TTFB (Time To First Byte)",
                            description:
                              "Time to first byte measures the latency from when a request is sent until the first byte of the response is received.",
                            preference: "Lower is better",
                            range: "0 - ∞",
                          },
                        ].map((item) => (
                          <div
                            key={item.metric}
                            className="border border-border rounded-xl p-4 space-y-2"
                          >
                            <h4 className="text-[13px] font-semibold text-foreground">
                              {item.metric}
                            </h4>
                            <p className="text-[13px] text-muted-foreground">
                              {item.description}
                            </p>
                            <div className="flex gap-4 pt-1">
                              <div>
                                <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
                                  Preference
                                </span>
                                <p className="text-[13px] text-foreground">
                                  {item.preference}
                                </p>
                              </div>
                              <div>
                                <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
                                  Range
                                </span>
                                <p className="text-[13px] text-foreground">
                                  {item.range}
                                </p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Leaderboard Tab */}
                  {activeTab === "leaderboard" && (
                    <div className="space-y-4 md:space-y-6 -mx-4 md:-mx-8 px-4 md:px-8 w-[calc(100vw-32px)] md:w-[calc(100vw-260px)] ml-[calc((32px-100vw)/2+50%)] md:ml-[calc((260px-100vw)/2+50%)] relative">
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
                                {
                                  key: "llm_judge_score",
                                  header: "LLM Judge Score",
                                },
                                {
                                  key: "ttfb",
                                  header: "TTFB (s)",
                                  render: (value) =>
                                    value != null
                                      ? parseFloat(value.toFixed(4))
                                      : "-",
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
                                <div className="space-y-4 md:space-y-6">
                                  {/* Row 1: LLM Judge Score and TTFB */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 md:gap-6">
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
                                      yDomain={[0, 1]}
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
                                </div>
                              );
                            })()}
                          </>
                        )}
                    </div>
                  )}

                  {/* Outputs Tab */}
                  {activeTab === "outputs" && (
                    <div className="flex flex-col md:flex-row border border-border rounded-xl overflow-hidden md:h-[calc(100vh-220px)]">
                      {/* Provider List - Horizontal scroll on mobile, vertical sidebar on desktop */}
                      <div className="md:w-64 border-b md:border-b-0 md:border-r border-border flex flex-col overflow-hidden bg-muted/10">
                        <div className="overflow-x-auto md:overflow-x-visible md:overflow-y-auto md:flex-1 p-2">
                          <div className="flex md:flex-col gap-1 md:gap-1 min-w-max md:min-w-0">
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
                                    className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors whitespace-nowrap ${
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
                      <div className="flex-1 overflow-y-auto p-4 md:p-6">
                        {(() => {
                          const selectedProvider =
                            activeProviderTab ||
                            evaluationResult.provider_results![0]?.provider;
                          const providerResult =
                            evaluationResult.provider_results!.find(
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

                          // Show spinner if provider is in progress and has no results yet
                          if (
                            providerResult.success === null &&
                            (!providerResult.results ||
                              providerResult.results.length === 0)
                          ) {
                            return (
                              <div className="flex items-center justify-center h-full min-h-[200px]">
                                <div className="flex items-center gap-3">
                                  <svg
                                    className="w-5 h-5 animate-spin text-muted-foreground"
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
                                </div>
                              </div>
                            );
                          }

                          // Show error banner if provider failed
                          if (providerResult.success === false) {
                            return (
                              <div className="flex items-center justify-center h-full min-h-[200px]">
                                <div className="border border-red-500/50 bg-red-500/10 rounded-lg p-4 max-w-md text-center">
                                  <div className="text-red-500 text-[14px] font-medium mb-1">
                                    There was an error running this provider.
                                    Please contact us by posting your issue to
                                    help us help you.
                                  </div>
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div className="space-y-4 md:space-y-6">
                              {/* Overall Metrics - Only show if success */}
                              {providerResult.success &&
                                providerResult.metrics && (
                                  <div className="border rounded-xl p-4 bg-muted/10">
                                    <h3 className="text-[15px] font-semibold mb-4">
                                      Overall Metrics
                                    </h3>
                                    <div className="grid grid-cols-2 gap-4">
                                      <div>
                                        <div className="text-[12px] text-muted-foreground mb-1">
                                          LLM Judge Score
                                        </div>
                                        <div className="text-base md:text-[18px] font-semibold text-foreground">
                                          {providerResult.metrics
                                            .llm_judge_score ?? "-"}
                                        </div>
                                      </div>
                                      <div>
                                        <div className="text-[12px] text-muted-foreground mb-1">
                                          TTFB (s)
                                        </div>
                                        <div className="text-base md:text-[18px] font-semibold text-foreground">
                                          {providerResult.metrics.ttfb?.mean !=
                                          null
                                            ? parseFloat(
                                                providerResult.metrics.ttfb.mean.toFixed(
                                                  4
                                                )
                                              )
                                            : "-"}
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                )}

                              {/* Results - Desktop: Table, Mobile: Cards */}
                              {providerResult.results &&
                                providerResult.results.length > 0 &&
                                (() => {
                                  // Check if all rows have metrics available
                                  const allRowsHaveMetrics =
                                    providerResult.results.every(
                                      (r) =>
                                        r.llm_judge_score !== undefined &&
                                        r.llm_judge_score !== ""
                                    );
                                  const showMetrics =
                                    evaluationResult.status === "done" ||
                                    allRowsHaveMetrics;

                                  return (
                                    <>
                                      {/* Desktop: Table layout */}
                                      <div className="hidden md:block border rounded-xl overflow-visible">
                                        <div className="overflow-hidden rounded-xl">
                                          <table className="w-full table-fixed">
                                            <thead className="bg-muted/50 border-b border-border">
                                              <tr>
                                                <th className="w-12 px-4 py-3 text-left text-[12px] font-medium text-foreground">
                                                  ID
                                                </th>
                                                <th
                                                  className={`${
                                                    showMetrics
                                                      ? "w-[30%]"
                                                      : "w-[calc(50%-24px)]"
                                                  } px-4 py-3 text-left text-[12px] font-medium text-foreground`}
                                                >
                                                  Text
                                                </th>
                                                <th
                                                  className={`${
                                                    showMetrics
                                                      ? "w-[50%]"
                                                      : "w-[calc(50%-24px)]"
                                                  } px-4 py-3 text-left text-[12px] font-medium text-foreground`}
                                                >
                                                  Audio
                                                </th>
                                                {showMetrics && (
                                                  <th className="px-4 py-3 text-left text-[12px] font-medium text-foreground">
                                                    LLM Judge
                                                  </th>
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
                                                    <td className="px-4 py-3 text-[13px] text-foreground break-words">
                                                      {result.text}
                                                    </td>
                                                    <td className="px-4 py-3 text-[13px] text-foreground">
                                                      <audio
                                                        controls
                                                        className="w-full min-w-[280px]"
                                                        src={result.audio_path}
                                                      >
                                                        Your browser does not
                                                        support the audio
                                                        element.
                                                      </audio>
                                                    </td>
                                                    {showMetrics && (
                                                      <td className="px-4 py-3">
                                                        {(() => {
                                                          const scoreStr =
                                                            String(
                                                              result.llm_judge_score ||
                                                                ""
                                                            ).toLowerCase();
                                                          const passed =
                                                            scoreStr ===
                                                              "true" ||
                                                            scoreStr === "1";
                                                          const tooltipContent =
                                                            result.llm_judge_reasoning
                                                              ? result.llm_judge_reasoning
                                                              : `Score: ${result.llm_judge_score}`;
                                                          return (
                                                            <div className="flex items-center gap-1.5">
                                                              <span
                                                                className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${
                                                                  passed
                                                                    ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400"
                                                                    : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                                                                }`}
                                                              >
                                                                {passed
                                                                  ? "Pass"
                                                                  : "Fail"}
                                                              </span>
                                                              <Tooltip
                                                                content={
                                                                  tooltipContent
                                                                }
                                                              >
                                                                <button
                                                                  type="button"
                                                                  className="p-1 rounded-md hover:bg-muted transition-colors cursor-pointer"
                                                                  aria-label="View reasoning"
                                                                >
                                                                  <svg
                                                                    className="w-4 h-4 text-muted-foreground"
                                                                    fill="none"
                                                                    viewBox="0 0 24 24"
                                                                    stroke="currentColor"
                                                                    strokeWidth={
                                                                      2
                                                                    }
                                                                  >
                                                                    <path
                                                                      strokeLinecap="round"
                                                                      strokeLinejoin="round"
                                                                      d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
                                                                    />
                                                                  </svg>
                                                                </button>
                                                              </Tooltip>
                                                            </div>
                                                          );
                                                        })()}
                                                      </td>
                                                    )}
                                                  </tr>
                                                )
                                              )}
                                            </tbody>
                                          </table>
                                        </div>
                                      </div>

                                      {/* Mobile: Card layout */}
                                      <div className="md:hidden space-y-3">
                                        {providerResult.results.map(
                                          (result, index) => {
                                            const scoreStr = String(
                                              result.llm_judge_score || ""
                                            ).toLowerCase();
                                            const passed =
                                              scoreStr === "true" ||
                                              scoreStr === "1";
                                            return (
                                              <div
                                                key={index}
                                                className="border border-border rounded-xl p-4 space-y-3"
                                              >
                                                <div className="flex items-center justify-between">
                                                  <span className="text-[12px] text-muted-foreground font-medium">
                                                    #{index + 1}
                                                  </span>
                                                  {showMetrics && (
                                                    <span
                                                      className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${
                                                        passed
                                                          ? "bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-400"
                                                          : "bg-red-100 text-red-700 dark:bg-red-500/20 dark:text-red-400"
                                                      }`}
                                                    >
                                                      {passed ? "Pass" : "Fail"}
                                                    </span>
                                                  )}
                                                </div>
                                                <div>
                                                  <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
                                                    Text
                                                  </span>
                                                  <p className="text-[13px] text-foreground mt-0.5">
                                                    {result.text}
                                                  </p>
                                                </div>
                                                <div>
                                                  <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
                                                    Audio
                                                  </span>
                                                  <audio
                                                    controls
                                                    className="w-full mt-1"
                                                    src={result.audio_path}
                                                  >
                                                    Your browser does not
                                                    support the audio element.
                                                  </audio>
                                                </div>
                                                {showMetrics &&
                                                  result.llm_judge_reasoning && (
                                                    <div className="pt-1 border-t border-border">
                                                      <span className="text-[11px] text-muted-foreground uppercase tracking-wide">
                                                        LLM Judge Reasoning
                                                      </span>
                                                      <p className="text-[12px] text-muted-foreground mt-0.5">
                                                        {
                                                          result.llm_judge_reasoning
                                                        }
                                                      </p>
                                                    </div>
                                                  )}
                                              </div>
                                            );
                                          }
                                        )}
                                      </div>
                                    </>
                                  );
                                })()}
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
