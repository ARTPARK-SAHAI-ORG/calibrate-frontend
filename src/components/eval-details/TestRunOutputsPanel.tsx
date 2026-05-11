import React, { useState } from "react";
import {
  TestCaseOutput,
  TestCaseData,
  JudgeResult,
  StatusIcon,
  TestDetailView as SharedTestDetailView,
  EmptyStateView,
  EvaluationCriteriaPanel,
} from "@/components/test-results/shared";
import type { DefaultEvaluatorSummary } from "@/lib/defaultEvaluators";

export type TestRunResult = {
  id: string;
  name: string;
  status: "passed" | "failed" | "running" | "pending" | "queued";
  output?: TestCaseOutput;
  testCase?: TestCaseData;
  reasoning?: string;
  evaluation?: { passed: boolean; message?: string; details?: Record<string, any> };
  error?: string;
  /** Per-evaluator verdicts for response (next-reply) tests. Null/absent
   * for tool-call tests and for legacy rows (which fall back to a single
   * default-evaluator reasoning). */
  judgeResults?: JudgeResult[] | null;
};

type TestRunOutputsPanelProps = {
  results: TestRunResult[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onClearSelection?: () => void;
  height?: string;
  /** Optional rating-evaluator scale lookup (uuid → scale_max). Fallback
   * only — newer judge_results entries carry `scale_max` inline. */
  scaleByEvaluatorUuid?: Record<string, number | undefined>;
  /** Disable evaluator detail links for public share pages. */
  enableEvaluatorLinks?: boolean;
  /** Default correctness evaluator used for legacy next-reply criteria. */
  legacyDefaultEvaluator?: DefaultEvaluatorSummary | null;
};

type StatusGroup = {
  key: string;
  label: string;
  dotColor: string;
  items: TestRunResult[];
};

export function TestRunOutputsPanel({
  results,
  selectedId,
  onSelect,
  onClearSelection,
  height,
  scaleByEvaluatorUuid,
  enableEvaluatorLinks = true,
  legacyDefaultEvaluator,
}: TestRunOutputsPanelProps) {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  const groups: StatusGroup[] = [
    { key: "failed", label: "Failed", dotColor: "bg-red-500", items: results.filter((r) => r.status === "failed") },
    { key: "passed", label: "Passed", dotColor: "bg-green-500", items: results.filter((r) => r.status === "passed") },
    { key: "queued", label: "Queued", dotColor: "bg-gray-400", items: results.filter((r) => r.status === "queued") },
    { key: "running", label: "Running", dotColor: "bg-yellow-500 animate-pulse", items: results.filter((r) => r.status === "running") },
    { key: "pending", label: "Pending", dotColor: "bg-gray-400", items: results.filter((r) => r.status === "pending") },
  ].filter((g) => g.items.length > 0);

  const selectedResult = results.find((r) => r.id === selectedId);

  return (
    <div className="flex h-full overflow-hidden" style={height ? { height } : undefined}>
      {/* Left Panel - Test List */}
      <div
        className={`w-full md:w-80 border-r border-border flex flex-col overflow-hidden ${
          selectedId ? "hidden md:flex" : "flex"
        }`}
      >
        <div className="flex-1 overflow-y-auto">
          {groups.map((group) => (
            <div key={group.key} className="p-4">
              <button
                type="button"
                onClick={() => toggleSection(group.key)}
                className="w-full text-sm font-medium text-muted-foreground mb-2 flex items-center gap-2 cursor-pointer hover:text-foreground transition-colors"
              >
                <svg
                  className={`w-3 h-3 text-muted-foreground transition-transform shrink-0 ${collapsedSections.has(group.key) ? "" : "rotate-90"}`}
                  fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                </svg>
                <div className={`w-2 h-2 rounded-full ${group.dotColor}`}></div>
                {group.label} ({group.items.length})
              </button>
              {!collapsedSections.has(group.key) && (
                <div className="space-y-1">
                  {group.items.map((result) => (
                    <button
                      key={result.id}
                      type="button"
                      onClick={() => onSelect(result.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        selectedId === result.id ? "bg-muted" : "hover:bg-muted/50"
                      }`}
                    >
                      <StatusIcon status={result.status} />
                      <span className="text-sm text-foreground truncate">{result.name}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Middle Panel - Test Details */}
      <div
        className={`flex-1 ${selectedId ? "flex" : "hidden md:flex"} flex-col overflow-hidden`}
      >
        {selectedResult ? (
          <>
            {/* Mobile Back Button */}
            {onClearSelection && (
              <div className="md:hidden px-4 py-3 border-b border-border flex-shrink-0">
                <button
                  onClick={onClearSelection}
                  className="flex items-center gap-2 text-sm text-foreground hover:text-muted-foreground transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                  </svg>
                  Back to tests
                </button>
              </div>
            )}
            <div className="flex-1 overflow-y-auto">
              <TestResultDetail
                result={selectedResult}
                scaleByEvaluatorUuid={scaleByEvaluatorUuid}
                enableEvaluatorLinks={enableEvaluatorLinks}
                legacyDefaultEvaluator={legacyDefaultEvaluator}
              />
            </div>
          </>
        ) : (
          <EmptyStateView message="Select a test to view details" />
        )}
      </div>

      {/* Right Panel - Evaluators / Expected Tool Calls (desktop only).
          On mobile this content is rendered inline by `TestDetailView`. */}
      {selectedResult && (selectedResult.status === "passed" || selectedResult.status === "failed") && (
        <div className="hidden md:flex w-[32rem] border-l border-border flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <EvaluationCriteriaPanel
              evaluation={selectedResult.testCase?.evaluation}
              testCaseEvaluators={selectedResult.testCase?.evaluators}
              passed={
                selectedResult.status === "passed"
                  ? true
                  : selectedResult.status === "failed"
                    ? false
                    : null
              }
              judgeResults={selectedResult.judgeResults}
              reasoning={selectedResult.reasoning}
              scaleByEvaluatorUuid={scaleByEvaluatorUuid}
              enableEvaluatorLinks={enableEvaluatorLinks}
              legacyDefaultEvaluator={legacyDefaultEvaluator}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function TestResultDetail({
  result,
  scaleByEvaluatorUuid,
  enableEvaluatorLinks,
  legacyDefaultEvaluator,
}: {
  result: TestRunResult;
  scaleByEvaluatorUuid?: Record<string, number | undefined>;
  enableEvaluatorLinks: boolean;
  legacyDefaultEvaluator?: DefaultEvaluatorSummary | null;
}) {
  if (result.status === "pending") {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Test is pending</p>
      </div>
    );
  }

  if (result.status === "queued") {
    return (
      <div className="flex items-center justify-center h-full">
        <p className="text-muted-foreground">Test is queued</p>
      </div>
    );
  }

  if (result.status === "running") {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
          </svg>
          <p className="text-muted-foreground">Running test</p>
        </div>
      </div>
    );
  }

  if (result.error) {
    return (
      <div className="p-4 md:p-6">
        <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4">
          <div className="flex items-center gap-2 mb-2">
            <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
            </svg>
            <span className="font-medium text-red-500">Something went wrong</span>
          </div>
          <p className="text-sm text-red-400">
            We&apos;re looking into it. Please reach out to us if this issue persists.
          </p>
        </div>
      </div>
    );
  }

  return (
    <SharedTestDetailView
      history={result.testCase?.history || []}
      output={result.output}
      passed={result.evaluation?.passed ?? false}
      reasoning={result.reasoning}
      evaluation={result.testCase?.evaluation}
      judgeResults={result.judgeResults}
      scaleByEvaluatorUuid={scaleByEvaluatorUuid}
      enableEvaluatorLinks={enableEvaluatorLinks}
      legacyDefaultEvaluator={legacyDefaultEvaluator}
    />
  );
}
