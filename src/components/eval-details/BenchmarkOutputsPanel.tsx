import React, { useState } from "react";
import {
  TestCaseOutput,
  TestCaseData,
  StatusIcon,
  TestDetailView,
  EmptyStateView,
  EvaluationCriteriaPanel,
} from "@/components/test-results/shared";

export type BenchmarkTestResult = {
  name?: string;
  passed: boolean | null;
  reasoning?: string;
  output?: TestCaseOutput;
  test_case?: TestCaseData;
};

export type BenchmarkModelResult = {
  model: string;
  success: boolean | null;
  message: string;
  total_tests: number | null;
  passed: number | null;
  failed: number | null;
  test_results: BenchmarkTestResult[] | null;
};

type BenchmarkOutputsPanelProps = {
  modelResults: BenchmarkModelResult[];
  expandedModels: Set<string>;
  onToggleModel: (model: string) => void;
  onSetExpandedModels?: (models: Set<string>) => void;
  selectedTest: { model: string; testIndex: number } | null;
  onSelectTest: (model: string, testIndex: number) => void;
  onClearSelection?: () => void;
  /** Placeholder test names for in-progress runs */
  testNames?: string[];
  formatModelName?: (name: string) => string;
  /** Show filter pills + collapse/expand controls */
  showControls?: boolean;
  /** Show spinner for running tests */
  showRunningSpinner?: boolean;
  height?: string;
};

export function BenchmarkOutputsPanel({
  modelResults,
  expandedModels,
  onToggleModel,
  onSetExpandedModels,
  selectedTest,
  onSelectTest,
  onClearSelection,
  testNames = [],
  formatModelName = (n) => n,
  showControls = true,
  showRunningSpinner = false,
  height,
}: BenchmarkOutputsPanelProps) {
  const [statusFilter, setStatusFilter] = useState<"all" | "passed" | "failed">("all");

  const getSelectedTestResult = (): BenchmarkTestResult | null => {
    if (!selectedTest) return null;
    const modelResult = modelResults.find((m) => m.model === selectedTest.model);
    if (!modelResult?.test_results) return null;
    return modelResult.test_results[selectedTest.testIndex] || null;
  };

  const selectedTestResult = getSelectedTestResult();

  return (
    <div className="flex h-full overflow-hidden" style={height ? { height } : undefined}>
      {/* Left Panel - Model list with tests */}
      <div
        className={`w-full md:w-80 border-r border-border flex flex-col overflow-hidden ${
          selectedTest ? "hidden md:flex" : "flex"
        }`}
      >
        {/* Filter pills + collapse/expand */}
        {showControls && modelResults.length > 0 && (
          <div className="shrink-0 border-b border-border flex items-center justify-between px-3 py-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setStatusFilter(statusFilter === "passed" ? "all" : "passed")}
                className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                  statusFilter === "passed"
                    ? "bg-green-100 text-green-700 dark:bg-green-500/30 dark:text-green-400 ring-1 ring-green-500/50"
                    : "bg-green-100/50 text-green-700/60 dark:bg-green-500/10 dark:text-green-400/60 hover:bg-green-100 hover:dark:bg-green-500/20"
                }`}
              >
                Passed
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter(statusFilter === "failed" ? "all" : "failed")}
                className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                  statusFilter === "failed"
                    ? "bg-red-100 text-red-700 dark:bg-red-500/30 dark:text-red-400 ring-1 ring-red-500/50"
                    : "bg-red-100/50 text-red-700/60 dark:bg-red-500/10 dark:text-red-400/60 hover:bg-red-100 hover:dark:bg-red-500/20"
                }`}
              >
                Failed
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                const allModels = modelResults.map((m) => m.model);
                const allExpanded = allModels.every((m) => expandedModels.has(m));
                if (onSetExpandedModels) {
                  onSetExpandedModels(allExpanded ? new Set() : new Set(allModels));
                } else {
                  // Fallback: toggle individually
                  const toToggle = allExpanded ? allModels : allModels.filter((m) => !expandedModels.has(m));
                  toToggle.forEach((m) => onToggleModel(m));
                }
              }}
              className="text-[11px] text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              {modelResults.every((m) => expandedModels.has(m.model))
                ? "Collapse all"
                : "Expand all"}
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">
          {modelResults.length > 0 ? (
            modelResults.map((modelResult) => (
              <ModelSection
                key={modelResult.model}
                modelResult={modelResult}
                isExpanded={expandedModels.has(modelResult.model)}
                onToggle={() => onToggleModel(modelResult.model)}
                selectedTest={selectedTest}
                onTestSelect={(testIndex) => onSelectTest(modelResult.model, testIndex)}
                testNames={testNames}
                statusFilter={statusFilter}
                formatModelName={formatModelName}
                showRunningSpinner={showRunningSpinner}
              />
            ))
          ) : (
            <div className="p-4 text-sm text-muted-foreground">
              Waiting for results...
            </div>
          )}
        </div>
      </div>

      {/* Middle Panel - Test Details */}
      <div
        className={`flex-1 ${selectedTest ? "flex" : "hidden md:flex"} flex-col overflow-hidden`}
      >
        {/* Mobile Back Button */}
        {selectedTest && onClearSelection && (
          <div className="md:hidden px-4 py-3 border-b border-border flex-shrink-0">
            <button
              onClick={onClearSelection}
              className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
              </svg>
              Back to models
            </button>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {selectedTestResult ? (
            selectedTestResult.passed === null && showRunningSpinner ? (
              <div className="flex items-center justify-center h-full">
                <div className="flex items-center gap-3">
                  <svg className="w-5 h-5 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <p className="text-muted-foreground">Running test...</p>
                </div>
              </div>
            ) : (
              <TestDetailView
                history={selectedTestResult.test_case?.history || []}
                output={selectedTestResult.output}
                passed={selectedTestResult.passed ?? false}
                reasoning={selectedTestResult.reasoning}
              />
            )
          ) : (
            <EmptyStateView message="Select a test to view details" />
          )}
        </div>
      </div>

      {/* Right Panel - Evaluation Criteria */}
      {selectedTestResult && selectedTestResult.passed !== null && (
        <div className="hidden md:flex w-72 border-l border-border flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <EvaluationCriteriaPanel evaluation={selectedTestResult.test_case?.evaluation} />
          </div>
        </div>
      )}
    </div>
  );
}

// Model Section with toggle and nested test list
function ModelSection({
  modelResult,
  isExpanded,
  onToggle,
  selectedTest,
  onTestSelect,
  testNames,
  statusFilter,
  formatModelName,
  showRunningSpinner = false,
}: {
  modelResult: BenchmarkModelResult;
  isExpanded: boolean;
  onToggle: () => void;
  selectedTest: { model: string; testIndex: number } | null;
  onTestSelect: (testIndex: number) => void;
  testNames: string[];
  statusFilter: "all" | "passed" | "failed";
  formatModelName: (name: string) => string;
  showRunningSpinner?: boolean;
}) {
  const isProcessing = modelResult.success === null;
  const hasResults = modelResult.test_results && modelResult.test_results.length > 0;
  const passedCount = modelResult.passed ?? 0;
  const failedCount = modelResult.failed ?? 0;
  const totalTests = modelResult.total_tests ?? testNames.length;

  return (
    <div className="border-b border-border">
      <button
        onClick={onToggle}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-muted/50 transition-colors cursor-pointer"
      >
        <div className="flex items-center gap-2 min-w-0">
          <svg
            className={`w-4 h-4 text-muted-foreground transition-transform flex-shrink-0 ${isExpanded ? "rotate-90" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
          </svg>
          <span className="text-sm font-medium text-foreground truncate">
            {formatModelName(modelResult.model)}
          </span>
          {isProcessing && (
            <svg className="w-3.5 h-3.5 animate-spin text-yellow-500 flex-shrink-0" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
          )}
        </div>
        {!isProcessing && modelResult.success !== null && (
          <div className="flex items-center gap-2 text-xs flex-shrink-0">
            {(statusFilter === "all" || statusFilter === "passed") && (
              <span className="text-green-500">{passedCount} passed</span>
            )}
            {(statusFilter === "all" || statusFilter === "failed") && (
              <span className="text-red-500">{failedCount} failed</span>
            )}
          </div>
        )}
      </button>

      {isExpanded && (
        <div className="px-4 pb-3">
          {(() => {
            const resultsCount = modelResult.test_results?.length ?? 0;
            const expectedCount = Math.max(totalTests, testNames.length, resultsCount);

            if (expectedCount === 0 && !hasResults) {
              return (
                <div className="ml-4 px-3 py-2 text-sm text-muted-foreground">
                  {isProcessing ? "Processing..." : "No test results"}
                </div>
              );
            }

            return (
              <div className="space-y-1 ml-4">
                {Array.from({ length: expectedCount }).map((_, index) => {
                  const testResult = modelResult.test_results?.[index];
                  const hasResult = !!testResult;

                  // Skip placeholder rows for completed benchmarks — only show running placeholders during in-progress
                  if (!hasResult && !showRunningSpinner) return null;

                  const status = hasResult
                    ? testResult.passed === null ? "running" : testResult.passed ? "passed" : "failed"
                    : "running";

                  if (statusFilter !== "all" && status !== statusFilter) return null;

                  const isSelected = selectedTest?.model === modelResult.model && selectedTest?.testIndex === index;
                  const testName = hasResult
                    ? testResult.name || testResult.test_case?.name || testNames[index] || `Test ${index + 1}`
                    : testNames[index] || `Test ${index + 1}`;

                  if (hasResult) {
                    return (
                      <button
                        key={index}
                        type="button"
                        onClick={() => onTestSelect(index)}
                        className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                          isSelected ? "bg-muted" : "hover:bg-muted/50"
                        }`}
                      >
                        <StatusIcon status={status as "running" | "passed" | "failed"} />
                        <span className="text-sm text-foreground truncate">{testName}</span>
                      </button>
                    );
                  }

                  return (
                    <div key={index} className="flex items-center gap-2 px-3 py-2 rounded-lg">
                      <StatusIcon status="running" />
                      <span className="text-sm text-foreground truncate">{testName}</span>
                    </div>
                  );
                })}
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}
