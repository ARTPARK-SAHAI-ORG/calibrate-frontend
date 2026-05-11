import React from "react";
import { formatEvaluatorAggregate, readProviderEvaluatorMean } from "@/lib/evaluatorMetrics";
import { AboutMetricsTable, type MetricDescription } from "./AboutMetricsTable";
import { LeaderboardTab, type ChartConfig } from "./LeaderboardTab";
import { ProviderMetricsCard } from "./ProviderMetricsCard";
import { ProviderSidebar } from "./ProviderSidebar";
import { STTResultsTable, type STTEvaluatorColumn, type STTResultRow } from "./STTResultsTable";
import { TTSResultsTable, type TTSEvaluatorColumn, type TTSResultRow } from "./TTSResultsTable";

type EvaluationStatus = "queued" | "in_progress" | "done" | "failed";
type EvaluatorOutputType = "binary" | "rating";

type EvaluatorRunAggregateLike = {
  mean?: number;
};

type EvaluatorRunLike = {
  metric_key: string;
  name?: string;
  description?: string;
  aggregate?: {
    type?: "binary" | "rating" | string;
    mean?: number;
  } | null;
};

type ProviderEvaluatorRunsLike = {
  evaluator_runs?: EvaluatorRunLike[] | null;
};

export function findFirstEvaluatorRuns<T extends ProviderEvaluatorRunsLike>(
  providerResults: T[],
): EvaluatorRunLike[] | undefined {
  return providerResults
    .map((pr) => pr.evaluator_runs)
    .find((er): er is EvaluatorRunLike[] => Array.isArray(er) && er.length > 0);
}

export function evaluatorColumnsFromRuns<T extends { key: string }>(
  runs: EvaluatorRunLike[],
): Array<T & {
  label: string;
  outputType: EvaluatorOutputType;
  scoreField: string;
  reasoningField: string;
}> {
  return runs.map((run) => ({
    key: run.metric_key,
    label: run.name ?? run.metric_key,
    outputType: run.aggregate?.type === "rating" ? "rating" : "binary",
    scoreField: run.metric_key,
    reasoningField: `${run.metric_key}_reasoning`,
  })) as Array<T & {
    label: string;
    outputType: EvaluatorOutputType;
    scoreField: string;
    reasoningField: string;
  }>;
}

export function evaluatorDescriptionMapFromRuns(
  runs: EvaluatorRunLike[] | undefined,
): Map<string, string> {
  return new Map(
    (runs ?? []).map((run) => [
      run.metric_key,
      run.description ?? "",
    ]),
  );
}

type EvaluatorMetricRunLike = {
  metric_key: string;
  aggregate?: EvaluatorRunAggregateLike | null;
};

type ProviderResultLike = {
  provider: string;
  success: boolean | null;
  message?: string;
  metrics?: Record<string, unknown> | null;
  evaluator_runs?: EvaluatorMetricRunLike[] | null;
};

export type STTProviderResultForDetails = ProviderResultLike & {
  metrics?: (Record<string, unknown> & { wer?: number }) | null;
  results?: STTResultRow[] | null;
};

export type TTSProviderResultForDetails = ProviderResultLike & {
  metrics?: (Record<string, unknown> & { ttfb?: { mean?: number } }) | null;
  results?: TTSResultRow[] | null;
};

export type LeaderboardSummaryForDetails = {
  run: string;
  [key: string]: string | number | undefined;
};

export type EvaluatorAboutMetricRow = {
  key: string;
  metric: React.ReactNode;
  description: React.ReactNode;
  outputType: EvaluatorOutputType;
  range?: string;
};

export const WER_ABOUT_METRIC: MetricDescription = {
  metric: "WER (Word Error Rate)",
  description:
    "Word error rate measures the percentage of words that differ between the reference transcription and the predicted transcription.",
  preference: "Lower is better",
  range: "0 - \u221E",
};

export const TTFB_ABOUT_METRIC: MetricDescription = {
  metric: "TTFB (Time To First Byte)",
  description:
    "Time to first byte measures the latency from when a request is sent until the first byte of the response is received.",
  preference: "Lower is better",
  range: "0 - \u221E",
};

export function ratingRange(scaleValues: number[]): string {
  if (scaleValues.length === 0) return "-";
  const min = Math.min(...scaleValues);
  const max = Math.max(...scaleValues);
  return min === max ? String(min) : `${min} - ${max}`;
}

export function hasSTTEmptyPredictions(providerResult: STTProviderResultForDetails): boolean {
  return (
    providerResult.results?.some((r) => !r.pred || r.pred.trim() === "") ??
    false
  );
}

export function getFirstSTTEmptyPredictionIndex(
  providerResult: STTProviderResultForDetails,
): number {
  return (
    providerResult.results?.findIndex((r) => !r.pred || r.pred.trim() === "") ??
    -1
  );
}

function evaluatorRowsToMetricDescriptions(
  rows: EvaluatorAboutMetricRow[],
): MetricDescription[] {
  return rows.map((row) => ({
    key: row.key,
    metric: row.metric,
    description: row.description,
    preference: row.outputType === "binary" ? "Pass is better" : "Higher is better",
    range: row.range ?? (row.outputType === "binary" ? "Pass / Fail" : "-"),
  }));
}

export function STTEvaluationAbout({
  evaluatorRows,
}: {
  evaluatorRows: EvaluatorAboutMetricRow[];
}) {
  return (
    <AboutMetricsTable
      metrics={[WER_ABOUT_METRIC, ...evaluatorRowsToMetricDescriptions(evaluatorRows)]}
    />
  );
}

export function TTSEvaluationAbout({
  evaluatorRows,
}: {
  evaluatorRows: EvaluatorAboutMetricRow[];
}) {
  return (
    <AboutMetricsTable
      metrics={[...evaluatorRowsToMetricDescriptions(evaluatorRows), TTFB_ABOUT_METRIC]}
    />
  );
}

export function STTEvaluationLeaderboard({
  leaderboardSummary,
  evaluatorColumns,
  getProviderLabel,
  className,
}: {
  leaderboardSummary: LeaderboardSummaryForDetails[];
  evaluatorColumns: STTEvaluatorColumn[];
  getProviderLabel: (value: string) => string;
  className?: string;
}) {
  const allCharts: ChartConfig[] = [
    { title: "WER", dataKey: "wer" },
    ...evaluatorColumns.map((col) => {
      const isBinary = col.outputType === "binary";
      const scaleMax =
        typeof col.scaleMax === "number" ? col.scaleMax : undefined;
      return {
        title: col.label,
        dataKey: col.scoreField ?? `${col.key}_score`,
        // Binary stays in [0,1] but rendered as %; rating spans [0, scaleMax]
        // when known so all providers are comparable on the same axis.
        yDomain: isBinary
          ? ([0, 1] as [number, number])
          : scaleMax != null
            ? ([0, scaleMax] as [number, number])
            : undefined,
        yTickFormatter: isBinary
          ? (v: number) => `${Math.round(v * 100)}%`
          : undefined,
        formatTooltip: isBinary
          ? (v: number) => `${Math.round(v * 100)}%`
          : scaleMax != null
            ? (v: number) => `${parseFloat(v.toFixed(4))}/${scaleMax}`
            : undefined,
      };
    }),
  ];
  const chartRows: ChartConfig[][] = [];
  for (let i = 0; i < allCharts.length; i += 2) {
    chartRows.push(allCharts.slice(i, i + 2));
  }

  return (
    <LeaderboardTab
      className={className}
      columns={[
        { key: "run", header: "Run", render: (v) => getProviderLabel(v) },
        { key: "wer", header: "WER" },
        ...evaluatorColumns.map((col) => ({
          key: col.scoreField ?? `${col.key}_score`,
          header: col.label,
          render: (v: unknown) =>
            formatEvaluatorAggregate(
              typeof v === "number" ? v : null,
              col.outputType,
              col.scaleMax,
            ),
        })),
      ]}
      data={leaderboardSummary}
      charts={chartRows}
      filename="stt-evaluation-leaderboard"
      getLabel={getProviderLabel}
    />
  );
}

export function TTSEvaluationLeaderboard({
  leaderboardSummary,
  evaluatorColumns,
  getProviderLabel,
  className,
}: {
  leaderboardSummary: LeaderboardSummaryForDetails[];
  evaluatorColumns: TTSEvaluatorColumn[];
  getProviderLabel: (value: string) => string;
  className?: string;
}) {
  const allCharts: ChartConfig[] = [
    ...evaluatorColumns.map((col) => {
      const isBinary = col.outputType === "binary";
      const scaleMax =
        typeof col.scaleMax === "number" ? col.scaleMax : undefined;
      return {
        title: col.label,
        dataKey: col.scoreField ?? `${col.key}_score`,
        yDomain: isBinary
          ? ([0, 1] as [number, number])
          : scaleMax != null
            ? ([0, scaleMax] as [number, number])
            : undefined,
        yTickFormatter: isBinary
          ? (v: number) => `${Math.round(v * 100)}%`
          : undefined,
        formatTooltip: isBinary
          ? (v: number) => `${Math.round(v * 100)}%`
          : scaleMax != null
            ? (v: number) => `${parseFloat(v.toFixed(4))}/${scaleMax}`
            : undefined,
      };
    }),
    { title: "TTFB (s)", dataKey: "ttfb" },
  ];
  const chartRows: ChartConfig[][] = [];
  for (let i = 0; i < allCharts.length; i += 2) {
    chartRows.push(allCharts.slice(i, i + 2));
  }

  return (
    <LeaderboardTab
      className={className}
      columns={[
        { key: "run", header: "Run", render: (v) => getProviderLabel(v) },
        ...evaluatorColumns.map((col) => ({
          key: col.scoreField ?? `${col.key}_score`,
          header: col.label,
          render: (v: unknown) =>
            formatEvaluatorAggregate(
              typeof v === "number" ? v : null,
              col.outputType,
              col.scaleMax,
            ),
        })),
        {
          key: "ttfb",
          header: "TTFB (s)",
          render: (v) => (v != null ? parseFloat(v.toFixed(4)) : "-"),
        },
      ]}
      data={leaderboardSummary}
      charts={chartRows}
      filename="tts-evaluation-leaderboard"
      getLabel={getProviderLabel}
    />
  );
}

export function STTEvaluationOutputs({
  providerResults,
  activeProviderKey,
  onProviderSelect,
  status,
  evaluatorColumns,
  getProviderLabel,
  className = "flex flex-col md:flex-row border border-border rounded-xl overflow-hidden md:h-[calc(100vh-220px)]",
  tableRef,
}: {
  providerResults: STTProviderResultForDetails[];
  activeProviderKey: string | null;
  onProviderSelect: (key: string) => void;
  status: EvaluationStatus;
  evaluatorColumns: STTEvaluatorColumn[];
  getProviderLabel: (value: string) => string;
  className?: string;
  tableRef?: React.RefObject<HTMLDivElement | null>;
}) {
  const selectedProvider = activeProviderKey || providerResults[0]?.provider;
  const providerResult = providerResults.find((pr) => pr.provider === selectedProvider);

  return (
    <div className={className}>
      <ProviderSidebar
        items={providerResults.map((pr) => ({
          key: pr.provider,
          label: getProviderLabel(pr.provider),
          success:
            pr.success === true && !hasSTTEmptyPredictions(pr)
              ? true
              : pr.success === null
                ? null
                : false,
        }))}
        activeKey={selectedProvider ?? null}
        onSelect={onProviderSelect}
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {(() => {
          if (!providerResult) {
            return (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Select a provider to view details</p>
              </div>
            );
          }

          if (providerResult.success === null && (!providerResult.results || providerResult.results.length === 0)) {
            return <ProviderLoadingState />;
          }

          if (providerResult.success === false) {
            return <ProviderErrorState />;
          }

          // Show per-row metric columns as soon as this provider's results
          // arrive — don't wait for the overall task (other providers) to
          // finish. Rows without computed values still render "—" in the
          // metric cells.
          const showMetrics =
            providerResult.success === true ||
            (providerResult.results?.some((r) => {
              if (r.wer !== undefined && r.wer !== "") return true;
              // Canonical namespaced shape from the API refresh.
              const outputs = (r as Record<string, unknown>).evaluator_outputs;
              if (outputs && typeof outputs === "object") {
                for (const v of Object.values(outputs as Record<string, unknown>)) {
                  if (v && typeof v === "object") return true;
                }
              }
              return evaluatorColumns.some((col) => {
                const v = r[col.scoreField ?? `${col.key}_score`];
                return v !== undefined && v !== null && v !== "";
              });
            }) ?? false);

          return (
            <div className="space-y-4 md:space-y-6">
              {providerResult.success && providerResult.metrics && (
                <ProviderMetricsCard
                  metrics={[
                    {
                      label: "WER",
                      value:
                        providerResult.metrics.wer != null
                          ? parseFloat(providerResult.metrics.wer.toFixed(4))
                          : "-",
                    },
                    ...evaluatorColumns.map((col) => ({
                      label: col.label,
                      value: formatEvaluatorAggregate(
                        readProviderEvaluatorMean(col, providerResult),
                        col.outputType,
                        col.scaleMax,
                      ),
                    })),
                  ]}
                />
              )}
              {providerResult.results && providerResult.results.length > 0 && (
                <STTResultsTable
                  results={providerResult.results}
                  showMetrics={showMetrics}
                  showSimilarity={false}
                  evaluatorColumns={evaluatorColumns}
                  tableRef={tableRef}
                />
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

export function TTSEvaluationOutputs({
  providerResults,
  activeProviderKey,
  onProviderSelect,
  status,
  evaluatorColumns,
  getProviderLabel,
  className = "flex flex-col md:flex-row border border-border rounded-xl overflow-hidden md:h-[calc(100vh-220px)]",
}: {
  providerResults: TTSProviderResultForDetails[];
  activeProviderKey: string | null;
  onProviderSelect: (key: string) => void;
  status: EvaluationStatus;
  evaluatorColumns: TTSEvaluatorColumn[];
  getProviderLabel: (value: string) => string;
  className?: string;
}) {
  const selectedProvider = activeProviderKey || providerResults[0]?.provider;
  const providerResult = providerResults.find((pr) => pr.provider === selectedProvider);

  return (
    <div className={className}>
      <ProviderSidebar
        items={providerResults.map((pr) => ({
          key: pr.provider,
          label: getProviderLabel(pr.provider),
          success: pr.success,
        }))}
        activeKey={selectedProvider ?? null}
        onSelect={onProviderSelect}
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {(() => {
          if (!providerResult) {
            return (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">Select a provider to view details</p>
              </div>
            );
          }

          if (providerResult.success === null && (!providerResult.results || providerResult.results.length === 0)) {
            return <ProviderLoadingState />;
          }

          if (providerResult.success === false) {
            return <ProviderErrorState />;
          }

          // Show per-row metric columns as soon as this provider's results
          // arrive — don't wait for the overall task (other providers) to
          // finish.
          const showMetrics =
            providerResult.success === true ||
            (providerResult.results?.some((r) => {
              const outputs = (r as Record<string, unknown>).evaluator_outputs;
              if (outputs && typeof outputs === "object") {
                for (const v of Object.values(outputs as Record<string, unknown>)) {
                  if (v && typeof v === "object") return true;
                }
              }
              return evaluatorColumns.some((col) => {
                const v = r[col.scoreField ?? `${col.key}_score`];
                return v !== undefined && v !== null && v !== "";
              });
            }) ?? false);

          const ttfbValue = (() => {
            const t = providerResult.metrics?.ttfb;
            if (t && typeof t.mean === "number") {
              return parseFloat(t.mean.toFixed(4));
            }
            return "-";
          })();

          return (
            <div className="space-y-4 md:space-y-6">
              {providerResult.success && providerResult.metrics && (
                <ProviderMetricsCard
                  metrics={[
                    ...evaluatorColumns.map((col) => ({
                      label: col.label,
                      value: formatEvaluatorAggregate(
                        readProviderEvaluatorMean(col, providerResult),
                        col.outputType,
                        col.scaleMax,
                      ),
                    })),
                    { label: "TTFB (s)", value: ttfbValue },
                  ]}
                />
              )}
              {providerResult.results && providerResult.results.length > 0 && (
                <TTSResultsTable
                  results={providerResult.results}
                  showMetrics={showMetrics}
                  evaluatorColumns={evaluatorColumns}
                />
              )}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

function ProviderLoadingState() {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px]">
      <svg className="w-5 h-5 animate-spin text-muted-foreground" fill="none" viewBox="0 0 24 24">
        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
      </svg>
    </div>
  );
}

function ProviderErrorState() {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px]">
      <div className="border border-red-500/50 bg-red-500/10 rounded-lg p-4 max-w-md text-center">
        <div className="text-red-500 text-[14px] font-medium mb-1">
          There was an error running this provider. Please contact us by posting your issue to help us help you.
        </div>
      </div>
    </div>
  );
}
