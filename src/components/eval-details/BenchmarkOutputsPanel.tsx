import React, { useEffect, useState } from "react";
import {
  TestCaseOutput,
  TestCaseData,
  JudgeResult,
  TestRunEvaluator,
  StatusIcon,
  TestDetailView,
  EmptyStateView,
  EvaluationCriteriaPanel,
  ResultPager,
  isTypingTarget,
} from "@/components/test-results/shared";
import { SearchInput } from "@/components/ui/SearchInput";
import type { DefaultEvaluatorSummary } from "@/lib/defaultEvaluators";
import type { BenchmarkEvaluatorSummaryEntry } from "@/lib/benchmarkEvaluatorSummary";

export type BenchmarkTestResult = {
  name?: string;
  passed: boolean | null;
  reasoning?: string;
  output?: TestCaseOutput;
  test_case?: TestCaseData;
  /** Set when the test errored out (neither passed nor failed evaluation). */
  error?: string;
  /** Per-evaluator verdicts for response (next-reply) tests. Null for
   * tool-call tests; legacy rows omit the field and fall back to the
   * legacy single-reasoning UI. */
  judge_results?: JudgeResult[] | null;
};

export type BenchmarkModelResult = {
  model: string;
  success: boolean | null;
  message: string;
  total_tests: number | null;
  passed: number | null;
  failed: number | null;
  test_results: BenchmarkTestResult[] | null;
  /** Aggregate per evaluator from metrics.json criteria (finished models). Optional / null on older jobs. */
  evaluator_summary?: BenchmarkEvaluatorSummaryEntry[] | null;
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
  /** Top-level evaluators[] keyed by uuid. Threaded down into the
   * per-evaluator cards as the source of truth for name, description,
   * scale, and output_config. */
  evaluatorsByUuid?: Record<string, TestRunEvaluator>;
  /** Disable evaluator detail links for public share pages. */
  enableEvaluatorLinks?: boolean;
  /** Default correctness evaluator used for legacy next-reply criteria. */
  legacyDefaultEvaluator?: DefaultEvaluatorSummary | null;
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
  evaluatorsByUuid,
  enableEvaluatorLinks = true,
  legacyDefaultEvaluator,
}: BenchmarkOutputsPanelProps) {
  const [statusFilter, setStatusFilter] = useState<"all" | "passed" | "failed" | "errored">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const getSelectedTestResult = (): BenchmarkTestResult | null => {
    if (!selectedTest) return null;
    const modelResult = modelResults.find((m) => m.model === selectedTest.model);
    if (!modelResult?.test_results) return null;
    return modelResult.test_results[selectedTest.testIndex] || null;
  };

  const selectedTestResult = getSelectedTestResult();

  // Flattened display order across all models (respecting the status filter
  // and search), used by the Previous/Next pager in the detail panel.
  const pagerQuery = searchQuery.trim().toLowerCase();
  const pagerFilterStatus = statusFilter === "errored" ? "error" : statusFilter;
  const orderedTests: { model: string; testIndex: number }[] = [];
  for (const m of modelResults) {
    (m.test_results ?? []).forEach((tr, index) => {
      const status = tr.error
        ? "error"
        : tr.passed === null
          ? "running"
          : tr.passed
            ? "passed"
            : "failed";
      if (statusFilter !== "all" && status !== pagerFilterStatus) return;
      const testName =
        tr.name || tr.test_case?.name || testNames[index] || `Test ${index + 1}`;
      if (pagerQuery && !testName.toLowerCase().includes(pagerQuery)) return;
      orderedTests.push({ model: m.model, testIndex: index });
    });
  }
  const currentTestIndex = selectedTest
    ? orderedTests.findIndex(
        (t) =>
          t.model === selectedTest.model && t.testIndex === selectedTest.testIndex,
      )
    : -1;
  // Stepping across model boundaries should reveal the target's model so the
  // list highlight stays in sync.
  const selectAndReveal = (t: { model: string; testIndex: number }) => {
    if (!expandedModels.has(t.model)) {
      if (onSetExpandedModels) {
        onSetExpandedModels(new Set([...expandedModels, t.model]));
      } else {
        onToggleModel(t.model);
      }
    }
    onSelectTest(t.model, t.testIndex);
  };
  const goPrevTest = () => {
    if (currentTestIndex > 0) selectAndReveal(orderedTests[currentTestIndex - 1]);
  };
  const goNextTest = () => {
    if (currentTestIndex >= 0 && currentTestIndex < orderedTests.length - 1)
      selectAndReveal(orderedTests[currentTestIndex + 1]);
  };

  // Arrow-key navigation: Up = previous, Down = next. Ignored while typing in
  // an input (e.g. the search box).
  useEffect(() => {
    if (!selectedTest) return;
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        goPrevTest();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        goNextTest();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedTest, currentTestIndex, orderedTests.length]);

  const selectedTestName = selectedTest
    ? selectedTestResult?.name ||
      selectedTestResult?.test_case?.name ||
      testNames[selectedTest.testIndex] ||
      `Test ${selectedTest.testIndex + 1}`
    : "";

  return (
    <div className="flex h-full overflow-hidden" style={height ? { height } : undefined}>
      {/* Left Panel - Model list with tests */}
      <div
        className={`w-full md:w-80 border-r border-border flex flex-col overflow-hidden ${
          selectedTest ? "hidden md:flex" : "flex"
        }`}
      >
        {/* Search */}
        {modelResults.length > 0 && (
          <div className="shrink-0 border-b border-border p-3">
            <SearchInput
              value={searchQuery}
              onChange={setSearchQuery}
              placeholder="Search tests"
            />
          </div>
        )}
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
              <button
                type="button"
                onClick={() => setStatusFilter(statusFilter === "errored" ? "all" : "errored")}
                className={`inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium cursor-pointer transition-colors ${
                  statusFilter === "errored"
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-500/30 dark:text-amber-400 ring-1 ring-amber-500/50"
                    : "bg-amber-100/50 text-amber-700/60 dark:bg-amber-500/10 dark:text-amber-400/60 hover:bg-amber-100 hover:dark:bg-amber-500/20"
                }`}
              >
                Errored
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
                searchQuery={searchQuery}
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

        {selectedTest && (
          <ResultPager
            currentIndex={currentTestIndex}
            total={orderedTests.length}
            onPrev={goPrevTest}
            onNext={goNextTest}
          />
        )}
        {/* Selected test name — pinned above the scrolling conversation, with
            horizontal scroll for names wider than the panel. */}
        {selectedTest && selectedTestName && (
          <div className="flex-shrink-0 border-b border-border px-4 py-2 overflow-x-auto">
            <span className="block text-sm font-semibold text-foreground whitespace-nowrap">
              {selectedTestName}
            </span>
          </div>
        )}

        <div className="flex-1 overflow-y-auto">
          {selectedTestResult ? (
            selectedTestResult.error ? (
              <div className="p-4 md:p-6">
                <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                    <span className="font-medium text-red-500">Something went wrong</span>
                  </div>
                  <p className="text-sm text-red-400">
                    This test errored out before it could be evaluated. Please reach out to us if this issue persists.
                  </p>
                </div>
              </div>
            ) : selectedTestResult.passed === null && showRunningSpinner ? (
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
                evaluation={selectedTestResult.test_case?.evaluation}
                judgeResults={selectedTestResult.judge_results}
                evaluatorsByUuid={evaluatorsByUuid}
                enableEvaluatorLinks={enableEvaluatorLinks}
                legacyDefaultEvaluator={legacyDefaultEvaluator}
              />
            )
          ) : (
            <EmptyStateView message="Select a test to view details" />
          )}
        </div>
      </div>

      {/* Right Panel - Evaluators / Expected Tool Calls (desktop only).
          On mobile this content is rendered inline by `TestDetailView`. */}
      {selectedTestResult && !selectedTestResult.error && selectedTestResult.passed !== null && (
        <div className="hidden md:flex w-[32rem] border-l border-border flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <EvaluationCriteriaPanel
              evaluation={selectedTestResult.test_case?.evaluation}
              testCaseEvaluators={selectedTestResult.test_case?.evaluators}
              passed={selectedTestResult.passed}
              judgeResults={selectedTestResult.judge_results}
              reasoning={selectedTestResult.reasoning}
              evaluatorsByUuid={evaluatorsByUuid}
              enableEvaluatorLinks={enableEvaluatorLinks}
              legacyDefaultEvaluator={legacyDefaultEvaluator}
            />
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
  searchQuery,
  formatModelName,
  showRunningSpinner = false,
}: {
  modelResult: BenchmarkModelResult;
  isExpanded: boolean;
  onToggle: () => void;
  selectedTest: { model: string; testIndex: number } | null;
  onTestSelect: (testIndex: number) => void;
  testNames: string[];
  statusFilter: "all" | "passed" | "failed" | "errored";
  searchQuery: string;
  formatModelName: (name: string) => string;
  showRunningSpinner?: boolean;
}) {
  const isProcessing = modelResult.success === null;
  const hasResults = modelResult.test_results && modelResult.test_results.length > 0;
  const passedCount = modelResult.passed ?? 0;
  const erroredCount = (modelResult.test_results ?? []).filter((t) => t?.error).length;
  // Errored tests may be lumped into the API's `failed` count — subtract them
  // so the header buckets line up with the categorised rows below.
  const failedCount = Math.max((modelResult.failed ?? 0) - erroredCount, 0);
  const totalTests = modelResult.total_tests ?? testNames.length;
  const query = searchQuery.trim().toLowerCase();

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
            {(statusFilter === "all" || statusFilter === "errored") && erroredCount > 0 && (
              <span className="text-amber-500">{erroredCount} errored</span>
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
                    ? testResult.error
                      ? "error"
                      : testResult.passed === null ? "running" : testResult.passed ? "passed" : "failed"
                    : "running";

                  // statusFilter uses "errored" as the label for the "error" status.
                  const filterStatus = statusFilter === "errored" ? "error" : statusFilter;
                  if (statusFilter !== "all" && status !== filterStatus) return null;

                  const isSelected = selectedTest?.model === modelResult.model && selectedTest?.testIndex === index;
                  const testName = hasResult
                    ? testResult.name || testResult.test_case?.name || testNames[index] || `Test ${index + 1}`
                    : testNames[index] || `Test ${index + 1}`;

                  if (query && !testName.toLowerCase().includes(query)) return null;

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
                        <StatusIcon status={status as "running" | "passed" | "failed" | "error"} />
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
