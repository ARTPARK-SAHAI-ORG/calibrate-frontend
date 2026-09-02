"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { PublicPageLayout, PublicNotFound, PublicLoading } from "@/components/PublicPageLayout";
import {
  BenchmarkCombinedLeaderboard,
  BenchmarkTopPicks,
  BenchmarkWeightedRanking,
  BenchmarkOutputsPanel,
  LLMEvaluationAbout,
  evaluatorColumnsToAbout,
} from "@/components/eval-details";
import type {
  BenchmarkModelResult,
  BenchmarkTestResult,
} from "@/components/eval-details";
import { reportError } from "@/lib/reportError";
import { rowTestUuid } from "@/lib/testRunSummary";
import {
  buildBenchmarkCombinedLeaderboardPayload,
  hasBenchmarkTopPicks,
  type BenchmarkLeaderboardSummaryRow,
} from "@/lib/benchmarkEvaluatorSummary";
import { ResultPager, type TestRunEvaluator, type PagerNav } from "@/components/test-results/shared";
import { ExportResultsButton } from "@/components/ExportResultsButton";
import { StoppedRunPill } from "@/components/ui";
import { isRunStopped, modelComparisonName } from "@/lib/testTypes";
import { ResultTabs } from "@/components/ui";
import { buildBenchmarkCsv } from "@/lib/exportTestResults";

/** One test's row as the light reply sends it: the conversation, the reply and
 * the judges' reasoning are left out, and `test_case_id` is there to read that
 * one case in full. */
type BenchmarkRow = BenchmarkTestResult & {
  test_case_id?: string;
  /** The uuid of the test this row ran. Absent on a run answered before the
   * backend started stamping it, which is why `rowTestUuid` falls back. */
  test_uuid?: string | null;
};

type BenchmarkModelRows = Omit<BenchmarkModelResult, "test_results"> & {
  test_results: BenchmarkRow[] | null;
};

type BenchmarkStatusResponse = {
  task_id: string;
  status: string;
  /** What the run is called. Absent on a backend that predates naming. */
  name?: string | null;
  model_results?: BenchmarkModelRows[];
  leaderboard_summary?: BenchmarkLeaderboardSummaryRow[];
  /** Top-level per-evaluator metadata block — see TestRunEvaluator. */
  evaluators?: TestRunEvaluator[];
  error?: string;
  /** True when someone stopped the run before it finished. */
  aborted?: boolean;
};

export default function PublicBenchmarkPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<BenchmarkStatusResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<
    "summary" | "top-picks" | "tests" | "about"
  >("summary");
  const [expandedModels, setExpandedModels] = useState<Set<string>>(new Set());
  const [selectedTest, setSelectedTest] = useState<{ model: string; testIndex: number } | null>(null);
  const [nav, setNav] = useState<PagerNav | null>(null);
  /** Cases read in full, keyed by model and test, because the same test has a
   * different answer for every model. `null` means the read failed, so it is
   * not asked for again and the page keeps what the light reply gave it. */
  const [openCases, setOpenCases] = useState<Record<string, BenchmarkRow | null>>({});
  /** The `model|test` whose answer is being read, so the detail pane can say
   * so. The row keeps its own verdict, so it stays in its group. */
  const [loadingCaseKey, setLoadingCaseKey] = useState<string | null>(null);

  useEffect(() => { document.title = "LLM benchmark | Calibrate"; }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) throw new Error("Backend URL not configured");

        // The light reply: every test's name and verdict, without the
        // conversation, the reply and the judges' reasoning behind them. One
        // case is read in full when the reader opens it.
        const res = await fetch(
          `${backendUrl}/public/benchmark/${token}?mode=summary`,
          { headers: { accept: "application/json" } },
        );

        if (res.status === 404) { setNotFound(true); return; }
        if (!res.ok) throw new Error("Failed to load results");

        const result: BenchmarkStatusResponse = await res.json();
        if (result.status !== "done" && result.status !== "completed") { setNotFound(true); return; }

        setData(result);
        if (result.model_results?.length) {
          setExpandedModels(new Set([result.model_results[0].model]));
        }
      } catch {
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [token]);

  // Read the open test in full — its conversation, the model's reply and each
  // judge's reasoning — for the model whose answer is on screen. The light
  // reply the page runs on leaves all of that out. A read that fails is
  // remembered as failed, so it is not asked for again and the page keeps
  // showing what it already had.
  useEffect(() => {
    const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
    if (!selectedTest || !backendUrl) return;
    const row = data?.model_results?.find((m) => m.model === selectedTest.model)
      ?.test_results?.[selectedTest.testIndex];
    const testCaseId = row ? rowTestUuid(row) : null;
    if (!testCaseId) return;
    const key = `${selectedTest.model}|${testCaseId}`;
    // Already read: clear the mark rather than returning under it, or moving
    // to a test already read would leave the previous one marked for good.
    if (key in openCases) {
      setLoadingCaseKey(null);
      return;
    }

    let cancelled = false;
    setLoadingCaseKey(key);
    fetch(
      `${backendUrl}/public/benchmark/${token}/results/${testCaseId}?model=${encodeURIComponent(selectedTest.model)}`,
      { headers: { accept: "application/json" } },
    )
      .then((res) => {
        if (!res.ok) throw new Error("Failed to load the test case");
        return res.json();
      })
      .then((testCase: BenchmarkRow) => {
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
  }, [selectedTest, data, token, openCases]);

  // The rows as the panel draws them: a test already read filled in from its
  // own read, the one being read marked as loading. Without this the answer
  // was fetched and never shown.
  const modelResultsToDisplay: BenchmarkModelRows[] = useMemo(
    () =>
      (data?.model_results ?? []).map((model) => ({
        ...model,
        test_results:
          model.test_results?.map((row) => {
            const uuid = rowTestUuid(row);
            const key = uuid ? `${model.model}|${uuid}` : null;
            const full = key ? openCases[key] : null;
            return full
              ? { ...row, ...full }
              : { ...row, loading: key !== null && key === loadingCaseKey };
          }) ?? null,
      })),
    [data, openCases, loadingCaseKey],
  );

  if (isLoading) return <PublicPageLayout><PublicLoading /></PublicPageLayout>;
  if (notFound || !data) return <PublicPageLayout><PublicNotFound /></PublicPageLayout>;

  const benchmarkScoreLabel = "Test pass rate (%)";
  // Only offer the Top picks tab when there is cost + pass-rate data to plot.
  const showTopPicks = hasBenchmarkTopPicks(
    data.leaderboard_summary,
    data.model_results ?? [],
    benchmarkScoreLabel,
  );
  const tabs: ("summary" | "top-picks" | "tests" | "about")[] = [
    "summary",
    ...(showTopPicks ? (["top-picks"] as const) : []),
    "tests",
    "about",
  ];

  // Metric-presence plan for the About tab (only built when it's showing).
  const aboutPlan =
    activeTab === "about"
      ? (buildBenchmarkCombinedLeaderboardPayload(
          data.leaderboard_summary,
          data.model_results ?? [],
          benchmarkScoreLabel,
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

  return (
    <PublicPageLayout
      title={data.name ? modelComparisonName(data.name) : "LLM benchmark"}
      pills={isRunStopped(data) ? <StoppedRunPill /> : undefined}
      contentClassName="max-w-[92rem]"
    >
      <div className="space-y-4 md:space-y-6">
        {/* Tab nav */}
        <div className="relative flex items-end justify-between gap-2 border-b border-border">
          <div className="flex gap-2">
            <ResultTabs
              tabs={tabs}
              activeTab={activeTab}
              onChange={setActiveTab}
            />
          </div>
          {activeTab === "tests" && nav && selectedTest && (
            <div className="hidden md:flex absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
              <ResultPager
                currentIndex={nav.currentIndex}
                total={nav.total}
                onPrev={nav.goPrev}
                onNext={nav.goNext}
              />
            </div>
          )}
          {data.model_results && data.model_results.length > 0 && (
            <div className="pb-2">
              <ExportResultsButton
                filename={`benchmark-${token}`}
                getRows={() =>
                  buildBenchmarkCsv(
                    (data.model_results ?? []).flatMap((m) =>
                      (m.test_results ?? []).map((tr) => ({
                        model: m.model,
                        name: tr.name,
                        passed: tr.passed,
                        reasoning: tr.reasoning,
                        output: tr.output,
                        testCase: tr.test_case,
                        judgeResults: tr.judge_results,
                      })),
                    ),
                    Object.fromEntries(
                      (data.evaluators ?? []).map((e) => [e.uuid, e]),
                    ),
                  )
                }
              />
            </div>
          )}
        </div>

        {/* Results tab */}
        {activeTab === "summary" && (
          <BenchmarkCombinedLeaderboard
            leaderboardSummary={data.leaderboard_summary}
            modelResults={data.model_results ?? []}
            filename={`benchmark-leaderboard-${token.replace(/[^a-zA-Z0-9_-]/g, "_")}`}
            benchmarkScoreLabel={benchmarkScoreLabel}
            onReviewUnanswered={() => setActiveTab("tests")}
            runStopped={isRunStopped(data)}
          />
        )}

        {/* About Tab — explains the metrics (latency is p50, cost/tokens mean). */}
        {activeTab === "about" && (
          <LLMEvaluationAbout
            showToolCalls={!!aboutPlan?.showToolCallPassRate}
            showLatency={!!aboutPlan?.showLatency}
            showCost={!!aboutPlan?.showCost}
            showTokens={!!aboutPlan?.showTokens}
            evaluators={evaluatorColumnsToAbout(aboutPlan?.evaluators)}
          />
        )}

        {/* Top Picks Tab */}
        {activeTab === "top-picks" && showTopPicks && (
          <div className="space-y-6 md:space-y-8">
            <BenchmarkWeightedRanking
              leaderboardSummary={data.leaderboard_summary}
              modelResults={data.model_results ?? []}
              benchmarkScoreLabel={benchmarkScoreLabel}
            />
            <BenchmarkTopPicks
              leaderboardSummary={data.leaderboard_summary}
              modelResults={data.model_results ?? []}
              filename={`benchmark-leaderboard-${token.replace(/[^a-zA-Z0-9_-]/g, "_")}`}
              benchmarkScoreLabel={benchmarkScoreLabel}
            />
          </div>
        )}

        {/* Results Tab */}
        {activeTab === "tests" && data.model_results && data.model_results.length > 0 && (
          <div className="border border-border rounded-xl overflow-hidden" style={{ height: "calc(100vh - 220px)", minHeight: 620 }}>
            <BenchmarkOutputsPanel
              runStopped={isRunStopped(data)}
              modelResults={modelResultsToDisplay}
              expandedModels={expandedModels}
              onToggleModel={toggleModel}
              onSetExpandedModels={setExpandedModels}
              selectedTest={selectedTest}
              onSelectTest={(model, testIndex) => setSelectedTest({ model, testIndex })}
              onClearSelection={() => setSelectedTest(null)}
              onNavChange={setNav}
              showControls={true}
              evaluatorsByUuid={Object.fromEntries(
                (data.evaluators ?? []).map((e) => [e.uuid, e]),
              )}
              enableEvaluatorLinks={false}
            />
          </div>
        )}
      </div>
    </PublicPageLayout>
  );
}
