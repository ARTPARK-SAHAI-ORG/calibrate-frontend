"use client";

import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
} from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { AppLayout } from "@/components/AppLayout";
import { Tooltip } from "@/components/Tooltip";
import { NotFoundState } from "@/components/ui";
import { formatStatus, getStatusBadgeClass } from "@/lib/status";
import { POLLING_INTERVAL_MS } from "@/constants/polling";

type MetricData = {
  mean: number;
  std: number;
  values: number[];
};

type Persona = {
  label: string;
  characteristics: string;
  gender: string;
  language: string;
};

type Scenario = {
  name: string;
  description: string;
};

type EvaluationResult = {
  name: string;
  value: number;
  reasoning: string;
};

type TranscriptEntry = {
  role: string;
  content?: string;
  tool_calls?: any[];
  tool_call_id?: string;
};

type SimulationResult = {
  simulation_name: string;
  persona: Persona;
  scenario: Scenario;
  evaluation_results: EvaluationResult[] | null;
  transcript?: TranscriptEntry[] | null;
  audio_urls?: string[];
  conversation_wav_url?: string;
};

type RunData = {
  task_id: string;
  name: string;
  status: string;
  type: "text" | "voice";
  updated_at: string;
  total_simulations: number;
  metrics: {
    tool_calls?: MetricData;
    answer_completeness?: MetricData;
    assistant_behavior?: MetricData;
    question_completeness?: MetricData;
  } | null;
  simulation_results: SimulationResult[];
  results_s3_prefix: string;
  error: string | null;
};

export default function SimulationRunPage() {
  const router = useRouter();
  const params = useParams();
  const { data: session } = useSession();
  const backendAccessToken = (session as any)?.backendAccessToken;
  const uuid = params.uuid as string;
  const runId = params.runId as string;
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [runData, setRunData] = useState<RunData | null>(null);
  const [simulationName, setSimulationName] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [errorCode, setErrorCode] = useState<401 | 403 | 404 | null>(null);
  const [transcriptDialogOpen, setTranscriptDialogOpen] = useState(false);
  const [selectedSimulationKey, setSelectedSimulationKey] = useState<
    string | null
  >(null);
  // Store a frozen copy of the simulation once it's complete to prevent re-renders
  const frozenSimulationRef = useRef<SimulationResult | null>(null);

  // Refresh run data to get fresh presigned URLs when audio fails to load
  const refreshRunData = useCallback(async () => {
    if (!backendAccessToken) return;

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) return;

      const response = await fetch(`${backendUrl}/simulations/run/${runId}`, {
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

      if (!response.ok) return;

      const data: RunData = await response.json();
      // Clear frozen simulation to allow fresh URLs to be used
      frozenSimulationRef.current = null;
      setRunData(data);
    } catch (err) {
      console.error("Error refreshing run data for audio URLs:", err);
    }
  }, [runId, backendAccessToken]);

  // Derive selectedSimulation from runData using the key
  // Uses simulation_name as unique identifier to ensure correct simulation's transcript is shown
  // Once the simulation is complete (has evaluation_results), freeze it to prevent audio reload
  const selectedSimulation = useMemo(() => {
    if (!selectedSimulationKey || !runData?.simulation_results) {
      return null;
    }

    const currentSim = runData.simulation_results.find(
      (sim) => sim.simulation_name === selectedSimulationKey,
    );

    if (!currentSim) {
      return frozenSimulationRef.current;
    }

    // If we have a frozen simulation that's complete, keep using it
    if (frozenSimulationRef.current?.evaluation_results) {
      return frozenSimulationRef.current;
    }

    // If current simulation is now complete, freeze it
    if (currentSim.evaluation_results) {
      frozenSimulationRef.current = currentSim;
      return currentSim;
    }

    // Still in progress, return current (live updates)
    return currentSim;
  }, [selectedSimulationKey, runData?.simulation_results]);

  const [activeMetricsTab, setActiveMetricsTab] = useState<
    "performance" | "latency"
  >("performance");

  // Ref for transcript container to auto-scroll
  const transcriptContainerRef = useRef<HTMLDivElement>(null);
  // Track previous transcript length to only scroll on new messages
  const prevTranscriptLengthRef = useRef<number>(0);

  // Auto-scroll transcript to bottom only when new messages are added
  useEffect(() => {
    const currentLength = selectedSimulation?.transcript?.length ?? 0;
    if (
      transcriptContainerRef.current &&
      currentLength > prevTranscriptLengthRef.current
    ) {
      transcriptContainerRef.current.scrollTop =
        transcriptContainerRef.current.scrollHeight;
    }
    prevTranscriptLengthRef.current = currentLength;
  }, [selectedSimulation?.transcript?.length]);

  // Fetch simulation name for page title
  useEffect(() => {
    const fetchSimulationName = async () => {
      if (!backendAccessToken) return;

      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) return;

        const response = await fetch(`${backendUrl}/simulations/${uuid}`, {
          method: "GET",
          headers: {
            accept: "application/json",
            "ngrok-skip-browser-warning": "true",
            Authorization: `Bearer ${backendAccessToken}`,
          },
        });

        if (response.ok) {
          const data = await response.json();
          setSimulationName(data.name);
        }
      } catch (err) {
        console.error("Error fetching simulation name:", err);
      }
    };

    fetchSimulationName();
  }, [uuid, backendAccessToken]);

  // Set page title when run data and simulation name are loaded
  useEffect(() => {
    if (runData?.name && simulationName) {
      document.title = `${runData.name} | ${simulationName} | Calibrate`;
    } else if (runData?.name) {
      document.title = `${runData.name} | Calibrate`;
    } else {
      document.title = "Simulation Run | Calibrate";
    }
  }, [runData?.name, simulationName]);

  useEffect(() => {
    if (!backendAccessToken) return;

    let pollInterval: NodeJS.Timeout | null = null;

    const fetchRunData = async (isInitialLoad = false) => {
      try {
        if (isInitialLoad) {
          setIsLoading(true);
          setError(null);
        }
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) {
          throw new Error("BACKEND_URL environment variable is not set");
        }

        const response = await fetch(`${backendUrl}/simulations/run/${runId}`, {
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
          throw new Error("Failed to fetch run data");
        }

        const data: RunData = await response.json();
        setRunData(data);

        // Stop polling if status is "done"
        if (data.status.toLowerCase() === "done" && pollInterval) {
          clearInterval(pollInterval);
          pollInterval = null;
        }
      } catch (err) {
        console.error("Error fetching run data:", err);
        if (isInitialLoad) {
          setError(err instanceof Error ? err.message : "Failed to load run");
        } else {
          // Set status to failed and stop polling on fetch error during polling
          setRunData((prev) => (prev ? { ...prev, status: "failed" } : prev));
          if (pollInterval) {
            clearInterval(pollInterval);
            pollInterval = null;
          }
        }
      } finally {
        if (isInitialLoad) {
          setIsLoading(false);
        }
      }
    };

    // Initial fetch
    fetchRunData(true);

    // Start polling every 3 seconds
    pollInterval = setInterval(() => {
      fetchRunData(false);
    }, POLLING_INTERVAL_MS);

    // Cleanup on unmount
    return () => {
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [runId, backendAccessToken]);

  const getTypeBadgeClass = (type: string) => {
    switch (type.toLowerCase()) {
      case "text":
        return "bg-purple-100 text-purple-700 dark:bg-purple-500/20 dark:text-purple-400";
      case "voice":
        return "bg-orange-100 text-orange-700 dark:bg-orange-500/20 dark:text-orange-400";
      default:
        return "bg-gray-200 text-gray-700 dark:bg-gray-500/20 dark:text-gray-400";
    }
  };

  const getPassFailStatus = (mean: number) => {
    return mean === 1 ? "Pass" : "Fail";
  };

  const getPassFailClass = (mean: number) => {
    return mean === 1
      ? "bg-green-500/20 text-green-400"
      : "bg-red-500/20 text-red-400";
  };

  const getEvaluationResult = (
    simulation: SimulationResult,
    metricName: string,
  ) => {
    if (!simulation.evaluation_results) return null;
    // Handle mapping: stt_llm_judge metric key maps to stt_llm_judge_score evaluation result
    const evaluationName =
      metricName === "stt_llm_judge" ? "stt_llm_judge_score" : metricName;
    const result = simulation.evaluation_results.find(
      (r) => r.name === evaluationName || r.name === metricName,
    );
    return result?.value ?? 0;
  };

  const getEvaluationReasoning = (
    simulation: SimulationResult,
    metricName: string,
  ) => {
    if (!simulation.evaluation_results) return "";
    // Handle mapping: stt_llm_judge metric key maps to stt_llm_judge_score evaluation result
    const evaluationName =
      metricName === "stt_llm_judge" ? "stt_llm_judge_score" : metricName;
    const result = simulation.evaluation_results.find(
      (r) => r.name === evaluationName || r.name === metricName,
    );
    return result?.reasoning ?? "";
  };

  // Check if a simulation row is still processing (has transcript but no evaluation results) - yellow spinner
  const isSimulationProcessing = (simulation: SimulationResult) => {
    return (
      (simulation.transcript?.length ?? 0) > 0 && !simulation.evaluation_results
    );
  };

  // Check if a simulation row is waiting (no transcript and no evaluation results) - gray spinner
  const isSimulationWaiting = (simulation: SimulationResult) => {
    return (
      (simulation.transcript?.length ?? 0) === 0 &&
      !simulation.evaluation_results
    );
  };

  const getLatencyMetricTooltip = (metricKey: string): string => {
    const [component, metricType] = metricKey.split("/");
    const componentName =
      component === "stt"
        ? "speech to text"
        : component === "llm"
          ? "language model"
          : component === "tts"
            ? "text to speech"
            : component;

    if (metricType === "ttft") {
      return `Time to first byte for ${componentName}`;
    } else if (metricType === "processing_time") {
      return `Processing time for ${componentName}`;
    }
    return "";
  };

  const openTranscriptDialog = (simulation: SimulationResult) => {
    // Use simulation_name as unique key to keep dialog in sync with polling updates
    // This ensures only this simulation's transcript updates, not another row's
    setSelectedSimulationKey(simulation.simulation_name);
    setTranscriptDialogOpen(true);
  };

  const closeTranscriptDialog = () => {
    setTranscriptDialogOpen(false);
    setSelectedSimulationKey(null);
    frozenSimulationRef.current = null; // Clear frozen data when dialog closes
  };

  const getAudioUrlForEntry = (
    entry: TranscriptEntry,
    entryIndex: number,
    audioUrls: string[] | undefined,
    filteredTranscript: TranscriptEntry[],
  ): string | null => {
    if (!audioUrls || !runData || runData.type !== "voice") {
      return null;
    }

    // Count user and assistant messages up to this entry
    let userCount = 0;
    let assistantCount = 0;

    for (let i = 0; i < entryIndex; i++) {
      if (filteredTranscript[i]?.role === "user") {
        userCount++;
      } else if (filteredTranscript[i]?.role === "assistant") {
        assistantCount++;
      }
    }

    // Determine audio pattern based on role
    let audioPattern: string;
    if (entry.role === "user") {
      // User messages: 1_user, 2_user, 3_user, etc. (1-indexed)
      audioPattern = `${userCount + 1}_user.wav`;
    } else if (entry.role === "assistant") {
      // Assistant messages: 1_bot, 2_bot, 3_bot, etc. (1-indexed)
      audioPattern = `${assistantCount + 1}_bot.wav`;
    } else {
      return null;
    }

    // Find matching audio URL
    const audioUrl = audioUrls.find((url) => url.includes(audioPattern));
    return audioUrl || null;
  };

  // Custom header with back button and title
  const customHeader = (
    <div className="flex items-center gap-4">
      <button
        onClick={() => router.push(`/simulations/${uuid}?tab=runs`)}
        className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 19.5L8.25 12l7.5-7.5"
          />
        </svg>
      </button>
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-semibold">
          {runData?.name || "Loading..."}
        </h1>
        {(runData?.status.toLowerCase() === "in_progress" ||
          runData?.status.toLowerCase() === "queued") && (
          <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
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
        )}
      </div>
    </div>
  );

  // Loading header
  const loadingHeader = (
    <div className="flex items-center gap-4">
      <button
        onClick={() => router.push(`/simulations/${uuid}?tab=runs`)}
        className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M15.75 19.5L8.25 12l7.5-7.5"
          />
        </svg>
      </button>
      <div>
        <h1 className="text-2xl font-semibold">Loading...</h1>
      </div>
    </div>
  );

  // Not found header - back goes to main simulations page
  const notFoundHeader = <div className="flex items-center gap-4"></div>;

  // Determine which header to show
  const getHeader = () => {
    if (isLoading) return loadingHeader;
    if (errorCode) return notFoundHeader;
    return customHeader;
  };

  return (
    <AppLayout
      activeItem="simulations"
      onItemChange={(itemId) => router.push(`/${itemId}`)}
      sidebarOpen={sidebarOpen}
      onSidebarToggle={() => setSidebarOpen(!sidebarOpen)}
      customHeader={getHeader()}
    >
      <div className="space-y-6">
        {isLoading ? (
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
        ) : error ? (
          <div className="border border-border rounded-xl p-12 flex flex-col items-center justify-center bg-muted/20">
            <p className="text-base text-red-500 mb-2">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-base text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              Retry
            </button>
          </div>
        ) : errorCode ? (
          <NotFoundState errorCode={errorCode} />
        ) : runData ? (
          <div className="space-y-6">
            {/* Status and Type Pills */}
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${getStatusBadgeClass(
                  runData.status,
                )}`}
              >
                {formatStatus(runData.status)}
              </span>
              <span
                className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${getTypeBadgeClass(
                  runData.type,
                )}`}
              >
                {runData.type}
              </span>
            </div>

            {/* Error Message - show when simulation has failed */}
            {runData.status.toLowerCase() === "failed" && (
              <div className="border border-red-500/30 rounded-xl p-4 bg-red-500/10">
                <div className="flex items-center gap-3">
                  <svg
                    className="w-5 h-5 text-red-500 flex-shrink-0"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z"
                    />
                  </svg>
                  <span className="text-sm font-medium text-red-500">
                    Simulation Failed
                  </span>
                </div>
              </div>
            )}

            {/* Overall Metrics - only show when simulation is done */}
            {runData.status.toLowerCase() === "done" &&
              runData.metrics &&
              (() => {
                // Separate metrics into regular and latency metrics
                const latencyKeys = [
                  "stt/ttft",
                  "llm/ttft",
                  "tts/ttft",
                  "stt/processing_time",
                  "llm/processing_time",
                  "tts/processing_time",
                ];

                const regularMetrics: Array<[string, MetricData]> = [];
                const latencyMetrics: Array<[string, MetricData]> = [];

                Object.entries(runData.metrics).forEach(([key, metric]) => {
                  if (latencyKeys.includes(key)) {
                    latencyMetrics.push([key, metric as MetricData]);
                  } else {
                    regularMetrics.push([key, metric as MetricData]);
                  }
                });

                // Calculate latency metrics from evaluation_results if not in metrics
                if (runData.simulation_results && latencyMetrics.length === 0) {
                  const latencyValues: Record<string, number[]> = {};
                  latencyKeys.forEach((key) => {
                    latencyValues[key] = [];
                  });

                  runData.simulation_results.forEach((simulation) => {
                    if (simulation.evaluation_results) {
                      latencyKeys.forEach((key) => {
                        const result = simulation.evaluation_results!.find(
                          (r) => r.name === key,
                        );
                        if (result && typeof result.value === "number") {
                          latencyValues[key].push(result.value);
                        }
                      });
                    }
                  });

                  latencyKeys.forEach((key) => {
                    if (latencyValues[key].length > 0) {
                      const mean =
                        latencyValues[key].reduce((a, b) => a + b, 0) /
                        latencyValues[key].length;
                      latencyMetrics.push([
                        key,
                        {
                          mean,
                          std: 0,
                          values: latencyValues[key],
                        },
                      ]);
                    }
                  });
                }

                const isTextType = runData.type === "text";

                return (
                  <div>
                    <h2 className="text-lg font-semibold mb-4">
                      Overall Metrics
                    </h2>

                    {/* Tab Navigation - only show for non-text types */}
                    {!isTextType && (
                      <div className="flex gap-2 border-b border-border mb-4">
                        <button
                          onClick={() => setActiveMetricsTab("performance")}
                          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                            activeMetricsTab === "performance"
                              ? "border-foreground text-foreground"
                              : "border-transparent text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          Performance
                        </button>
                        <button
                          onClick={() => setActiveMetricsTab("latency")}
                          className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                            activeMetricsTab === "latency"
                              ? "border-foreground text-foreground"
                              : "border-transparent text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          Latency
                        </button>
                      </div>
                    )}

                    {/* Performance Tab Content - show for text type or when performance tab is active */}
                    {((isTextType && regularMetrics.length > 0) ||
                      (!isTextType &&
                        activeMetricsTab === "performance" &&
                        regularMetrics.length > 0)) && (
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {regularMetrics.map(([key, metric]) => {
                          const mean = metric.mean;
                          const isSttLlmJudge =
                            key === "stt_llm_judge" ||
                            key === "stt_llm_judge_score";
                          return (
                            <div key={key}>
                              <div className="text-sm text-muted-foreground mb-2 flex items-center gap-1.5">
                                {key}
                                {isSttLlmJudge && (
                                  <Tooltip content="This is the speech to text accuracy for the text spoken by the simulated user calculated by comparing it with the transcribed text by the agent">
                                    <svg
                                      className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                      fill="none"
                                      viewBox="0 0 24 24"
                                      stroke="currentColor"
                                      strokeWidth={2}
                                    >
                                      <path
                                        strokeLinecap="round"
                                        strokeLinejoin="round"
                                        d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
                                      />
                                    </svg>
                                  </Tooltip>
                                )}
                              </div>
                              <div className="text-base font-medium text-foreground">
                                {Math.round(mean * 100)}%
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Latency Tab Content - only show for non-text types */}
                    {!isTextType &&
                      activeMetricsTab === "latency" &&
                      latencyMetrics.length > 0 && (
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                          {latencyMetrics.map(([key, metric]) => {
                            const mean = metric.mean;
                            const tooltipContent = getLatencyMetricTooltip(key);
                            return (
                              <div key={key}>
                                <div className="text-sm text-muted-foreground mb-2 flex items-center gap-1.5">
                                  {key}
                                  {tooltipContent && (
                                    <Tooltip content={tooltipContent}>
                                      <svg
                                        className="w-4 h-4 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        strokeWidth={2}
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z"
                                        />
                                      </svg>
                                    </Tooltip>
                                  )}
                                </div>
                                <div className="text-base font-medium text-foreground">
                                  {mean < 1
                                    ? `${(mean * 1000).toFixed(2)}ms`
                                    : `${mean.toFixed(2)}s`}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                  </div>
                );
              })()}

            {/* Simulation Results Table */}
            {runData.simulation_results &&
              runData.simulation_results.length > 0 &&
              (() => {
                // Latency metrics to exclude from the table (shown in latency tab)
                const latencyMetricKeys = [
                  "stt/ttft",
                  "llm/ttft",
                  "tts/ttft",
                  "stt/processing_time",
                  "llm/processing_time",
                  "tts/processing_time",
                ];

                // Get metric keys - either from runData.metrics or derive from simulation_results
                let displayMetricKeys: string[] = [];
                if (runData.metrics) {
                  displayMetricKeys = Object.keys(runData.metrics).filter(
                    (key) => !latencyMetricKeys.includes(key),
                  );
                } else {
                  // Derive from simulation_results' evaluation_results
                  const metricSet = new Set<string>();
                  runData.simulation_results.forEach((sim) => {
                    if (sim.evaluation_results) {
                      sim.evaluation_results.forEach((result) => {
                        if (!latencyMetricKeys.includes(result.name)) {
                          metricSet.add(result.name);
                        }
                      });
                    }
                  });
                  displayMetricKeys = Array.from(metricSet);
                }

                return (
                  <>
                    <h2 className="text-lg font-semibold mb-4">
                      Simulation Results
                    </h2>
                    <div className="border border-border rounded-xl overflow-hidden bg-muted/20">
                      <div className="overflow-x-auto">
                        <table className="w-full table-fixed">
                          <thead className="bg-background border-t border-border">
                            <tr>
                              <th className="w-10 px-2 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider"></th>
                              <th className="w-44 px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Persona
                              </th>
                              <th className="w-44 px-3 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">
                                Scenario
                              </th>
                              {displayMetricKeys.map((metricKey) => (
                                <th
                                  key={metricKey}
                                  className="w-36 px-3 py-3 text-left text-xs font-medium text-muted-foreground tracking-wider"
                                >
                                  <div className="overflow-x-auto max-w-full">
                                    <div className="whitespace-nowrap">
                                      {metricKey}
                                    </div>
                                  </div>
                                </th>
                              ))}
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-border">
                            {[...runData.simulation_results]
                              .sort((a, b) => {
                                // Sort order: 1) has transcript (completed or processing), 2) waiting (no transcript)
                                // Within has transcript: completed first, then processing
                                const aHasTranscript =
                                  (a.transcript?.length ?? 0) > 0;
                                const bHasTranscript =
                                  (b.transcript?.length ?? 0) > 0;
                                const aHasResults = !!a.evaluation_results;
                                const bHasResults = !!b.evaluation_results;

                                // Priority: completed (3) > processing (2) > waiting (1)
                                const getPriority = (
                                  hasTranscript: boolean,
                                  hasResults: boolean,
                                ) => {
                                  if (hasResults) return 3; // completed
                                  if (hasTranscript) return 2; // processing (yellow spinner)
                                  return 1; // waiting (gray spinner)
                                };

                                return (
                                  getPriority(bHasTranscript, bHasResults) -
                                  getPriority(aHasTranscript, aHasResults)
                                );
                              })
                              .map((simulation, index) => {
                                const isProcessing =
                                  isSimulationProcessing(simulation);
                                const isWaiting =
                                  isSimulationWaiting(simulation);
                                return (
                                  <tr
                                    key={index}
                                    className="hover:bg-muted/30 transition-colors"
                                  >
                                    <td className="px-4 py-4 whitespace-nowrap">
                                      <div className="relative w-6 h-6 flex items-center justify-center">
                                        {/* Spinner ring around the play button */}
                                        {isProcessing && (
                                          <svg
                                            className="absolute inset-0 w-6 h-6 animate-spin text-yellow-500"
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
                                        )}
                                        {isWaiting && (
                                          <svg
                                            className="absolute inset-0 w-6 h-6 animate-spin text-gray-500"
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
                                        )}
                                        {/* Play button in center */}
                                        {(simulation.transcript?.length ?? 0) >
                                          0 && (
                                          <button
                                            onClick={() =>
                                              openTranscriptDialog(simulation)
                                            }
                                            className="relative z-10 flex items-center justify-center w-4 h-4 cursor-pointer"
                                          >
                                            <svg
                                              className="w-4 h-4 text-foreground"
                                              fill="none"
                                              viewBox="0 0 24 24"
                                              stroke="currentColor"
                                              strokeWidth={2}
                                            >
                                              <path
                                                strokeLinecap="round"
                                                strokeLinejoin="round"
                                                d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.986V5.653z"
                                              />
                                            </svg>
                                          </button>
                                        )}
                                      </div>
                                    </td>
                                    <td className="px-3 py-4 text-sm text-foreground">
                                      <div className="overflow-x-auto max-w-full">
                                        <div className="whitespace-nowrap">
                                          {simulation.persona.label}
                                        </div>
                                      </div>
                                    </td>
                                    <td className="px-3 py-4 text-sm text-foreground">
                                      <div className="overflow-x-auto max-w-full">
                                        <div className="whitespace-nowrap">
                                          {simulation.scenario.name}
                                        </div>
                                      </div>
                                    </td>
                                    {displayMetricKeys.map((metricKey) => {
                                      const value = getEvaluationResult(
                                        simulation,
                                        metricKey,
                                      );
                                      const isSttLlmJudge =
                                        metricKey === "stt_llm_judge" ||
                                        metricKey === "stt_llm_judge_score";
                                      const reasoning = getEvaluationReasoning(
                                        simulation,
                                        metricKey,
                                      );

                                      // If evaluation_results is null, show spinner (metrics still processing)
                                      if (value === null) {
                                        return (
                                          <td
                                            key={metricKey}
                                            className="px-3 py-4 whitespace-nowrap"
                                          >
                                            <div className="flex justify-center">
                                              <svg
                                                className={`w-5 h-5 flex-shrink-0 animate-spin ${
                                                  isProcessing
                                                    ? "text-yellow-500"
                                                    : "text-gray-500"
                                                }`}
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
                                          </td>
                                        );
                                      }

                                      const passed = value === 1;

                                      // For stt_llm_judge, show percentage
                                      if (isSttLlmJudge) {
                                        const percentage = parseFloat(
                                          (value * 100).toFixed(2),
                                        );
                                        return (
                                          <td
                                            key={metricKey}
                                            className="px-3 py-4 whitespace-nowrap"
                                          >
                                            <div className="flex justify-center">
                                              {reasoning ? (
                                                <Tooltip content={reasoning}>
                                                  <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium text-foreground">
                                                    {percentage}%
                                                  </span>
                                                </Tooltip>
                                              ) : (
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium text-foreground">
                                                  {percentage}%
                                                </span>
                                              )}
                                            </div>
                                          </td>
                                        );
                                      }

                                      // For other metrics, show Pass/Fail
                                      return (
                                        <td
                                          key={metricKey}
                                          className="px-3 py-4 whitespace-nowrap"
                                        >
                                          <div className="flex justify-center">
                                            {reasoning ? (
                                              <Tooltip content={reasoning}>
                                                <span
                                                  className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${
                                                    passed
                                                      ? "bg-green-500/20 text-green-400"
                                                      : "bg-red-500/20 text-red-400"
                                                  }`}
                                                >
                                                  {passed ? "Pass" : "Fail"}
                                                </span>
                                              </Tooltip>
                                            ) : (
                                              <span
                                                className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium ${
                                                  passed
                                                    ? "bg-green-500/20 text-green-400"
                                                    : "bg-red-500/20 text-red-400"
                                                }`}
                                              >
                                                {passed ? "Pass" : "Fail"}
                                              </span>
                                            )}
                                          </div>
                                        </td>
                                      );
                                    })}
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                );
              })()}
          </div>
        ) : null}
      </div>

      {/* Transcript Dialog */}
      {transcriptDialogOpen && selectedSimulation && (
        <div className="fixed inset-0 z-50 flex justify-end">
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/50"
            onClick={closeTranscriptDialog}
          />
          {/* Sidebar */}
          <div className="relative w-[40%] min-w-[500px] bg-background border-l border-border flex flex-col h-full shadow-2xl">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center gap-3">
                <svg
                  className="w-5 h-5 text-muted-foreground"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={1.5}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
                  />
                </svg>
                <h2 className="text-lg font-semibold">Transcript</h2>
              </div>
              <button
                onClick={closeTranscriptDialog}
                className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer"
              >
                <svg
                  className="w-5 h-5"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M6 18L18 6M6 6l12 12"
                  />
                </svg>
              </button>
            </div>

            {/* Full Conversation Audio Player - show for voice runs with conversation_wav_url */}
            {selectedSimulation.conversation_wav_url && (
              <div className="px-6 pb-4 border-b border-border">
                <div className="flex items-center gap-2 mb-2">
                  <span className="text-sm font-medium text-foreground">
                    Hear the full conversation
                  </span>
                </div>
                <audio
                  key={selectedSimulation.conversation_wav_url}
                  controls
                  className="w-full h-10"
                  src={selectedSimulation.conversation_wav_url}
                  onError={refreshRunData}
                >
                  Your browser does not support the audio element.
                </audio>
              </div>
            )}

            {/* Content */}
            <div
              ref={transcriptContainerRef}
              className="flex-1 overflow-y-auto p-6"
            >
              <div className="space-y-4">
                {(() => {
                  const fullTranscript = selectedSimulation.transcript ?? [];
                  // Filter out end_reason, but keep tool messages that are webhook_response
                  const filteredTranscript = fullTranscript.filter((entry) => {
                    if (entry.role === "end_reason") return false;
                    if (entry.role === "tool") {
                      // Only include tool messages that are webhook_response
                      try {
                        const parsed = JSON.parse(entry.content || "");
                        return parsed?.type === "webhook_response";
                      } catch {
                        return false;
                      }
                    }
                    return true;
                  });
                  // Check if conversation ended due to max turns
                  const lastEntry = fullTranscript[fullTranscript.length - 1];
                  const endedDueToMaxTurns =
                    lastEntry?.role === "end_reason" &&
                    lastEntry?.content === "max_turns";

                  if (filteredTranscript.length === 0) {
                    return (
                      <div className="flex items-center justify-center py-8">
                        <p className="text-sm text-muted-foreground">
                          No transcript available yet
                        </p>
                      </div>
                    );
                  }
                  return filteredTranscript.map((entry, index) => {
                    const audioUrl = getAudioUrlForEntry(
                      entry,
                      index,
                      selectedSimulation.audio_urls,
                      filteredTranscript,
                    );
                    return (
                      <div
                        key={index}
                        className={`space-y-2 ${
                          entry.role === "user" ? "flex flex-col items-end" : ""
                        }`}
                      >
                        {/* Message Header - show for assistant messages */}
                        {entry.role === "assistant" && (
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">
                              {entry.tool_calls ? "Agent Tool Call" : "Agent"}
                            </span>
                          </div>
                        )}

                        {/* Audio Player - show for voice runs, below Agent header for assistant messages */}
                        {audioUrl && (
                          <div
                            className={
                              entry.role === "user" ? "w-1/2" : "w-1/2"
                            }
                          >
                            <audio
                              key={audioUrl}
                              controls
                              className="w-full h-8 mb-2"
                              src={audioUrl}
                              onError={refreshRunData}
                            >
                              Your browser does not support the audio element.
                            </audio>
                          </div>
                        )}

                        {/* User Message */}
                        {entry.role === "user" && entry.content && (
                          <div className="w-1/2">
                            <div className="px-4 py-3 rounded-xl text-sm text-foreground bg-muted border border-border whitespace-pre-wrap">
                              {entry.content}
                            </div>
                          </div>
                        )}

                        {/* Assistant Message (text response) */}
                        {entry.role === "assistant" &&
                          entry.content &&
                          !entry.tool_calls && (
                            <div className="w-1/2">
                              <div className="px-4 py-3 rounded-xl text-sm text-foreground bg-accent border border-border whitespace-pre-wrap">
                                {entry.content}
                              </div>
                            </div>
                          )}

                        {/* Tool Call Display */}
                        {entry.role === "assistant" && entry.tool_calls && (
                          <div className="w-1/2">
                            {entry.tool_calls.map((toolCall, toolIndex) => {
                              let parsedArgs: Record<string, any> = {};
                              try {
                                parsedArgs = JSON.parse(
                                  toolCall.function.arguments,
                                );
                              } catch {
                                parsedArgs = {};
                              }

                              // Helper to format parameter value
                              const formatValue = (val: any): string => {
                                if (val === null) return "null";
                                if (val === undefined) return "undefined";
                                if (typeof val === "object") {
                                  try {
                                    return JSON.stringify(val, null, 2);
                                  } catch {
                                    return String(val);
                                  }
                                }
                                return String(val);
                              };

                                              return (
                                                <div
                                                  key={toolIndex}
                                                  className="bg-muted border border-border rounded-2xl p-4 mb-2"
                                                >
                                                  <div className="flex items-center gap-2 mb-2">
                                                    <svg
                                                      className="w-4 h-4 text-muted-foreground"
                                                      fill="none"
                                                      viewBox="0 0 24 24"
                                                      stroke="currentColor"
                                                      strokeWidth={1.5}
                                                    >
                                                      <path
                                                        strokeLinecap="round"
                                                        strokeLinejoin="round"
                                                        d="M11.42 15.17L17.25 21A2.652 2.652 0 0021 17.25l-5.877-5.877M11.42 15.17l2.496-3.03c.317-.384.74-.626 1.208-.766M11.42 15.17l-4.655 5.653a2.548 2.548 0 11-3.586-3.586l6.837-5.63m5.108-.233c.55-.164 1.163-.188 1.743-.14a4.5 4.5 0 004.486-6.336l-3.276 3.277a3.004 3.004 0 01-2.25-2.25l3.276-3.276a4.5 4.5 0 00-6.336 4.486c.091 1.076-.071 2.264-.904 2.95l-.102.085m-1.745 1.437L5.909 7.5H4.5L2.25 3.75l1.5-1.5L7.5 4.5v1.409l4.26 4.26m-1.745 1.437l1.745-1.437m6.615 8.206L15.75 15.75M4.867 19.125h.008v.008h-.008v-.008z"
                                                      />
                                                    </svg>
                                                    <span className="text-sm font-medium text-foreground">
                                                      {toolCall.function.name}
                                                    </span>
                                                  </div>
                                                  {Object.keys(parsedArgs).filter(k => k !== "headers").length > 0 && (
                                                    <div className="space-y-3 mt-3">
                                                      {Object.entries(parsedArgs)
                                                        .filter(([key]) => key !== "headers")
                                                        .map(
                                                        ([key, value], paramIndex) => {
                                                          const displayValue = formatValue(value);
                                                          const isMultiLine = displayValue.includes("\n");
                                                          return (
                                                            <div key={paramIndex}>
                                                              <label className="block text-sm font-medium text-foreground mb-1.5">
                                                                {key}
                                                              </label>
                                                              <div
                                                                className={`px-3 py-2 bg-background border border-border rounded-lg text-sm text-muted-foreground whitespace-pre-wrap break-all ${
                                                                  isMultiLine ? "font-mono text-xs" : ""
                                                                }`}
                                                              >
                                                                {displayValue}
                                                              </div>
                                                            </div>
                                                          );
                                                        },
                                                      )}
                                                    </div>
                                                  )}
                                                </div>
                                              );
                            })}
                          </div>
                        )}

                        {/* Tool Response Display (webhook_response) */}
                        {entry.role === "tool" &&
                          entry.content &&
                          (() => {
                            // Try to parse content as JSON
                            let parsed: any = null;
                            try {
                              parsed = JSON.parse(entry.content);
                            } catch {
                              return null; // Not valid JSON, don't render
                            }

                            // Check if it's a webhook_response
                            if (parsed?.type !== "webhook_response") {
                              return null;
                            }

                            const response = parsed.response;
                            if (!response || typeof response !== "object") {
                              return null;
                            }

                            // Check if response has error status
                            const isError = parsed.status === "error";

                            // Format response as pretty JSON
                            const jsonString = JSON.stringify(response, null, 2);

                            return (
                              <div className="w-1/2">
                                <div className="flex items-center gap-2 mb-2">
                                  {isError ? (
                                    <>
                                      <svg
                                        className="w-4 h-4 text-red-500"
                                        fill="none"
                                        viewBox="0 0 24 24"
                                        stroke="currentColor"
                                        strokeWidth={2}
                                      >
                                        <path
                                          strokeLinecap="round"
                                          strokeLinejoin="round"
                                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                                        />
                                      </svg>
                                      <span className="text-sm font-medium text-red-500">
                                        Tool Response Error
                                      </span>
                                    </>
                                  ) : (
                                    <span className="text-sm font-medium text-foreground">
                                      Agent Tool Response
                                    </span>
                                  )}
                                </div>
                                <div className={`bg-muted rounded-2xl p-4 border ${isError ? "border-red-500" : "border-border"}`}>
                                  <pre className={`text-sm font-mono whitespace-pre-wrap break-all ${isError ? "text-red-400" : "text-foreground"}`}>
                                    {jsonString}
                                  </pre>
                                </div>
                              </div>
                            );
                          })()}
                      </div>
                    );
                  });
                })()}
                {/* Show max turns reached note */}
                {(() => {
                  const fullTranscript = selectedSimulation.transcript ?? [];
                  const lastEntry = fullTranscript[fullTranscript.length - 1];
                  const endedDueToMaxTurns =
                    lastEntry?.role === "end_reason" &&
                    lastEntry?.content === "max_turns";
                  if (endedDueToMaxTurns) {
                    return (
                      <div className="flex items-center justify-center py-4 mt-2">
                        <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-yellow-500/10 border border-yellow-500/30">
                          <svg
                            className="w-4 h-4 text-yellow-500"
                            fill="none"
                            viewBox="0 0 24 24"
                            stroke="currentColor"
                            strokeWidth={2}
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z"
                            />
                          </svg>
                          <span className="text-sm text-yellow-500">
                            Maximum number of assistant turns reached
                          </span>
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
                {/* Show spinner at bottom while metrics are being fetched */}
                {!selectedSimulation.evaluation_results &&
                  (selectedSimulation.transcript?.length ?? 0) > 0 && (
                    <div className="flex items-center justify-center py-4">
                      <svg
                        className="w-5 h-5 animate-spin text-yellow-500"
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
              </div>
            </div>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
