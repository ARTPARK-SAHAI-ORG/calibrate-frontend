"use client";

import { useState, useRef, useEffect } from "react";
import { useSession, signOut } from "next-auth/react";
import { ttsProviders } from "../agent-tabs/constants/providers";
import {
  LeaderboardBarChart,
  getColorMap,
} from "../charts/LeaderboardBarChart";
import { DownloadableTable } from "../DownloadableTable";

type TextRow = {
  id: string;
  text: string;
};

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

// Use provider labels for display
const providerLabels = ttsProviders.map((p) => p.label);

// Helper function to map provider value back to label
const getProviderLabel = (value: string): string => {
  const provider = ttsProviders.find((p) => p.value === value);
  return provider ? provider.label : value;
};

export function TextToSpeechEvaluation() {
  const { data: session } = useSession();
  const backendAccessToken = (session as any)?.backendAccessToken;
  const [rows, setRows] = useState<TextRow[]>([{ id: "1", text: "" }]);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState<string | null>(null);
  const [invalidRowIds, setInvalidRowIds] = useState<Set<string>>(new Set());
  const [selectedProviders, setSelectedProviders] = useState<Set<string>>(
    new Set(providerLabels)
  );
  const [language, setLanguage] = useState<"english" | "hindi">("english");
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evaluationResult, setEvaluationResult] =
    useState<EvaluationResult | null>(null);
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

  // Scroll to bottom when evaluation completes
  useEffect(() => {
    if (evaluationResult && evaluationResult.status === "done") {
      // Small delay to ensure DOM has updated
      setTimeout(() => {
        window.scrollTo({
          top: document.documentElement.scrollHeight,
          behavior: "smooth",
        });
      }, 100);
    }
  }, [evaluationResult]);

  const addRow = () => {
    // Validate existing rows
    const invalidIds = new Set<string>();
    rows.forEach((row) => {
      if (!row.text.trim()) {
        invalidIds.add(row.id);
      }
    });

    if (invalidIds.size > 0) {
      // Highlight invalid rows
      setInvalidRowIds(invalidIds);
      return; // Don't add new row if validation fails
    }

    // Clear validation errors and add new row
    setInvalidRowIds(new Set());
    const newId = Date.now().toString();
    setRows([...rows, { id: newId, text: "" }]);
  };

  const deleteRow = (id: string) => {
    if (rows.length === 1) return; // Don't allow deleting the last row
    setRows(rows.filter((row) => row.id !== id));
    setDeleteDialogOpen(null);
  };

  const handleTextChange = (id: string, text: string) => {
    setRows(rows.map((row) => (row.id === id ? { ...row, text } : row)));
    // Clear validation error for this row if text is entered
    if (text.trim()) {
      setInvalidRowIds((prev) => {
        const newSet = new Set(prev);
        newSet.delete(id);
        return newSet;
      });
    }
  };

  const toggleProvider = (provider: string) => {
    setSelectedProviders((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(provider)) {
        newSet.delete(provider);
      } else {
        newSet.add(provider);
      }
      return newSet;
    });
  };

  const toggleAllProviders = () => {
    if (selectedProviders.size === providerLabels.length) {
      // Deselect all
      setSelectedProviders(new Set());
    } else {
      // Select all
      setSelectedProviders(new Set(providerLabels));
    }
  };

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
        setIsEvaluating(false);
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
      setIsEvaluating(false);
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }
  };

  const handleEvaluate = async () => {
    // Validate all rows (same check as addRow)
    const invalidIds = new Set<string>();
    rows.forEach((row) => {
      if (!row.text.trim()) {
        invalidIds.add(row.id);
      }
    });

    if (invalidIds.size > 0) {
      // Highlight invalid rows
      setInvalidRowIds(invalidIds);
      return; // Don't evaluate if validation fails
    }

    // Clear validation errors and proceed with evaluation
    setInvalidRowIds(new Set());
    setIsEvaluating(true);
    setEvaluationResult(null);
    setActiveTab("leaderboard");
    setActiveProviderTab(null);

    // Clear any existing polling interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    try {
      const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
      if (!backendUrl) {
        console.error("BACKEND_URL environment variable is not set");
        setIsEvaluating(false);
        return;
      }

      // Collect texts
      const texts = rows.map((row) => row.text.trim());

      // Make API call
      const response = await fetch(`${backendUrl}/tts/evaluate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          accept: "application/json",
          "ngrok-skip-browser-warning": "true",
          Authorization: `Bearer ${backendAccessToken}`,
        },
        body: JSON.stringify({
          texts: texts,
          // Map provider labels to their actual values
          providers: Array.from(selectedProviders).map((label) => {
            const provider = ttsProviders.find((p) => p.label === label);
            return provider ? provider.value : label;
          }),
          language: language,
        }),
      });

      if (response.status === 401) {
        await signOut({ callbackUrl: "/login" });
        return;
      }

      if (!response.ok) {
        throw new Error("Failed to evaluate");
      }

      const result: EvaluationResult = await response.json();
      setEvaluationResult(result);

      if ((result.status === "queued" || result.status === "in_progress") && result.task_id) {
        // Start polling
        pollingIntervalRef.current = setInterval(() => {
          pollTaskStatus(result.task_id, backendUrl);
        }, 2000); // Poll every 2 seconds
      } else if (result.status === "done") {
        setIsEvaluating(false);
        if (result.provider_results && result.provider_results.length > 0) {
          setActiveProviderTab(result.provider_results[0].provider);
        }
      }
    } catch (error) {
      console.error("Error evaluating:", error);
      setIsEvaluating(false);
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }
  };

  return (
    <div className="space-y-6">
      {/* Title Section */}
      <div className="space-y-2">
        <h2 className="text-2xl font-semibold tracking-tight">
          Text-to-Speech Evaluation
        </h2>
        <p className="text-muted-foreground text-[15px] leading-relaxed">
          Provide text inputs to evaluate TTS quality. Get metrics like LLM
          Judge Score, TTFB, and detailed analysis.
        </p>
      </div>

      {/* Text Rows */}
      <div className="space-y-4">
        {rows.map((row, index) => {
          const isInvalid = invalidRowIds.has(row.id);
          return (
            <div
              key={row.id}
              className={`border rounded-xl p-4 flex items-center gap-4 transition-colors ${
                isInvalid
                  ? "border-red-500 bg-red-500/10"
                  : "border-border bg-muted/10"
              }`}
            >
              {/* Row Number */}
              <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-[13px] font-medium text-muted-foreground">
                {index + 1}
              </div>

              {/* Text Input */}
              <div className="flex-1">
                <input
                  type="text"
                  value={row.text}
                  onChange={(e) => handleTextChange(row.id, e.target.value)}
                  placeholder="Enter text to synthesize"
                  className="w-full h-10 px-3 rounded-md text-[13px] border border-border bg-background focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent"
                />
              </div>

              {/* Delete Button */}
              {rows.length > 1 && (
                <button
                  onClick={() => setDeleteDialogOpen(row.id)}
                  className="flex-shrink-0 w-10 h-10 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent transition-colors flex items-center justify-center cursor-pointer"
                  aria-label="Delete row"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1.5}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0"
                    />
                  </svg>
                </button>
              )}
            </div>
          );
        })}
      </div>

      {/* Add Row Button */}
      <button
        onClick={addRow}
        className="w-full h-10 px-4 rounded-md text-[13px] font-medium border border-dashed border-border bg-muted/20 hover:bg-muted/40 transition-colors flex items-center justify-center gap-2 text-muted-foreground hover:text-foreground cursor-pointer"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 4.5v15m7.5-7.5h-15"
          />
        </svg>
        Add another sample
      </button>

      {/* Language Selection */}
      <div className="pt-4 flex items-center gap-3">
        <label className="text-[13px] font-medium text-foreground">
          Language
        </label>
        <div className="relative">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value as "english" | "hindi")}
            className="h-10 px-4 pr-10 rounded-md text-[13px] border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-accent focus:border-transparent cursor-pointer appearance-none min-w-[140px]"
          >
            <option value="english">English</option>
            <option value="hindi">Hindi</option>
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

      {/* Provider Selection */}
      <div className="pt-4 space-y-3">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-medium text-foreground">
            Select providers to evaluate
          </h3>
          <span className="text-[12px] text-muted-foreground">
            ({selectedProviders.size} selected)
          </span>
          <button
            onClick={toggleAllProviders}
            className="ml-auto text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
          >
            {selectedProviders.size === providerLabels.length
              ? "Deselect all"
              : "Select all"}
          </button>
        </div>
        <div className="flex flex-wrap gap-3">
          {providerLabels.map((providerLabel) => {
            const isSelected = selectedProviders.has(providerLabel);
            return (
              <button
                key={providerLabel}
                onClick={() => toggleProvider(providerLabel)}
                className={`h-9 px-4 rounded-md text-[13px] font-medium border transition-colors cursor-pointer flex items-center gap-2 ${
                  isSelected
                    ? "bg-foreground text-background border-foreground"
                    : "bg-background text-muted-foreground border-border hover:bg-accent/50 hover:text-foreground hover:border-border"
                }`}
              >
                {isSelected && (
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={2}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M4.5 12.75l6 6 9-13.5"
                    />
                  </svg>
                )}
                {providerLabel}
              </button>
            );
          })}
        </div>
      </div>

      {/* Evaluate Button */}
      <div className="pt-6">
        {isEvaluating ? (
          <div className="flex items-center gap-3 h-11 px-8">
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
            <span className="text-[14px] font-medium">
              {evaluationResult?.status === "queued"
                ? "Evaluation queued..."
                : "Evaluating..."}
            </span>
          </div>
        ) : (
          <button
            onClick={handleEvaluate}
            className="h-11 px-8 rounded-md text-[14px] font-semibold bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer flex items-center gap-2 shadow-sm"
          >
            <svg
              className="w-4 h-4"
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
            Evaluate
          </button>
        )}
      </div>

      {/* Results Tabs */}
      {evaluationResult && evaluationResult.status === "done" && (
        <div className="pt-6 space-y-4">
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
                        The LLM judge evaluates whether the synthesized audio
                        accurately matches the reference text. It checks for
                        semantic equivalence and pronunciation accuracy.
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
                        request is sent until the first byte of the response is
                        received.
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
                        Total time taken to process the text and generate the
                        audio output.
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
                        { key: "llm_judge_score", header: "LLM Judge Score" },
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
                        evaluationResult.leaderboard_summary.map((s) => s.run);
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
                    {evaluationResult.provider_results.map((providerResult) => (
                      <option
                        key={providerResult.provider}
                        value={providerResult.provider}
                      >
                        {getProviderLabel(providerResult.provider)}
                      </option>
                    ))}
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
                      <div key={providerResult.provider} className="space-y-6">
                        {/* Error Message */}
                        {!providerResult.success && providerResult.message && (
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
                                {providerResult.metrics.map((metric, index) => {
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
                                })}
                              </div>
                              {/* Second Row: TTFB, Processing Time */}
                              <div className="grid grid-cols-3 gap-4">
                                {providerResult.metrics.map((metric, index) => {
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
                                })}
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
                                              Your browser does not support the
                                              audio element.
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

      {/* Delete Confirmation Dialog */}
      {deleteDialogOpen && (
        <DeleteConfirmationDialog
          onConfirm={() => deleteRow(deleteDialogOpen)}
          onCancel={() => setDeleteDialogOpen(null)}
        />
      )}
    </div>
  );
}

function DeleteConfirmationDialog({
  onConfirm,
  onCancel,
}: {
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onCancel}
    >
      <div
        className="bg-background border border-border rounded-xl p-6 max-w-md w-full mx-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-[15px] font-semibold mb-2">Delete row</h3>
        <p className="text-[13px] text-muted-foreground mb-6">
          Are you sure you want to delete this row? This action cannot be
          undone.
        </p>
        <div className="flex items-center justify-end gap-3">
          <button
            onClick={onCancel}
            className="h-9 px-4 rounded-md text-[13px] font-medium text-muted-foreground hover:bg-accent transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className="h-9 px-4 rounded-md text-[13px] font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer"
          >
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
