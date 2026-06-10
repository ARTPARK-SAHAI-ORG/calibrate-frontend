import React, { useEffect, useRef, useState } from "react";
import {
  TestCaseOutput,
  TestCaseData,
  JudgeResult,
  TestRunEvaluator,
  StatusIcon,
  TestDetailView as SharedTestDetailView,
  EmptyStateView,
  EvaluationCriteriaPanel,
  isTypingTarget,
  scrollRowByPage,
  type PagerNav,
} from "@/components/test-results/shared";
import { SearchInput } from "@/components/ui/SearchInput";
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
  /** Top-level evaluators[] keyed by uuid. Threaded down into the
   * per-evaluator cards as the source of truth for name, description,
   * scale, and output_config. */
  evaluatorsByUuid?: Record<string, TestRunEvaluator>;
  /** Disable evaluator detail links for public share pages. */
  enableEvaluatorLinks?: boolean;
  /** Default correctness evaluator used for legacy next-reply criteria. */
  legacyDefaultEvaluator?: DefaultEvaluatorSummary | null;
  /** Reports Previous/Next navigation state so a parent (the dialog header)
   * can render the pager. Must be a stable callback (e.g. a useState setter). */
  onNavChange?: (nav: PagerNav) => void;
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
  evaluatorsByUuid,
  enableEvaluatorLinks = true,
  legacyDefaultEvaluator,
  onNavChange,
}: TestRunOutputsPanelProps) {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  // Refs to the list scroll container and the currently-selected row, so
  // navigation keeps the selection in view (a page at a time).
  const listContainerRef = useRef<HTMLDivElement>(null);
  const selectedRowRef = useRef<HTMLButtonElement>(null);

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // A test that surfaced an `error` neither passed nor failed evaluation —
  // it errored out. Bucket those separately from genuine evaluation failures.
  const isErrored = (r: TestRunResult) => !!r.error;

  const query = searchQuery.trim().toLowerCase();
  const filteredResults = query
    ? results.filter((r) => r.name.toLowerCase().includes(query))
    : results;

  const groups: StatusGroup[] = [
    { key: "failed", label: "Failed", dotColor: "bg-red-500", items: filteredResults.filter((r) => r.status === "failed" && !isErrored(r)) },
    { key: "errored", label: "Errored", dotColor: "bg-amber-500", items: filteredResults.filter((r) => isErrored(r)) },
    { key: "passed", label: "Passed", dotColor: "bg-green-500", items: filteredResults.filter((r) => r.status === "passed") },
    { key: "queued", label: "Queued", dotColor: "bg-gray-400", items: filteredResults.filter((r) => r.status === "queued") },
    { key: "running", label: "Running", dotColor: "bg-yellow-500 animate-pulse", items: filteredResults.filter((r) => r.status === "running") },
    { key: "pending", label: "Pending", dotColor: "bg-gray-400", items: filteredResults.filter((r) => r.status === "pending") },
  ].filter((g) => g.items.length > 0);

  const selectedResult = results.find((r) => r.id === selectedId);

  // Flattened display order — the same buckets/order as the rendered `groups`,
  // so the Previous/Next pager (parent renders it in the dialog header) always
  // matches the visible list. `groups` is already filtered by search above.
  const orderedItems = groups.flatMap((g) => g.items);
  const currentIndex = orderedItems.findIndex((r) => r.id === selectedId);
  const goPrev = () => {
    if (currentIndex > 0) onSelect(orderedItems[currentIndex - 1].id);
  };
  const goNext = () => {
    if (currentIndex >= 0 && currentIndex < orderedItems.length - 1)
      onSelect(orderedItems[currentIndex + 1].id);
  };

  // Keep the latest list/selection in a ref so the reported goPrev/goNext stay
  // stable while reading fresh values when invoked.
  const navStateRef = useRef({ orderedItems, selectedId, onSelect });
  navStateRef.current = { orderedItems, selectedId, onSelect };

  // Surface navigation state to the parent (dialog header pager). Depends only
  // on the primitive index/length so it doesn't re-fire every render — the
  // `results` prop (and thus `orderedItems`) is rebuilt by callers each render,
  // which would otherwise loop setState in the parent.
  useEffect(() => {
    if (!onNavChange) return;
    onNavChange({
      currentIndex,
      total: orderedItems.length,
      goPrev: () => {
        const s = navStateRef.current;
        const i = s.orderedItems.findIndex((r) => r.id === s.selectedId);
        if (i > 0) s.onSelect(s.orderedItems[i - 1].id);
      },
      goNext: () => {
        const s = navStateRef.current;
        const i = s.orderedItems.findIndex((r) => r.id === s.selectedId);
        if (i >= 0 && i < s.orderedItems.length - 1)
          s.onSelect(s.orderedItems[i + 1].id);
      },
    });
  }, [onNavChange, currentIndex, orderedItems.length]);

  // Arrow-key navigation: Up = previous, Down = next. Ignored while typing in
  // an input (e.g. the search box).
  useEffect(() => {
    if (!selectedId) return;
    const handler = (e: KeyboardEvent) => {
      if (isTypingTarget(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowUp") {
        e.preventDefault();
        goPrev();
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        goNext();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId, currentIndex, orderedItems.length]);

  // Keep the selected row visible in the list as the selection changes,
  // scrolling a page at a time rather than row by row.
  useEffect(() => {
    scrollRowByPage(listContainerRef.current, selectedRowRef.current);
  }, [selectedId]);

  return (
    <div className="flex h-full overflow-hidden" style={height ? { height } : undefined}>
      {/* Left Panel - Test List */}
      <div
        className={`w-full md:w-80 border-r border-border flex flex-col overflow-hidden ${
          selectedId ? "hidden md:flex" : "flex"
        }`}
      >
        {/* Search */}
        <div className="shrink-0 border-b border-border p-3">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search tests"
          />
        </div>
        <div ref={listContainerRef} className="flex-1 overflow-y-auto">
          {groups.length === 0 && query && (
            <div className="p-4 text-sm text-muted-foreground">
              No tests match &ldquo;{searchQuery}&rdquo;
            </div>
          )}
          {groups.map((group) => (
            <div key={group.key}>
              <button
                type="button"
                onClick={() => toggleSection(group.key)}
                className="sticky top-0 z-10 bg-background w-full text-sm font-medium text-muted-foreground px-4 py-3 flex items-center gap-2 cursor-pointer hover:text-foreground transition-colors border-b border-border"
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
                <div className="space-y-1 px-4 py-2">
                  {group.items.map((result) => (
                    <button
                      key={result.id}
                      ref={selectedId === result.id ? selectedRowRef : undefined}
                      type="button"
                      onClick={() => onSelect(result.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors ${
                        selectedId === result.id ? "bg-muted" : "hover:bg-muted/50"
                      }`}
                    >
                      <StatusIcon status={isErrored(result) ? "error" : result.status} />
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
                evaluatorsByUuid={evaluatorsByUuid}
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
      {selectedResult && !isErrored(selectedResult) && (selectedResult.status === "passed" || selectedResult.status === "failed") && (
        <div className="hidden md:flex w-[26rem] border-l border-border flex-col overflow-hidden">
          <div className="flex-1 overflow-y-auto">
            <EvaluationCriteriaPanel
              testName={selectedResult.name}
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

function TestResultDetail({
  result,
  evaluatorsByUuid,
  enableEvaluatorLinks,
  legacyDefaultEvaluator,
}: {
  result: TestRunResult;
  evaluatorsByUuid?: Record<string, TestRunEvaluator>;
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
      evaluatorsByUuid={evaluatorsByUuid}
      enableEvaluatorLinks={enableEvaluatorLinks}
      legacyDefaultEvaluator={legacyDefaultEvaluator}
    />
  );
}
