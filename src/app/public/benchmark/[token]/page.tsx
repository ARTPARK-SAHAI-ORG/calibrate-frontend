"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  PublicPageLayout,
  PublicNotFound,
  PublicLoading,
} from "@/components/PublicPageLayout";
import {
  BenchmarkResultView,
  benchmarkCsvRows,
  evaluatorsByUuid,
  type BenchmarkCaseDetail,
  type BenchmarkModelRows,
  type BenchmarkTabId,
} from "@/components/eval-details/BenchmarkResultView";
import type { TestRunEvaluator } from "@/components/test-results/shared";
import type { BenchmarkLeaderboardSummaryRow } from "@/lib/benchmarkEvaluatorSummary";
import { ExportResultsButton } from "@/components/ExportResultsButton";
import { StoppedRunPill } from "@/components/ui";
import { isRunStopped, modelComparisonName } from "@/lib/testTypes";
import { buildBenchmarkCsv } from "@/lib/exportTestResults";

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
  const [activeTab, setActiveTab] = useState<BenchmarkTabId>("summary");

  useEffect(() => {
    document.title = "LLM benchmark | Calibrate";
  }, []);

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

        if (res.status === 404) {
          setNotFound(true);
          return;
        }
        if (!res.ok) throw new Error("Failed to load results");

        const result: BenchmarkStatusResponse = await res.json();
        if (result.status !== "done" && result.status !== "completed") {
          setNotFound(true);
          return;
        }

        setData(result);
      } catch {
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [token]);

  if (isLoading)
    return (
      <PublicPageLayout>
        <PublicLoading />
      </PublicPageLayout>
    );
  if (notFound || !data)
    return (
      <PublicPageLayout>
        <PublicNotFound />
      </PublicPageLayout>
    );

  const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;

  /** One test read in full, for the model whose answer is on screen. */
  const fetchCase = async (
    testUuid: string,
    model: string,
  ): Promise<BenchmarkCaseDetail> => {
    const res = await fetch(
      `${backendUrl}/public/benchmark/${token}/results/${testUuid}?model=${encodeURIComponent(model)}`,
      { headers: { accept: "application/json" } },
    );
    if (!res.ok) throw new Error("Failed to load the test case");
    return res.json();
  };

  /**
   * The whole comparison, with every case's conversation, reply and judge
   * reasoning. Only read when someone downloads the results, which need every
   * row; the page itself runs on the light reply.
   */
  const fetchFullModelResults = async (): Promise<BenchmarkModelRows[]> => {
    const res = await fetch(`${backendUrl}/public/benchmark/${token}`, {
      headers: { accept: "application/json" },
    });
    if (!res.ok) throw new Error("Failed to fetch the model comparison");
    const result: BenchmarkStatusResponse = await res.json();
    return result.model_results ?? [];
  };

  return (
    <PublicPageLayout
      title={data.name ? modelComparisonName(data.name) : "LLM benchmark"}
      pills={isRunStopped(data) ? <StoppedRunPill /> : undefined}
      contentClassName="max-w-[92rem]"
    >
      <div className="space-y-4 md:space-y-6">
        <BenchmarkResultView
          surface="public"
          isDone
          modelResults={data.model_results ?? []}
          leaderboardSummary={data.leaderboard_summary}
          evaluators={data.evaluators}
          runStopped={isRunStopped(data)}
          activeTab={activeTab}
          onTabChange={setActiveTab}
          fetchCase={fetchCase}
          filenameKey={token}
          tabsRight={
            data.model_results && data.model_results.length > 0 ? (
              <ExportResultsButton
                filename={`benchmark-${token}`}
                getRows={async () =>
                  buildBenchmarkCsv(
                    benchmarkCsvRows(await fetchFullModelResults()),
                    evaluatorsByUuid(data.evaluators),
                  )
                }
              />
            ) : undefined
          }
        />
      </div>
    </PublicPageLayout>
  );
}
