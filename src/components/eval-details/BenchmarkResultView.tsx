"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  BenchmarkCombinedLeaderboard,
  BenchmarkOutputsPanel,
  BenchmarkTopPicks,
  BenchmarkWeightedRanking,
  LLMEvaluationAbout,
  evaluatorColumnsToAbout,
  type BenchmarkModelResult,
  type BenchmarkTestResult,
} from "@/components/eval-details";
import {
  ResultPager,
  type JudgeResult,
  type PagerNav,
  type TestCaseData,
  type TestCaseOutput,
  type TestRunEvaluator,
} from "@/components/test-results/shared";
import { ResultTabs } from "@/components/ui";
import {
  buildBenchmarkCombinedLeaderboardPayload,
  hasBenchmarkTopPicks,
  type BenchmarkLeaderboardSummaryRow,
} from "@/lib/benchmarkEvaluatorSummary";
import type { DefaultEvaluatorSummary } from "@/lib/defaultEvaluators";
import { reportError } from "@/lib/reportError";
import { rowTestUuid } from "@/lib/testRunSummary";

/** One test's row in a model comparison, as the light reply sends it: the
 * conversation, the reply and the judges' reasoning are left out, and
 * `test_case_id` / `test_uuid` are there to read that one case in full while
 * `test_type` says what kind of test it was. */
export type BenchmarkRow = BenchmarkTestResult & {
  test_case_id?: string;
  test_uuid?: string | null;
  test_type?: string | null;
};

export type BenchmarkModelRows = Omit<BenchmarkModelResult, "test_results"> & {
  test_results: BenchmarkRow[] | null;
};

/** One test read in full: what the light reply left out. */
export type BenchmarkCaseDetail = {
  test_case?: TestCaseData | null;
  output?: TestCaseOutput | null;
  judge_results?: JudgeResult[] | null;
  inputs?: Record<string, unknown> | null;
};

export type BenchmarkTabId = "summary" | "top-picks" | "tests" | "about";

/** What the leaderboard calls a model's score. */
export const BENCHMARK_SCORE_LABEL = "Test pass rate (%)";

/** A model's name as a reader should see it. The backend sends it with its
 * slash already; a run whose name was recovered from a folder can carry "__"
 * where the slash was, and this is what both surfaces put right. */
export function formatBenchmarkModelName(name: string): string {
  return name.replace(/__/g, "/");
}

/**
 * The rows the results file is built from: every model's tests, flattened,
 * with the conversation, the reply and the judges' reasoning each case was
 * read with. Both surfaces download the same file, so they build it here.
 */
export function benchmarkCsvRows(models: BenchmarkModelRows[]) {
  return models.flatMap((m) =>
    (m.test_results ?? []).map((tr) => ({
      model: m.model,
      name: tr.name,
      passed: tr.passed,
      reasoning: tr.reasoning,
      output: tr.output,
      testCase: tr.test_case,
      judgeResults: tr.judge_results,
    })),
  );
}

/** The evaluators of a run, keyed by uuid, as every panel wants them. */
export function evaluatorsByUuid(
  evaluators: TestRunEvaluator[] | undefined,
): Record<string, TestRunEvaluator> {
  return Object.fromEntries((evaluators ?? []).map((e) => [e.uuid, e]));
}

/**
 * Put the kind of test back where the panels and the labelling helpers look
 * for it. They read it off the test's own config, which the light reply leaves
 * out; the row itself says so in `test_type`. Rows that already carry the test
 * are left alone.
 */
export function withRowTestType(row: BenchmarkRow): BenchmarkRow {
  return row.test_case || !row.test_type
    ? row
    : { ...row, test_case: { evaluation: { type: row.test_type } } };
}

export function withTestType(
  models: BenchmarkModelRows[],
): BenchmarkModelRows[] {
  return models.map((model) => ({
    ...model,
    test_results: model.test_results?.map(withRowTestType) ?? null,
  }));
}

function sanitiseFilename(text: string): string {
  return text.replace(/[^a-zA-Z0-9_-]/g, "_");
}

type BenchmarkResultViewProps = {
  /** "window" is the signed-in run window, "public" the shared link. */
  surface: "window" | "public";
  /** The run's rows. The window includes its placeholders for models that
   * have not answered yet. */
  modelResults: BenchmarkModelRows[];
  leaderboardSummary?: BenchmarkLeaderboardSummaryRow[];
  /** Top-level per-evaluator metadata from the run. */
  evaluators?: TestRunEvaluator[];
  /** The run has finished. The window draws the tests while it is still
   * going, with no tabs above them. */
  isDone: boolean;
  /** Someone stopped the run before it finished. */
  runStopped?: boolean;
  activeTab: BenchmarkTabId;
  onTabChange: (tab: BenchmarkTabId) => void;
  /** Reads one test in full, for one model. The window and the shared link
   * read it from different addresses. */
  fetchCase: (testUuid: string, model: string) => Promise<BenchmarkCaseDetail>;
  /** Names the files the charts and tables download. */
  filenameKey: string;
  /** Names to show for tests that have not answered yet (the window only). */
  testNames?: string[];
  /** The default correctness evaluator legacy runs are judged against.
   * Reading it needs signing in, so the shared link has none. */
  legacyDefaultEvaluator?: DefaultEvaluatorSummary | null;
  /** The tests picked for labelling. The shared link cannot label. */
  labellingSelection?: Set<string>;
  onToggleLabellingSelection?: (key: string) => void;
  onLabellingBulkToggle?: (ids: string[]) => void;
  /** Reports which test is open so the window can draw the Previous/Next
   * pager in its own header. The shared link draws it in the tab row. */
  onNavChange?: (nav: PagerNav) => void;
  /** Sits at the right of the tab row (the shared link's download button). */
  tabsRight?: React.ReactNode;
};

/**
 * A finished model comparison, drawn as its tabs. The signed-in run window and
 * the shared link both render this, so a change to what a tab holds lands on
 * both at once. Everything only the window has — the name and its pencil,
 * rerun, stop, sharing, submitting for labelling — stays in the window and
 * arrives here as an opt-in prop.
 */
export function BenchmarkResultView({
  surface,
  modelResults,
  leaderboardSummary,
  evaluators,
  isDone,
  runStopped = false,
  activeTab,
  onTabChange,
  fetchCase,
  filenameKey,
  testNames,
  legacyDefaultEvaluator,
  labellingSelection,
  onToggleLabellingSelection,
  onLabellingBulkToggle,
  onNavChange,
  tabsRight,
}: BenchmarkResultViewProps) {
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());
  const [selectedTest, setSelectedTest] = useState<{
    model: string;
    testIndex: number;
  } | null>(null);
  const [nav, setNav] = useState<PagerNav | null>(null);
  /** Cases read in full, keyed by model and test, because the same test has a
   * different answer for every model. `null` means the read failed, so it is
   * not asked for again and what the light reply gave is kept. */
  const [openCases, setOpenCases] = useState<
    Record<string, BenchmarkCaseDetail | null>
  >({});
  /** The `model|test` whose answer is being read, so the detail pane can say
   * so. The row keeps its own verdict, so it stays in its group. */
  const [loadingCaseKey, setLoadingCaseKey] = useState<string | null>(null);

  // Read through a ref so a caller that builds the function inline does not
  // make the effect below fetch the same case again on every render.
  const fetchCaseRef = useRef(fetchCase);
  useEffect(() => {
    fetchCaseRef.current = fetchCase;
  });

  // The rows as the panels draw them: a test already read filled in from its
  // own read, the one being read marked as loading, and the kind of test put
  // back where the panel looks for it (on the test's own config, which the
  // light reply leaves out).
  const rows: BenchmarkModelRows[] = useMemo(
    () =>
      modelResults.map((model) => ({
        ...model,
        test_results:
          model.test_results?.map((row) => {
            const uuid = rowTestUuid(row);
            const key = uuid ? `${model.model}|${uuid}` : null;
            const full = key ? openCases[key] : null;
            const merged: BenchmarkRow = full
              ? {
                  ...row,
                  test_case: full.test_case ?? row.test_case,
                  output: full.output ?? undefined,
                  judge_results: full.judge_results,
                  inputs: full.inputs ?? undefined,
                }
              : { ...row, loading: key !== null && key === loadingCaseKey };
            return withRowTestType(merged);
          }) ?? null,
      })),
    [modelResults, openCases, loadingCaseKey],
  );

  const firstModelWithResults =
    rows.find((m) => m.test_results && m.test_results.length > 0)?.model ??
    null;
  const firstModel = rows[0]?.model ?? null;

  // Open the first model, once. Until a model has answered there is only the
  // first one to open, which is what the run window shows while it waits.
  const hasOpenedModelRef = useRef(false);
  useEffect(() => {
    if (hasOpenedModelRef.current) return;
    const model = firstModelWithResults ?? firstModel;
    if (!model) return;
    hasOpenedModelRef.current = true;
    setExpandedModels(new Set([model]));
  }, [firstModelWithResults, firstModel]);

  // Land on the first test that has an answer, once, rather than on an empty
  // pane. Pinned so a model answering later does not move the reader.
  const hasSelectedTestRef = useRef(false);
  useEffect(() => {
    if (hasSelectedTestRef.current) return;
    const model = firstModelWithResults;
    if (!model) return;
    hasSelectedTestRef.current = true;
    setSelectedTest({ model, testIndex: 0 });
    setExpandedModels((prev) => new Set(prev).add(model));
  }, [firstModelWithResults]);

  // Read the open test in full — its conversation, the model's reply and each
  // judge's reasoning. The light reply leaves all of that out. A read that
  // fails is remembered as failed, so it is not asked for again and what was
  // already on screen stays.
  const openModel = selectedTest?.model ?? null;
  const openTestUuid = selectedTest
    ? (() => {
        const row = modelResults.find((m) => m.model === selectedTest.model)
          ?.test_results?.[selectedTest.testIndex];
        return row ? rowTestUuid(row) : null;
      })()
    : null;
  useEffect(() => {
    if (!openModel || !openTestUuid) return;
    const key = `${openModel}|${openTestUuid}`;
    // Already read: clear the mark rather than returning under it, or moving
    // to a test already read would leave the previous one marked for good.
    if (key in openCases) {
      setLoadingCaseKey(null);
      return;
    }

    let cancelled = false;
    setLoadingCaseKey(key);
    // Started off a resolved promise so a reader that cannot even ask (no
    // backend address) is reported like any other failed read.
    Promise.resolve()
      .then(() => fetchCaseRef.current(openTestUuid, openModel))
      .then((testCase) => {
        if (!cancelled) setOpenCases((prev) => ({ ...prev, [key]: testCase }));
      })
      .catch((err) => {
        reportError("Error loading the test case:", err);
        if (!cancelled) setOpenCases((prev) => ({ ...prev, [key]: null }));
      })
      .finally(() => {
        if (!cancelled) setLoadingCaseKey(null);
      });
    return () => {
      cancelled = true;
    };
  }, [openModel, openTestUuid, openCases]);

  // The list of tests re-reports its navigation whenever this callback's
  // identity changes, so it has to stay the same across renders.
  const onNavChangeRef = useRef(onNavChange);
  useEffect(() => {
    onNavChangeRef.current = onNavChange;
  });
  const handleNavChange = useCallback((next: PagerNav) => {
    setNav(next);
    onNavChangeRef.current?.(next);
  }, []);

  // Only offer the Model selection tab when there is cost + pass-rate data to
  // plot.
  const showTopPicks = hasBenchmarkTopPicks(
    leaderboardSummary,
    modelResults,
    BENCHMARK_SCORE_LABEL,
  );
  const tabs: BenchmarkTabId[] = [
    "summary",
    ...(showTopPicks ? (["top-picks"] as const) : []),
    "tests",
    "about",
  ];

  // Which metrics the About tab explains (built only while it is showing, so
  // the scan does not run on every poll). Shares the leaderboard's builder.
  const aboutPlan =
    isDone && activeTab === "about"
      ? (buildBenchmarkCombinedLeaderboardPayload(
          leaderboardSummary,
          modelResults,
          BENCHMARK_SCORE_LABEL,
        )?.plan ?? null)
      : null;

  const toggleModel = (model: string) => {
    setExpandedModels((prev) => {
      const next = new Set(prev);
      if (next.has(model)) next.delete(model);
      else next.add(model);
      return next;
    });
  };

  const filename = sanitiseFilename(filenameKey);

  const leaderboard = (
    <BenchmarkCombinedLeaderboard
      leaderboardSummary={leaderboardSummary}
      modelResults={modelResults}
      filename={`benchmark-leaderboard-${filename}`}
      benchmarkScoreLabel={BENCHMARK_SCORE_LABEL}
      onReviewUnanswered={() => onTabChange("tests")}
      runStopped={runStopped}
    />
  );

  const about = (
    <LLMEvaluationAbout
      showToolCalls={!!aboutPlan?.showToolCallPassRate}
      showLatency={!!aboutPlan?.showLatency}
      showCost={!!aboutPlan?.showCost}
      showTokens={!!aboutPlan?.showTokens}
      evaluators={evaluatorColumnsToAbout(aboutPlan?.evaluators)}
    />
  );

  const topPicks = (
    <>
      <BenchmarkWeightedRanking
        leaderboardSummary={leaderboardSummary}
        modelResults={modelResults}
        benchmarkScoreLabel={BENCHMARK_SCORE_LABEL}
      />
      <BenchmarkTopPicks
        leaderboardSummary={leaderboardSummary}
        modelResults={modelResults}
        filename={`benchmark-top-picks-${filename}`}
        benchmarkScoreLabel={BENCHMARK_SCORE_LABEL}
      />
    </>
  );

  const outputs = (
    <BenchmarkOutputsPanel
      runStopped={runStopped}
      modelResults={rows}
      expandedModels={expandedModels}
      onToggleModel={toggleModel}
      onSetExpandedModels={setExpandedModels}
      selectedTest={selectedTest}
      onSelectTest={(model, testIndex) => setSelectedTest({ model, testIndex })}
      onClearSelection={() => setSelectedTest(null)}
      onNavChange={handleNavChange}
      testNames={testNames}
      formatModelName={formatBenchmarkModelName}
      showControls={isDone}
      showRunningSpinner={surface === "window"}
      evaluatorsByUuid={evaluatorsByUuid(evaluators)}
      enableEvaluatorLinks={surface === "window"}
      legacyDefaultEvaluator={legacyDefaultEvaluator}
      labellingSelection={labellingSelection}
      onToggleLabellingSelection={onToggleLabellingSelection}
      onLabellingBulkToggle={onLabellingBulkToggle}
    />
  );

  if (surface === "window") {
    return (
      <>
        {isDone && (
          <div className="border-b border-border -mx-4 md:mx-0 px-4 md:px-6 pt-2 overflow-x-auto hide-scrollbar">
            <div className="flex gap-3 md:gap-4 lg:gap-6">
              <ResultTabs
                tabs={tabs}
                activeTab={activeTab}
                onChange={onTabChange}
                size="window"
              />
            </div>
          </div>
        )}
        <div className="flex-1 overflow-hidden">
          {isDone && activeTab === "summary" && (
            <div className="p-4 md:p-6 space-y-4 md:space-y-6 overflow-y-auto h-full">
              {leaderboard}
            </div>
          )}
          {isDone && activeTab === "about" && (
            <div className="p-4 md:p-6 overflow-y-auto h-full">{about}</div>
          )}
          {isDone && showTopPicks && activeTab === "top-picks" && (
            <div className="p-4 md:p-6 space-y-6 md:space-y-8 overflow-y-auto h-full">
              {topPicks}
            </div>
          )}
          {(!isDone || activeTab === "tests") && outputs}
        </div>
      </>
    );
  }

  return (
    <>
      <div className="relative flex items-end justify-between gap-2 border-b border-border">
        <div className="flex gap-2">
          <ResultTabs tabs={tabs} activeTab={activeTab} onChange={onTabChange} />
        </div>
        {activeTab === "tests" && nav && nav.currentIndex >= 0 && (
          <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
            <ResultPager
              currentIndex={nav.currentIndex}
              total={nav.total}
              onPrev={nav.goPrev}
              onNext={nav.goNext}
            />
          </div>
        )}
        {tabsRight && <div className="pb-2">{tabsRight}</div>}
      </div>

      {activeTab === "summary" && leaderboard}
      {activeTab === "about" && about}
      {activeTab === "top-picks" && showTopPicks && (
        <div className="space-y-6 md:space-y-8">{topPicks}</div>
      )}
      {activeTab === "tests" && rows.length > 0 && (
        <div
          className="border border-border rounded-xl overflow-hidden"
          style={{ height: "calc(100vh - 220px)", minHeight: 620 }}
        >
          {outputs}
        </div>
      )}
    </>
  );
}
