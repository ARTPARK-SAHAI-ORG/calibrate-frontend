"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  TestCaseOutput,
  TestCaseData,
  StatusIcon,
  CloseIcon,
  SpinnerIcon,
  TestDetailView,
  EmptyStateView,
} from "./test-results/shared";
import { LeaderboardBarChart, getColorMap } from "./charts/LeaderboardBarChart";
import { DownloadableTable } from "./DownloadableTable";

type BenchmarkTestResult = {
  passed: boolean;
  output?: TestCaseOutput;
  test_case?: TestCaseData;
};

type ModelResult = {
  model: string;
  success: boolean;
  message: string;
  total_tests: number;
  passed: number;
  failed: number;
  test_results: BenchmarkTestResult[];
};

type LeaderboardSummary = {
  model: string;
  test_config: string;
  overall: string;
};

type BenchmarkStatusResponse = {
  task_id: string;
  status: string;
  model_results?: ModelResult[];
  leaderboard_summary?: LeaderboardSummary[];
  results_s3_prefix?: string;
  error?: string;
};

type BenchmarkResultsDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  onGoBack?: () => void; // Called when user wants to go back to model selection on error
  agentUuid: string;
  agentName: string;
  testUuids: string[];
  testNames: string[];
  models: string[];
};

export function BenchmarkResultsDialog({
  isOpen,
  onClose,
  onGoBack,
  agentUuid,
  agentName,
  testUuids,
  testNames,
  models,
}: BenchmarkResultsDialogProps) {
  const [activeTab, setActiveTab] = useState<"leaderboard" | "outputs">(
    "leaderboard"
  );
  const [selectedModelIndex, setSelectedModelIndex] = useState(0);
  const [selectedTestIndex, setSelectedTestIndex] = useState<number | null>(
    null
  );
  const [modelDropdownOpen, setModelDropdownOpen] = useState(false);

  // Loading and data state
  const [isLoading, setIsLoading] = useState(true);
  const [taskStatus, setTaskStatus] = useState<string>("queued");
  const [modelResults, setModelResults] = useState<ModelResult[]>([]);
  const [leaderboardSummary, setLeaderboardSummary] = useState<
    LeaderboardSummary[] | undefined
  >(undefined);
  const [error, setError] = useState<string | null>(null);
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Cleanup polling interval on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  // Start benchmark when dialog opens
  useEffect(() => {
    if (isOpen && testUuids.length > 0 && models.length > 0) {
      setIsLoading(true);
      setTaskStatus("queued");
      setModelResults([]);
      setLeaderboardSummary(undefined);
      setError(null);
      setSelectedModelIndex(0);
      setSelectedTestIndex(null);

      // Start the benchmark
      runBenchmark();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const pollBenchmarkStatus = async (taskId: string, backendUrl: string) => {
    try {
      const response = await fetch(
        `${backendUrl}/agent-tests/benchmark/${taskId}`,
        {
          method: "GET",
          headers: {
            accept: "application/json",
            "ngrok-skip-browser-warning": "true",
          },
        }
      );

      if (!response.ok) {
        throw new Error("Failed to poll benchmark status");
      }

      const result: BenchmarkStatusResponse = await response.json();

      // Update task status for display
      setTaskStatus(result.status);

      // Check if polling should stop
      if (
        result.status === "completed" ||
        result.status === "failed" ||
        result.status === "done"
      ) {
        setIsLoading(false);
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }

        if (result.error) {
          setError(result.error);
        } else {
          setModelResults(result.model_results || []);
          setLeaderboardSummary(result.leaderboard_summary);
        }
      }
    } catch (err) {
      console.error("Error polling benchmark status:", err);
      setIsLoading(false);
      setError(err instanceof Error ? err.message : "Failed to poll status");
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
        pollingIntervalRef.current = null;
      }
    }
  };

  const runBenchmark = async () => {
    // Clear any existing polling interval
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!backendUrl) {
      setIsLoading(false);
      setError("BACKEND_URL environment variable is not set");
      return;
    }

    try {
      const response = await fetch(
        `${backendUrl}/agent-tests/agent/${agentUuid}/benchmark`,
        {
          method: "POST",
          headers: {
            accept: "application/json",
            "Content-Type": "application/json",
            "ngrok-skip-browser-warning": "true",
          },
          body: JSON.stringify({
            test_uuids: testUuids,
            models: models,
          }),
        }
      );

      if (!response.ok) {
        throw new Error("Failed to start benchmark");
      }

      const result: BenchmarkStatusResponse = await response.json();
      const taskId = result.task_id;

      // Start polling
      pollingIntervalRef.current = setInterval(() => {
        pollBenchmarkStatus(taskId, backendUrl);
      }, 2000);

      // Also poll immediately
      pollBenchmarkStatus(taskId, backendUrl);
    } catch (err) {
      console.error("Error starting benchmark:", err);
      setIsLoading(false);
      setError(
        err instanceof Error ? err.message : "Failed to start benchmark"
      );
    }
  };

  if (!isOpen) return null;

  const currentModel = modelResults[selectedModelIndex];
  const passedTests = currentModel?.test_results.filter((t) => t.passed) || [];
  const failedTests = currentModel?.test_results.filter((t) => !t.passed) || [];

  const selectedTest =
    selectedTestIndex !== null
      ? currentModel?.test_results[selectedTestIndex]
      : null;

  const handleModelChange = (index: number) => {
    setSelectedModelIndex(index);
    setSelectedTestIndex(null);
    setModelDropdownOpen(false);
  };

  // Get color map for charts
  const modelNames = leaderboardSummary?.map((s) => s.model) || [];
  const colorMap = getColorMap(modelNames);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-background rounded-xl w-full max-w-5xl h-[80vh] flex flex-col shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4">
          <h2 className="text-lg font-semibold text-foreground">
            Benchmark for {agentName}
          </h2>
          <div className="flex items-center gap-2">
            {/* Rerun button - show when benchmark is complete (not loading and no error) */}
            {!isLoading && !error && onGoBack && (
              <button
                onClick={onGoBack}
                className="flex items-center gap-2 h-8 px-3 rounded-md text-sm font-medium border border-border hover:bg-muted/50 transition-colors cursor-pointer"
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
                    d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99"
                  />
                </svg>
                Rerun
              </button>
            )}
            <button
              onClick={onClose}
              className="flex items-center justify-center w-8 h-8 rounded-md hover:bg-muted transition-colors cursor-pointer"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Loading State */}
        {isLoading && (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-4">
              <SpinnerIcon className="w-8 h-8 animate-spin text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {taskStatus === "queued"
                  ? "Benchmark queued"
                  : "Running benchmark"}
              </p>
            </div>
          </div>
        )}

        {/* Error State */}
        {!isLoading && error && (
          <div className="flex-1 flex items-center justify-center p-6">
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-6 max-w-md">
              <div className="flex items-center gap-2 mb-2">
                <svg
                  className="w-5 h-5 text-red-500"
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
                <span className="font-medium text-red-500">Error</span>
              </div>
              <p className="text-sm text-red-400 mb-4">{error}</p>
              {onGoBack && (
                <button
                  onClick={onGoBack}
                  className="w-full h-10 px-4 rounded-md text-sm font-medium bg-foreground text-background hover:opacity-90 transition-opacity cursor-pointer flex items-center justify-center gap-2"
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
                      d="M9 15L3 9m0 0l6-6M3 9h12a6 6 0 010 12h-3"
                    />
                  </svg>
                  Try again
                </button>
              )}
            </div>
          </div>
        )}

        {/* Tab Navigation - Only show after loading */}
        {!isLoading && !error && (
          <div className="px-6 border-b border-border">
            <div className="flex gap-2">
              <button
                onClick={() => setActiveTab("leaderboard")}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                  activeTab === "leaderboard"
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Leaderboard
              </button>
              <button
                onClick={() => setActiveTab("outputs")}
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                  activeTab === "outputs"
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                Outputs
              </button>
            </div>
          </div>
        )}

        {/* Content - Only show after loading */}
        {!isLoading && !error && (
          <div className="flex-1 overflow-y-auto">
            {/* Leaderboard Tab */}
            {activeTab === "leaderboard" && (
              <div className="p-6 space-y-6">
                {/* Leaderboard Table */}
                {leaderboardSummary && leaderboardSummary.length > 0 && (
                  <DownloadableTable
                    columns={[
                      {
                        key: "model",
                        header: "Model",
                        render: (value) => value.replace("__", "/"),
                      },
                      { key: "overall", header: "Test pass rate (%)" },
                    ]}
                    data={leaderboardSummary.map((s) => ({
                      model: s.model,
                      overall: s.overall,
                    }))}
                    filename={`benchmark-leaderboard-${agentName}`}
                  />
                )}

                {/* Charts Section */}
                {leaderboardSummary && leaderboardSummary.length > 0 && (
                  <LeaderboardBarChart
                    title="Test pass rate (%)"
                    data={leaderboardSummary.map((s) => ({
                      label: s.model.replace("__", "/"),
                      value: parseFloat(s.overall),
                      colorKey: s.model,
                    }))}
                    yDomain={[0, 100]}
                    formatTooltip={(value) => `${value.toFixed(1)}%`}
                    colorMap={colorMap}
                  />
                )}

                {/* Empty State */}
                {(!leaderboardSummary || leaderboardSummary.length === 0) && (
                  <div className="text-center py-12">
                    <p className="text-sm text-muted-foreground">
                      No leaderboard data available
                    </p>
                  </div>
                )}
              </div>
            )}

            {/* Outputs Tab */}
            {activeTab === "outputs" && (
              <div className="flex-1 flex overflow-hidden h-full">
                {/* Left Panel - Test List */}
                <div className="w-80 border-r border-border flex flex-col overflow-hidden">
                  {/* Model Dropdown and Stats */}
                  <div className="p-4 border-b border-border">
                    <div className="relative">
                      <button
                        onClick={() => setModelDropdownOpen(!modelDropdownOpen)}
                        className="w-full h-10 px-4 rounded-md text-sm border border-border bg-background hover:bg-muted/50 flex items-center justify-between cursor-pointer transition-colors"
                      >
                        <span className="text-foreground truncate">
                          {currentModel?.model || "Select model"}
                        </span>
                        <svg
                          className={`w-4 h-4 text-muted-foreground transition-transform ${
                            modelDropdownOpen ? "rotate-180" : ""
                          }`}
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
                      </button>

                      {/* Dropdown Menu */}
                      {modelDropdownOpen && (
                        <div className="absolute top-full left-0 right-0 mt-1 bg-background border border-border rounded-md shadow-lg z-10 max-h-48 overflow-y-auto">
                          {modelResults.map((model, index) => (
                            <button
                              key={model.model}
                              onClick={() => handleModelChange(index)}
                              className={`w-full px-4 py-2 text-left text-sm hover:bg-muted/50 transition-colors cursor-pointer ${
                                index === selectedModelIndex
                                  ? "bg-muted/50"
                                  : ""
                              }`}
                            >
                              <span className="text-foreground">
                                {model.model}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Passed/Failed Stats */}
                    {currentModel && (
                      <div className="flex items-center gap-3 mt-3 text-sm">
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-green-500"></div>
                          <span className="text-muted-foreground">
                            {currentModel.passed} passed
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <div className="w-2 h-2 rounded-full bg-red-500"></div>
                          <span className="text-muted-foreground">
                            {currentModel.failed} failed
                          </span>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Test List */}
                  <div className="flex-1 overflow-y-auto">
                    {/* Failed Tests - Always shown first */}
                    {failedTests.length > 0 && (
                      <div className="p-4">
                        <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-red-500"></div>
                          Failed ({failedTests.length})
                        </h3>
                        <div className="space-y-1">
                          {failedTests.map((result) => {
                            const originalIndex =
                              currentModel.test_results.indexOf(result);
                            return (
                              <BenchmarkTestListItem
                                key={originalIndex}
                                result={result}
                                index={originalIndex}
                                testName={testNames[originalIndex] || ""}
                                isSelected={selectedTestIndex === originalIndex}
                                onSelect={() =>
                                  setSelectedTestIndex(originalIndex)
                                }
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {/* Passed Tests */}
                    {passedTests.length > 0 && (
                      <div className="p-4">
                        <h3 className="text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2">
                          <div className="w-2 h-2 rounded-full bg-green-500"></div>
                          Passed ({passedTests.length})
                        </h3>
                        <div className="space-y-1">
                          {passedTests.map((result) => {
                            const originalIndex =
                              currentModel.test_results.indexOf(result);
                            return (
                              <BenchmarkTestListItem
                                key={originalIndex}
                                result={result}
                                index={originalIndex}
                                testName={testNames[originalIndex] || ""}
                                isSelected={selectedTestIndex === originalIndex}
                                onSelect={() =>
                                  setSelectedTestIndex(originalIndex)
                                }
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Panel - Test Details */}
                <div className="flex-1 overflow-y-auto">
                  {selectedTest ? (
                    <TestDetailView
                      history={selectedTest.test_case?.history || []}
                      output={selectedTest.output}
                      passed={selectedTest.passed}
                    />
                  ) : (
                    <EmptyStateView message="Select a test to view details" />
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// Benchmark Test List Item Component
function BenchmarkTestListItem({
  result,
  index,
  testName,
  isSelected,
  onSelect,
}: {
  result: BenchmarkTestResult;
  index: number;
  testName: string;
  isSelected: boolean;
  onSelect: () => void;
}) {
  // Use provided test name or generate a default
  const displayName =
    testName ||
    (result.test_case?.evaluation?.type === "tool_call"
      ? `Tool Call Test ${index + 1}`
      : `Response Test ${index + 1}`);

  return (
    <div
      onClick={onSelect}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
        isSelected ? "bg-muted" : "hover:bg-muted/50"
      }`}
    >
      <StatusIcon status={result.passed ? "passed" : "failed"} />
      <span className="text-sm text-foreground truncate">{displayName}</span>
    </div>
  );
}
