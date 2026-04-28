"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { sttProviders } from "@/components/agent-tabs/constants/providers";
import { PublicPageLayout, PublicNotFound, PublicLoading } from "@/components/PublicPageLayout";
import {
  ProviderSidebar,
  ProviderMetricsCard,
  STTResultsTable,
  LeaderboardTab,
  AboutMetricsTable,
  type STTEvaluatorColumn,
  type ChartConfig,
} from "@/components/eval-details";

// Mirrors the auth STT page: the response now optionally carries
// `evaluator_runs` per provider with the live evaluator `name`, stable
// `evaluator_uuid`, the artefact `metric_key` (== per-row CSV column with no
// `_score` suffix) and an `aggregate` block (`type`, `mean`, optional
// `scale_min` / `scale_max`). Older shareable links still ship the flat
// `llm_judge_score` scheme — both paths are handled below.
type EvaluatorRunAggregate = {
  type?: "binary" | "rating" | string;
  mean?: number;
  scale_min?: number;
  scale_max?: number;
  [k: string]: unknown;
};

type EvaluatorRun = {
  evaluator_uuid: string;
  metric_key: string;
  aggregate?: EvaluatorRunAggregate | null;
  name?: string;
};

type ProviderMetrics = {
  wer?: number;
  string_similarity?: number;
  llm_judge_score?: number;
  [k: string]:
    | number
    | { type?: string; mean?: number; scale_min?: number; scale_max?: number }
    | undefined;
};

type ProviderResult = {
  provider: string;
  success: boolean;
  message: string;
  metrics: ProviderMetrics;
  results: Array<{
    id: string;
    gt: string;
    pred: string;
    wer: string;
    string_similarity?: string;
    llm_judge_score?: string;
    llm_judge_reasoning?: string;
    [k: string]: unknown;
  }>;
  evaluator_runs?: EvaluatorRun[] | null;
};

type LeaderboardSummary = {
  run: string;
  count: number;
  wer?: number;
  string_similarity?: number;
  llm_judge_score?: number;
  [k: string]: string | number | undefined;
};

type EvaluationResult = {
  task_id: string;
  status: "queued" | "in_progress" | "done" | "failed";
  language?: string;
  provider_results?: ProviderResult[];
  leaderboard_summary?: LeaderboardSummary[];
  error?: string | null;
};

const getProviderLabel = (value: string): string => {
  const provider = sttProviders.find((p) => p.value === value);
  return provider ? provider.label : value;
};

const STT_ABOUT_METRICS = [
  { metric: "WER", description: "Word error rate measures the percentage of words that differ between reference and predicted transcription.", preference: "Lower is better", range: "0 - \u221E" },
  { metric: "String Similarity", description: "Measures similarity between reference and predicted strings using string matching algorithms.", preference: "Higher is better", range: "0 - 1" },
  { metric: "LLM Judge", description: "Evaluates semantic equivalence rather than exact string matching, returning Pass if the transcription is semantically correct.", preference: "Pass is better", range: "Pass / Fail" },
  { metric: "TTFB", description: "Time to first byte measures the latency from when a request is sent until the first byte of the response is received.", preference: "Lower is better", range: "0 - \u221E" },
  { metric: "Processing Time", description: "Total time taken to process the audio and generate the transcription.", preference: "Lower is better", range: "0 - \u221E" },
];

export default function PublicSTTPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<EvaluationResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<"leaderboard" | "outputs" | "about">("leaderboard");
  const [activeProviderTab, setActiveProviderTab] = useState<string | null>(null);

  useEffect(() => { document.title = "Speech-to-text evaluation | Calibrate"; }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) throw new Error("Backend URL not configured");

        const res = await fetch(`${backendUrl}/public/stt/${token}`, {
          headers: { accept: "application/json", "ngrok-skip-browser-warning": "true" },
        });

        if (res.status === 404) { setNotFound(true); return; }
        if (!res.ok) throw new Error("Failed to load results");

        const result: EvaluationResult = await res.json();
        if (result.status !== "done") { setNotFound(true); return; }

        setData(result);
        if (result.provider_results?.length) {
          setActiveProviderTab(result.provider_results[0].provider);
        }
      } catch {
        setNotFound(true);
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, [token]);

  // Derive the per-evaluator columns. Prefers `evaluator_runs` (new format)
  // and falls back to a single legacy `llm_judge_*` column when the
  // response is from an older job. Public pages don't have access to the
  // user's evaluator catalogue, so for legacy jobs the column header keeps
  // the historical "LLM Judge" label rather than trying to look up a
  // default evaluator name.
  const evaluatorColumns: STTEvaluatorColumn[] = useMemo(() => {
    const providerResults = data?.provider_results ?? [];

    const firstRuns = providerResults
      .map((pr) => pr.evaluator_runs)
      .find((er): er is EvaluatorRun[] => Array.isArray(er) && er.length > 0);

    if (firstRuns) {
      return firstRuns.map((run) => ({
        key: run.metric_key,
        label: run.name ?? run.metric_key,
        outputType: run.aggregate?.type === "rating" ? "rating" : "binary",
        scoreField: run.metric_key,
        reasoningField: `${run.metric_key}_reasoning`,
      }));
    }

    return [
      {
        key: "llm_judge",
        label: "LLM Judge",
        outputType: "binary",
        scoreField: "llm_judge_score",
        reasoningField: "llm_judge_reasoning",
      },
    ];
  }, [data]);

  // Resolve the aggregate `mean` for a column on a specific provider. The
  // new format ships `aggregate.mean` directly on `evaluator_runs`; the
  // legacy format ships a flat number at `metrics[scoreField]`; the
  // new-format mid-state may have nested `metrics[name]` with `mean` inside.
  const readProviderMean = (col: STTEvaluatorColumn, pr: ProviderResult): number | undefined => {
    const run = pr.evaluator_runs?.find((r) => r.metric_key === col.key);
    if (run && typeof run.aggregate?.mean === "number") return run.aggregate.mean;

    const scoreField = col.scoreField ?? `${col.key}_score`;
    const m = pr.metrics?.[scoreField];
    if (typeof m === "number") return m;

    const nested = pr.metrics?.[col.key];
    if (
      nested &&
      typeof nested === "object" &&
      "mean" in nested &&
      typeof (nested as { mean: unknown }).mean === "number"
    ) {
      return (nested as { mean: number }).mean;
    }
    return undefined;
  };

  const formatMetricValue = (v: unknown): string | number => {
    if (typeof v === "number" && Number.isFinite(v)) return parseFloat(v.toFixed(4));
    return "-";
  };

  if (isLoading) return <PublicPageLayout><PublicLoading /></PublicPageLayout>;
  if (notFound || !data) return <PublicPageLayout><PublicNotFound /></PublicPageLayout>;

  const selectedProvider = activeProviderTab ?? data.provider_results?.[0]?.provider;
  const providerResult = data.provider_results?.find((p) => p.provider === selectedProvider);

  return (
    <PublicPageLayout
      title="Speech-to-text evaluation"
      pills={
        data.language ? (
          <span className="px-2 py-0.5 text-[11px] font-medium bg-muted rounded-full text-muted-foreground capitalize">
            {data.language}
          </span>
        ) : undefined
      }
    >
      <div className="space-y-4 md:space-y-6">
        {data.provider_results && data.provider_results.length > 0 && (
          <>
            {/* Tab Nav */}
            <div className="flex gap-2 border-b border-border">
              {(["leaderboard", "outputs", "about"] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 text-[13px] font-medium border-b-2 transition-colors cursor-pointer capitalize ${
                    activeTab === tab ? "border-foreground text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {tab}
                </button>
              ))}
            </div>

            {/* Leaderboard Tab */}
            {activeTab === "leaderboard" && data.leaderboard_summary && (() => {
              const evaluatorCharts: ChartConfig[] = evaluatorColumns.map((col) => ({
                title: col.label,
                dataKey: col.scoreField ?? `${col.key}_score`,
                yDomain: col.outputType === "binary" ? ([0, 1] as [number, number]) : undefined,
              }));
              return (
                <LeaderboardTab
                  columns={[
                    { key: "run", header: "Run", render: (v) => getProviderLabel(v) },
                    { key: "wer", header: "WER" },
                    { key: "string_similarity", header: "String Similarity", render: (v) => v != null ? parseFloat(v.toFixed(4)) : "-" },
                    ...evaluatorColumns.map((col) => ({
                      key: col.scoreField ?? `${col.key}_score`,
                      header: col.label,
                    })),
                  ]}
                  data={data.leaderboard_summary!}
                  charts={[
                    [{ title: "WER", dataKey: "wer" }, { title: "String Similarity", dataKey: "string_similarity", yDomain: [0, 1] }],
                    ...(() => {
                      const rows: ChartConfig[][] = [];
                      for (let i = 0; i < evaluatorCharts.length; i += 2) rows.push(evaluatorCharts.slice(i, i + 2));
                      return rows;
                    })(),
                  ]}
                  filename="stt-evaluation-leaderboard"
                  getLabel={getProviderLabel}
                />
              );
            })()}

            {/* Outputs Tab */}
            {activeTab === "outputs" && (
              <div className="flex flex-col md:flex-row border border-border rounded-xl overflow-hidden" style={{ minHeight: 480 }}>
                <ProviderSidebar
                  items={data.provider_results.map((pr) => ({
                    key: pr.provider,
                    label: getProviderLabel(pr.provider),
                    success: pr.success,
                  }))}
                  activeKey={selectedProvider ?? null}
                  onSelect={setActiveProviderTab}
                />

                <div className="flex-1 overflow-y-auto p-4 md:p-6">
                  {!providerResult ? (
                    <p className="text-muted-foreground">Select a provider</p>
                  ) : !providerResult.success ? (
                    <div className="flex items-center justify-center h-full min-h-[200px]">
                      <div className="border border-red-500/50 bg-red-500/10 rounded-lg p-4 max-w-md text-center">
                        <div className="text-red-500 text-[14px] font-medium">There was an error running this provider.</div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4 md:space-y-6">
                      {providerResult.metrics && (
                        <ProviderMetricsCard
                          metrics={[
                            { label: "WER", value: providerResult.metrics.wer != null ? parseFloat(providerResult.metrics.wer.toFixed(4)) : "-" },
                            { label: "String Similarity", value: providerResult.metrics.string_similarity != null ? parseFloat(providerResult.metrics.string_similarity.toFixed(4)) : "-" },
                            ...evaluatorColumns.map((col) => ({
                              label: col.label,
                              value: formatMetricValue(readProviderMean(col, providerResult)),
                            })),
                          ]}
                        />
                      )}
                      {providerResult.results && providerResult.results.length > 0 && (
                        <STTResultsTable
                          results={providerResult.results}
                          evaluatorColumns={evaluatorColumns}
                        />
                      )}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* About Tab */}
            {activeTab === "about" && <AboutMetricsTable metrics={STT_ABOUT_METRICS} />}
          </>
        )}
      </div>
    </PublicPageLayout>
  );
}
