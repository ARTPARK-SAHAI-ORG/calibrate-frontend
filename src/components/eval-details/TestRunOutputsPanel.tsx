import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  TestCaseOutput,
  TestCaseData,
  JudgeResult,
  TestRunEvaluator,
  StatusIcon,
  LabellingRowCheckbox,
  TestDetailView as SharedTestDetailView,
  EmptyStateView,
  EvaluationCriteriaPanel,
  TestCouldNotRunNotice,
  ResizeHandle,
  isTypingTarget,
  scrollRowByPage,
  type PagerNav,
} from "@/components/test-results/shared";
import { SearchInput } from "@/components/ui/SearchInput";
import type { DefaultEvaluatorSummary } from "@/lib/defaultEvaluators";
import { isLabellingEligibleRaw } from "@/components/human-labelling/AddRunToLabellingTaskDialog";
import { useResizableWidth } from "@/hooks/useResizableWidth";
import { isUnanswered } from "@/lib/testTypes";

export type TestRunResult = {
  id: string;
  name: string;
  status: "passed" | "failed" | "running" | "pending" | "queued" | "not_run";
  /** The test produced no answer, so `status` is not a verdict on the agent. */
  unanswered?: boolean;
  output?: TestCaseOutput;
  testCase?: TestCaseData;
  /** The judge's reasoning, or — when `unanswered` — why it could not run. */
  reasoning?: string;
  /** Effective custom inputs the agent received for this case: the agent's
   * default_inputs merged with the per-case overrides. Absent when the agent
   * has no custom fields. */
  inputs?: Record<string, unknown>;
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
  /** What to say when the run has no tests to list at all. */
  emptyMessage?: string;
  /** Reports Previous/Next navigation state so a parent (the dialog header)
   * can render the pager. Must be a stable callback (e.g. a useState setter). */
  onNavChange?: (nav: PagerNav) => void;
  /** When set, renders a labelling checkbox on each completed test row. */
  labellingSelection?: Set<string>;
  onToggleLabellingSelection?: (id: string) => void;
  /** Toggle select-all / deselect-all for the given ids. */
  onLabellingBulkToggle?: (ids: string[]) => void;
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
  emptyMessage = "No tests to show",
  onNavChange,
  labellingSelection,
  onToggleLabellingSelection,
  onLabellingBulkToggle,
}: TestRunOutputsPanelProps) {
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  // Refs to the list scroll container and the currently-selected row, so
  // navigation keeps the selection in view (a page at a time).
  const listContainerRef = useRef<HTMLDivElement>(null);
  const selectedRowRef = useRef<HTMLDivElement>(null);
  // Both side columns start at their old fixed widths but are user-resizable,
  // so a long input/output pair in the middle can be given more room.
  const listPanel = useResizableWidth(320, 240, 560, "grow-right");
  const verdictPanel = useResizableWidth(512, 320, 720, "grow-left");

  const toggleSection = (key: string) => {
    setCollapsedSections((prev) => {
      const next = new Set(prev);
      next.has(key) ? next.delete(key) : next.add(key);
      return next;
    });
  };

  // A test that produced no answer was never judged. Bucket those separately
  // from genuine wrong answers, which the same `status` would otherwise hide.
  const isErrored = (r: TestRunResult) => isUnanswered(r);
  const isLabellingEligible = (r: TestRunResult) =>
    isLabellingEligibleRaw({ test_case: r.testCase ?? null });
  // Only a finished test that can actually be submitted is tickable. A test
  // of a kind that would always be skipped gets no checkbox at all rather
  // than one that leads nowhere.
  const isLabellingSelectable = (r: TestRunResult) =>
    isLabellingEligible(r) &&
    (r.status === "passed" || r.status === "failed" || isErrored(r));
  const showLabellingCheckboxes = !!onToggleLabellingSelection;

  const query = searchQuery.trim().toLowerCase();
  const filteredResults = useMemo(
    () =>
      query
        ? results.filter((r) => r.name.toLowerCase().includes(query))
        : results,
    [results, query],
  );

  const visibleSelectableIds = useMemo(
    () => filteredResults.filter(isLabellingSelectable).map((r) => r.id),
    [filteredResults],
  );
  const allVisibleLabellingSelected =
    visibleSelectableIds.length > 0 &&
    visibleSelectableIds.every((id) => labellingSelection?.has(id));

  const labellingGroupKeys = new Set(["failed", "errored", "passed"]);

  const groups: StatusGroup[] = [
    { key: "failed", label: "Failed", dotColor: "bg-red-500", items: filteredResults.filter((r) => r.status === "failed" && !isErrored(r)) },
    { key: "errored", label: "Could not be run", dotColor: "bg-amber-500", items: filteredResults.filter((r) => isErrored(r)) },
    { key: "passed", label: "Passed", dotColor: "bg-green-500", items: filteredResults.filter((r) => r.status === "passed") },
    { key: "queued", label: "Queued", dotColor: "bg-gray-400", items: filteredResults.filter((r) => r.status === "queued") },
    { key: "running", label: "Running", dotColor: "bg-yellow-500 animate-pulse", items: filteredResults.filter((r) => r.status === "running") },
    { key: "not_run", label: "Not run", dotColor: "bg-gray-400", items: filteredResults.filter((r) => r.status === "not_run") },
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
      {/* Left Panel - Test List. The border between this and the middle
          panel comes from the resize handle below, not this div, so the
          hover state covers the whole divider. */}
      <div
        style={{ "--list-w": `${listPanel.width}px` } as React.CSSProperties}
        className={`w-full md:w-[var(--list-w)] flex flex-col overflow-hidden ${
          selectedId ? "hidden md:flex" : "flex"
        }`}
      >
        {/* Search */}
        <div className="shrink-0 border-b border-border p-3 space-y-2">
          <SearchInput
            value={searchQuery}
            onChange={setSearchQuery}
            placeholder="Search tests"
          />
          {showLabellingCheckboxes && onLabellingBulkToggle && visibleSelectableIds.length > 0 && (
            <button
              type="button"
              onClick={() => onLabellingBulkToggle(visibleSelectableIds)}
              className="hidden md:block text-xs text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
            >
              {allVisibleLabellingSelected ? "Deselect all" : "Select all"}
            </button>
          )}
        </div>
        <div
          ref={listContainerRef}
          data-tour="run-outputs-list"
          className="flex-1 overflow-y-auto"
        >
          {groups.length === 0 && query && (
            <div className="p-4 text-sm text-muted-foreground">
              No tests match &ldquo;{searchQuery}&rdquo;
            </div>
          )}
          {results.length === 0 && !query && (
            <div className="p-4 text-sm text-muted-foreground">
              {emptyMessage}
            </div>
          )}
          {groups.map((group) => {
            const groupSelectableIds = group.items
              .filter(isLabellingSelectable)
              .map((r) => r.id);
            const groupAllSelected =
              groupSelectableIds.length > 0 &&
              groupSelectableIds.every((id) => labellingSelection?.has(id));
            const showGroupSelectAll =
              showLabellingCheckboxes &&
              onLabellingBulkToggle &&
              labellingGroupKeys.has(group.key) &&
              groupSelectableIds.length > 0;

            return (
            <div key={group.key}>
              <div className="sticky top-0 z-10 bg-background border-b border-border flex items-center">
                <button
                  type="button"
                  onClick={() => toggleSection(group.key)}
                  className="flex-1 text-sm font-medium text-muted-foreground px-4 py-3 flex items-center gap-2 cursor-pointer hover:text-foreground transition-colors min-w-0"
                >
                  <svg
                    className={`w-3 h-3 text-muted-foreground transition-transform shrink-0 ${collapsedSections.has(group.key) ? "" : "rotate-90"}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                  </svg>
                  <div className={`w-2 h-2 rounded-full ${group.dotColor}`}></div>
                  <span className="truncate">{group.label} ({group.items.length})</span>
                </button>
                {showGroupSelectAll && (
                  <button
                    type="button"
                    onClick={() => onLabellingBulkToggle(groupSelectableIds)}
                    title={groupAllSelected ? `Deselect all ${group.label.toLowerCase()}` : `Select all ${group.label.toLowerCase()}`}
                    className="hidden md:block px-3 py-3 shrink-0 cursor-pointer"
                  >
                    <LabellingRowCheckbox checked={groupAllSelected} />
                  </button>
                )}
              </div>
              {!collapsedSections.has(group.key) && (
                <div className="space-y-1 px-4 py-2">
                  {group.items.map((result) => (
                    <div
                      key={result.id}
                      ref={selectedId === result.id ? selectedRowRef : undefined}
                      // ponytail: the browser skips style/layout/paint for rows
                      // off screen, but every row element is still created. 36px
                      // is a row's real height (py-2 = 8+8 around a 20px line).
                      // If element creation itself ever becomes the bottleneck,
                      // the upgrade is real windowing: render only the visible slice.
                      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg transition-colors [content-visibility:auto] [contain-intrinsic-size:auto_36px] ${
                        selectedId === result.id ? "bg-muted" : "hover:bg-muted/50"
                      }`}
                    >
                      {showLabellingCheckboxes &&
                        (isLabellingEligible(result) ? (
                          <button
                            type="button"
                            onClick={() => {
                              if (isLabellingSelectable(result)) {
                                onToggleLabellingSelection(result.id);
                              }
                            }}
                            disabled={!isLabellingSelectable(result)}
                            title={
                              isLabellingSelectable(result)
                                ? "Select for labelling"
                                : "Available once the test completes"
                            }
                            className="hidden md:block cursor-pointer disabled:cursor-not-allowed shrink-0"
                          >
                            <LabellingRowCheckbox
                              checked={
                                labellingSelection?.has(result.id) ?? false
                              }
                              disabled={!isLabellingSelectable(result)}
                            />
                          </button>
                        ) : (
                          // Keeps every row's name starting at the same place
                          // when only some of the run's tests are tickable.
                          <span className="hidden md:block w-5 shrink-0" />
                        ))}
                      <button
                        type="button"
                        data-tour="run-result-row"
                        onClick={() => onSelect(result.id)}
                        className="flex-1 flex items-center gap-2 min-w-0 cursor-pointer text-left"
                      >
                        <StatusIcon
                          status={
                            isErrored(result)
                              ? "error"
                              : result.status === "not_run"
                                ? "queued"
                                : result.status
                          }
                        />
                        <span className="text-sm text-foreground truncate">{result.name}</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            );
          })}
        </div>
      </div>

      <ResizeHandle onMouseDown={listPanel.startDrag} label="Resize test list" />

      {/* Middle Panel - Test Details */}
      <div
        data-tour="run-result-detail"
        className={`flex-1 min-w-0 ${selectedId ? "flex" : "hidden md:flex"} flex-col overflow-hidden`}
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
        <>
          <ResizeHandle
            onMouseDown={verdictPanel.startDrag}
            label="Resize evaluators panel"
          />
          <div
            data-tour="run-result-verdict"
            style={
              { "--verdict-w": `${verdictPanel.width}px` } as React.CSSProperties
            }
            className="hidden md:flex w-[var(--verdict-w)] flex-col overflow-hidden"
          >
          <div className="flex-1 overflow-y-auto">
            <EvaluationCriteriaPanel
              testName={selectedResult.name}
              evaluation={selectedResult.testCase?.evaluation}
              inputs={selectedResult.inputs}
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
        </>
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

  if (result.status === "not_run") {
    return (
      <div className="flex items-center justify-center h-full p-6">
        <p className="text-muted-foreground text-center">
          This test was not run. The run was stopped before it got here.
        </p>
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

  if (isUnanswered(result)) {
    return <TestCouldNotRunNotice reason={result.reasoning} />;
  }

  return (
    <SharedTestDetailView
      history={result.testCase?.history || []}
      input={result.testCase?.input}
      output={result.output}
      passed={result.status === "passed"}
      reasoning={result.reasoning}
      evaluation={result.testCase?.evaluation}
      judgeResults={result.judgeResults}
      evaluatorsByUuid={evaluatorsByUuid}
      enableEvaluatorLinks={enableEvaluatorLinks}
      legacyDefaultEvaluator={legacyDefaultEvaluator}
    />
  );
}
