"use client";

import React, { useState, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
import { sttProviders } from "@/components/agent-tabs/constants/providers";
import { PublicPageLayout, PublicNotFound, PublicLoading } from "@/components/PublicPageLayout";
import {
  STTEvaluationAbout,
  STTEvaluationLeaderboard,
  STTEvaluationOutputs,
  findFirstEvaluatorRuns,
  evaluatorColumnsFromRuns,
  evaluatorDescriptionMapFromRuns,
  ratingRange,
  type STTEvaluatorColumn,
} from "@/components/eval-details";
import { readEvaluatorCell } from "@/components/eval-details/EvaluatorScoreCell";
import {
  ExportResultsButton,
  type ExportColumn,
} from "@/components/ExportResultsButton";
import {
  getPublicDefaultEvaluator,
  type PublicDefaultEvaluator,
} from "@/lib/publicEvaluators";

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
  description?: string;
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

export default function PublicSTTPage() {
  const params = useParams();
  const token = params.token as string;

  const [data, setData] = useState<EvaluationResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [activeTab, setActiveTab] = useState<"leaderboard" | "outputs" | "about">("leaderboard");
  const [activeProviderTab, setActiveProviderTab] = useState<string | null>(null);
  const [defaultEvaluator, setDefaultEvaluator] =
    useState<PublicDefaultEvaluator | null>(null);

  useEffect(() => { document.title = "Speech-to-text evaluation | Calibrate"; }, []);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const backendUrl = process.env.NEXT_PUBLIC_BACKEND_URL;
        if (!backendUrl) throw new Error("Backend URL not configured");

        const res = await fetch(`${backendUrl}/public/stt/${token}`, {
          headers: { accept: "application/json" },
        });

        if (res.status === 404) { setNotFound(true); return; }
        if (!res.ok) throw new Error("Failed to load results");

        const result: EvaluationResult = await res.json();
        if (result.status !== "done") { setNotFound(true); return; }

        const defaultEvaluator = await getPublicDefaultEvaluator(backendUrl, token, "stt");
        setDefaultEvaluator(defaultEvaluator);
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
  // response is from an older job, using the public default evaluator
  // metadata endpoint for the fallback label/type.
  const evaluatorColumns: STTEvaluatorColumn[] = useMemo(() => {
    const providerResults = data?.provider_results ?? [];
    const firstRuns = findFirstEvaluatorRuns(providerResults);

    if (firstRuns) {
      return evaluatorColumnsFromRuns<STTEvaluatorColumn>(firstRuns);
    }

    return [
      {
        key: "llm_judge",
        label: defaultEvaluator?.name ?? "Evaluator",
        outputType: defaultEvaluator?.output_type ?? "binary",
        scoreField: "llm_judge_score",
        reasoningField: "llm_judge_reasoning",
      },
    ];
  }, [data, defaultEvaluator]);

  const evaluatorDescriptions = useMemo(() => {
    const providerResults = data?.provider_results ?? [];
    return evaluatorDescriptionMapFromRuns(findFirstEvaluatorRuns(providerResults));
  }, [data]);

  const defaultEvaluatorRange = useMemo(() => {
    if (defaultEvaluator?.output_type !== "rating") return "Pass / Fail";
    const scaleValues = (defaultEvaluator.live_version?.output_config?.scale ?? [])
      .map((s) => Number(s.value))
      .filter((v) => !Number.isNaN(v));
    return ratingRange(scaleValues);
  }, [defaultEvaluator]);

  if (isLoading) return <PublicPageLayout><PublicLoading /></PublicPageLayout>;
  if (notFound || !data) return <PublicPageLayout><PublicNotFound /></PublicPageLayout>;

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
            {/* Actions row — Export results, matching the auth STT page.
                Built at click time so it reflects the latest fetched state. */}
            {data.provider_results.some(
              (pr) => (pr.results?.length ?? 0) > 0,
            ) && (
              <div className="flex items-center justify-end">
                <ExportResultsButton
                  filename={`stt-results-${data.task_id}`}
                  getRows={() => {
                    const columns: ExportColumn[] = [
                      { key: "provider", header: "Provider" },
                      { key: "row", header: "Row" },
                      { key: "reference_text", header: "Reference text" },
                      { key: "predicted_text", header: "Predicted text" },
                      { key: "wer", header: "WER" },
                      ...evaluatorColumns.map((c) => ({
                        key: c.key,
                        header: c.label,
                      })),
                    ];
                    const rows: Record<string, unknown>[] = [];
                    for (const pr of data.provider_results ?? []) {
                      for (const r of pr.results ?? []) {
                        const row: Record<string, unknown> = {
                          provider: getProviderLabel(pr.provider),
                          row: r.id,
                          reference_text: r.gt,
                          predicted_text: r.pred,
                          wer: r.wer,
                        };
                        for (const c of evaluatorColumns) {
                          const { score, error } = readEvaluatorCell(
                            r as unknown as Record<string, unknown>,
                            c,
                          );
                          if (error || score === undefined) {
                            row[c.key] = "";
                            continue;
                          }
                          if (c.outputType === "binary") {
                            const norm = score.toLowerCase();
                            row[c.key] =
                              norm === "true" || norm === "1"
                                ? "true"
                                : "false";
                          } else {
                            const n = parseFloat(score);
                            row[c.key] = Number.isFinite(n) ? n : score;
                          }
                        }
                        rows.push(row);
                      }
                    }
                    return { columns, rows };
                  }}
                />
              </div>
            )}
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
            {activeTab === "leaderboard" && data.leaderboard_summary && (
              <STTEvaluationLeaderboard
                leaderboardSummary={data.leaderboard_summary}
                evaluatorColumns={evaluatorColumns}
                getProviderLabel={getProviderLabel}
              />
            )}

            {/* Outputs Tab */}
            {activeTab === "outputs" && (
              <STTEvaluationOutputs
                providerResults={data.provider_results}
                activeProviderKey={activeProviderTab}
                onProviderSelect={setActiveProviderTab}
                status={data.status}
                evaluatorColumns={evaluatorColumns}
                getProviderLabel={getProviderLabel}
                className="flex flex-col md:flex-row border border-border rounded-xl overflow-hidden min-h-[480px]"
              />
            )}

            {/* About Tab */}
            {activeTab === "about" && (
              <STTEvaluationAbout
                evaluatorRows={evaluatorColumns.map((col) => ({
                  key: col.key,
                  metric: col.label,
                  description:
                    evaluatorDescriptions.get(col.key) ??
                    defaultEvaluator?.description ??
                    "",
                  outputType: col.outputType,
                  range:
                    col.key === "llm_judge"
                      ? defaultEvaluatorRange
                      : col.outputType === "binary"
                        ? "Pass / Fail"
                        : "-",
                }))}
              />
            )}
          </>
        )}
      </div>
    </PublicPageLayout>
  );
}
