import React from "react";
import {
  formatEvaluatorAggregate,
  readProviderEvaluatorMean,
} from "@/lib/evaluatorMetrics";
import { AboutMetricsTable, type MetricDescription } from "./AboutMetricsTable";
import { LeaderboardTab, type ChartConfig } from "./LeaderboardTab";
import { ProviderMetricsCard } from "./ProviderMetricsCard";
import { ProviderSidebar } from "./ProviderSidebar";
import {
  STTResultsTable,
  type STTEvaluatorColumn,
  type STTResultRow,
} from "./STTResultsTable";
import {
  TTSResultsTable,
  type TTSEvaluatorColumn,
  type TTSResultRow,
} from "./TTSResultsTable";
import type { LatencyMetric } from "./ttsEvalTypes";
import { PIPECAT_SEMANTIC_WER_URL, SARVAM_ASR_BLOG_URL } from "@/constants/links";
import { SARVAM_METRIC_FIELDS } from "./sarvamMetrics";
import { formatCostUsd } from "@/lib/llmMetrics";
import {
  type AudioCostBreakdown,
  COST_PER_MINUTE_KEY,
  COST_PER_MINUTE_LABEL,
  costByRunFromProviders,
  readCostPerMinuteUsd,
} from "@/lib/audioCost";

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
): Array<
  T & {
    label: string;
    outputType: EvaluatorOutputType;
    scoreField: string;
    reasoningField: string;
  }
> {
  return runs.map((run) => ({
    key: run.metric_key,
    label: run.name ?? run.metric_key,
    outputType: run.aggregate?.type === "rating" ? "rating" : "binary",
    scoreField: run.metric_key,
    reasoningField: `${run.metric_key}_reasoning`,
  })) as Array<
    T & {
      label: string;
      outputType: EvaluatorOutputType;
      scoreField: string;
      reasoningField: string;
    }
  >;
}

export function evaluatorDescriptionMapFromRuns(
  runs: EvaluatorRunLike[] | undefined,
): Map<string, string> {
  return new Map(
    (runs ?? []).map((run) => [run.metric_key, run.description ?? ""]),
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
  metrics?:
    | (Record<string, unknown> & {
        wer?: number;
        cer?: number;
        // LLM-judged word error rate that only counts errors which would
        // change an agent's understanding (see Pipecat's STT benchmark).
        // Present only when the run computed it.
        semantic_wer?: number;
        // Present only when the run used Sarvam LLM judges. LLM-WER/CER share
        // the `sarvam_llm_*` keys; intent/entity use the `_score` suffix.
        sarvam_llm_wer?: number;
        sarvam_llm_cer?: number;
        sarvam_intent_score?: number;
        sarvam_entity_score?: number;
        // Per-provider cost block (per-minute USD pricing × audio duration).
        // Present only when the run computed cost.
        cost?: AudioCostBreakdown;
      })
    | null;
  results?: STTResultRow[] | null;
};

/** Read a metric that should be numeric, tolerating string/undefined. */
function readNumericMetric(v: unknown): number | null {
  if (typeof v === "number") return Number.isNaN(v) ? null : v;
  if (typeof v === "string" && v.trim() !== "") {
    const n = parseFloat(v);
    return Number.isNaN(n) ? null : n;
  }
  return null;
}

export type TTSProviderResultForDetails = ProviderResultLike & {
  // `ttfb` now reports percentiles (`p50` headline + `p95` / `p99`); legacy
  // runs still carry `mean`. Read `p50 ?? mean`.
  metrics?:
    | (Record<string, unknown> & {
        ttfb?: LatencyMetric;
        // Per-provider cost block. Present only when the run computed cost.
        cost?: AudioCostBreakdown;
      })
    | null;
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

export const CER_ABOUT_METRIC: MetricDescription = {
  metric: "CER (Character Error Rate)",
  description:
    "Character error rate measures the percentage of characters that differ between the reference transcription and the predicted transcription.",
  preference: "Lower is better",
  range: "0 - \u221E",
};

// Semantic WER (see Pipecat's STT benchmark). Rendered on the STT About tab
// only when a run computed it. The metric name links out to the benchmark's
// definition in a new tab.
export const SEMANTIC_WER_ABOUT_METRIC: MetricDescription = {
  key: "semantic_wer",
  metric: (
    <a
      href={PIPECAT_SEMANTIC_WER_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="text-foreground underline-offset-2 hover:underline"
      title="Learn more in the Pipecat STT benchmark"
    >
      Semantic WER
    </a>
  ),
  description:
    "Semantic WER measures only transcription errors that would impact an LLM agent's understanding. Punctuation, contractions, filler words, and equivalent phrasings are ignored.",
  preference: "Lower is better",
  range: "0 - \u221E",
};

/** Whether any provider computed the aggregate Semantic WER metric. Drives the
 * STT About-tab row and the CSV column on both the detail and public pages. */
export function hasSemanticWerMetric(
  providerResults:
    | Array<{ metrics?: Record<string, unknown> | null }>
    | null
    | undefined,
): boolean {
  return (providerResults ?? []).some((pr) => pr.metrics?.semantic_wer != null);
}

// Sarvam's LLM-based ASR metrics (see the "Evaluating Indian Language ASR"
// blog). Rendered on the STT About tab only when a run used Sarvam judges.
// Each metric name links out to the blog in a new tab. LLM-WER / LLM-CER are
// the two we surface as score columns; Intent / Entity ride along in the same
// server-side bundle and are described here for context.
function sarvamMetricLink(label: string): React.ReactNode {
  return (
    <a
      href={SARVAM_ASR_BLOG_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="text-foreground underline-offset-2 hover:underline"
      title="Learn more on the Sarvam ASR evaluation blog"
    >
      {label}
    </a>
  );
}

export const SARVAM_ABOUT_METRICS: MetricDescription[] = [
  {
    key: "sarvam_llm_wer",
    metric: sarvamMetricLink("LLM-WER"),
    description:
      "Word Error Rate re-scored by an LLM judge: segments that are semantically or phonetically equivalent (colloquial variants, script differences, normalised numbers) no longer count as errors. Same scale as WER, so the gap versus WER is the “forgiveness” effect.",
    preference: "Lower is better",
    range: "0 - ∞",
  },
  {
    key: "sarvam_llm_cer",
    metric: sarvamMetricLink("LLM-CER"),
    description:
      "Character Error Rate re-scored by the same LLM judge — the character-level counterpart of LLM-WER, useful for agglutinative languages where a minor suffix change over-penalises a long token.",
    preference: "Lower is better",
    range: "0 - ∞",
  },
  {
    key: "sarvam_intent",
    metric: sarvamMetricLink("Intent Score"),
    description:
      "A binary LLM judgment of whether the core meaning of the utterance is preserved. Passes on minor spelling / phrasing / synonym differences; fails when the subject, object, or action changes or a statement flips to a question.",
    preference: "Higher is better",
    range: "Pass / Fail",
  },
  {
    key: "sarvam_entity",
    metric: sarvamMetricLink("Entity Preservation Score"),
    description:
      "The fraction of key named entities (names, places, dates, times, numbers) from the reference that are transcribed correctly, penalising missing and substituted entities. Automatically 1.0 when the reference has no entities.",
    preference: "Higher is better",
    range: "0 - 1",
  },
];

export const TTFB_ABOUT_METRIC: MetricDescription = {
  metric: "Latency",
  description:
    "Latency measures the time to first byte (TTFB) from when a request is sent until the first byte of the response is received. The reported value is the median (p50) across the dataset.",
  preference: "Lower is better",
  range: "0 - \u221E",
};

export function ratingRange(scaleValues: number[]): string {
  if (scaleValues.length === 0) return "-";
  const min = Math.min(...scaleValues);
  const max = Math.max(...scaleValues);
  return min === max ? String(min) : `${min} - ${max}`;
}

export function hasSTTEmptyPredictions(
  providerResult: STTProviderResultForDetails,
): boolean {
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
    preference:
      row.outputType === "binary" ? "Pass is better" : "Higher is better",
    range: row.range ?? (row.outputType === "binary" ? "Pass / Fail" : "-"),
  }));
}

/**
 * Builds the per-evaluator chart configs (axis bounds, tick + tooltip
 * formatters) used by both the STT and TTS leaderboards. Binary stays in
 * [0,1] but renders as %; rating spans [0, scale_max] when known so
 * providers compare on the same axis.
 */
function evaluatorChartConfigs(
  evaluatorColumns: Array<STTEvaluatorColumn | TTSEvaluatorColumn>,
): ChartConfig[] {
  return evaluatorColumns.map((col) => {
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
  });
}

/** Builds the per-evaluator leaderboard table columns (matching cell format). */
function evaluatorLeaderboardColumns(
  evaluatorColumns: Array<STTEvaluatorColumn | TTSEvaluatorColumn>,
) {
  return evaluatorColumns.map((col) => ({
    key: col.scoreField ?? `${col.key}_score`,
    header: col.label,
    render: (v: unknown) =>
      formatEvaluatorAggregate(
        typeof v === "number" ? v : null,
        col.outputType,
        col.scaleMax,
      ),
  }));
}

/** Leaderboard column for per-minute cost (shared by STT and TTS). */
const costLeaderboardColumn = {
  key: COST_PER_MINUTE_KEY,
  header: COST_PER_MINUTE_LABEL,
  render: (v: unknown) => (typeof v === "number" ? formatCostUsd(v) : "-"),
};

/** Leaderboard chart for per-minute cost (shared by STT and TTS). */
const costChartConfig: ChartConfig = {
  title: COST_PER_MINUTE_LABEL,
  dataKey: COST_PER_MINUTE_KEY,
  formatTooltip: (v: number) => formatCostUsd(v),
};

/**
 * Joins per-minute USD cost onto leaderboard rows. Reads the cost off the row
 * itself when the summary carries it, otherwise off the matching provider
 * result. Exposes it under the flat `COST_PER_MINUTE_KEY` the cost column /
 * chart read, and reports whether any row ended up with a cost.
 */
function withCostPerMinute(
  leaderboardSummary: LeaderboardSummaryForDetails[],
  providerResults?: Array<{
    provider: string;
    metrics?: Record<string, unknown> | null;
  }>,
): { rows: LeaderboardSummaryForDetails[]; showCost: boolean } {
  const costByRun = costByRunFromProviders(providerResults);
  let showCost = false;
  const rows = leaderboardSummary.map((row) => {
    const cpm = costByRun[row.run] ?? readCostPerMinuteUsd(row);
    if (cpm == null) return row;
    showCost = true;
    return { ...row, [COST_PER_MINUTE_KEY]: cpm };
  });
  return { rows, showCost };
}

/** Pairs charts into rows of two for the LeaderboardTab grid. */
function chunkChartRows(charts: ChartConfig[]): ChartConfig[][] {
  const rows: ChartConfig[][] = [];
  for (let i = 0; i < charts.length; i += 2) {
    rows.push(charts.slice(i, i + 2));
  }
  return rows;
}

export function STTEvaluationAbout({
  evaluatorRows,
  showSarvamMetrics = false,
  showSemanticWer = false,
}: {
  evaluatorRows: EvaluatorAboutMetricRow[];
  /** Include the Sarvam LLM-judge metric rows — set when the run used them. */
  showSarvamMetrics?: boolean;
  /** Include the Semantic WER row — set when the run computed it. */
  showSemanticWer?: boolean;
}) {
  return (
    <AboutMetricsTable
      metrics={[
        WER_ABOUT_METRIC,
        CER_ABOUT_METRIC,
        ...(showSemanticWer ? [SEMANTIC_WER_ABOUT_METRIC] : []),
        ...(showSarvamMetrics ? SARVAM_ABOUT_METRICS : []),
        ...evaluatorRowsToMetricDescriptions(evaluatorRows),
      ]}
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
      metrics={[
        ...evaluatorRowsToMetricDescriptions(evaluatorRows),
        TTFB_ABOUT_METRIC,
      ]}
    />
  );
}

export function STTEvaluationLeaderboard({
  leaderboardSummary,
  evaluatorColumns,
  getProviderLabel,
  providerResults,
  className,
}: {
  leaderboardSummary: LeaderboardSummaryForDetails[];
  evaluatorColumns: STTEvaluatorColumn[];
  getProviderLabel: (value: string) => string;
  // Provider-level results, used to join per-minute cost onto leaderboard rows
  // when the leaderboard summary doesn't carry it directly.
  providerResults?: Array<{
    provider: string;
    metrics?: Record<string, unknown> | null;
  }>;
  className?: string;
}) {
  // Sarvam metrics only appear as leaderboard charts/columns when the
  // leaderboard rows actually carry them (Sarvam judges were on for the run).
  const sarvamFields = SARVAM_METRIC_FIELDS.filter((field) =>
    leaderboardSummary.some((row) => row[field.key] != null),
  );

  // Semantic WER only appears as a leaderboard chart/column when the rows
  // actually carry it (the run computed it).
  const showSemanticWer = leaderboardSummary.some(
    (row) => row.semantic_wer != null,
  );

  // Join per-minute cost onto each row (from the row itself or the matching
  // provider result) and expose it under a flat key the column/chart read.
  const { rows, showCost } = withCostPerMinute(leaderboardSummary, providerResults);

  // Drop evaluator columns/charts that no run carries a value for — an
  // all-"-" column (e.g. an evaluator that didn't run) is just noise.
  // Mirrors the Sarvam filtering above.
  const visibleEvaluatorColumns = evaluatorColumns.filter((col) =>
    leaderboardSummary.some(
      (row) => row[col.scoreField ?? `${col.key}_score`] != null,
    ),
  );

  const allCharts: ChartConfig[] = [
    { title: "WER", dataKey: "wer" },
    { title: "CER", dataKey: "cer" },
    ...(showSemanticWer
      ? [{ title: "Semantic WER", dataKey: "semantic_wer" }]
      : []),
    ...sarvamFields.map((field) => ({ title: field.label, dataKey: field.key })),
    ...evaluatorChartConfigs(visibleEvaluatorColumns),
    ...(showCost ? [costChartConfig] : []),
  ];
  const chartRows = chunkChartRows(allCharts);

  return (
    <LeaderboardTab
      className={className}
      columns={[
        { key: "run", header: "Run", render: (v) => getProviderLabel(v) },
        { key: "wer", header: "WER" },
        { key: "cer", header: "CER" },
        ...(showSemanticWer
          ? [{ key: "semantic_wer", header: "Semantic WER" }]
          : []),
        ...sarvamFields.map((field) => ({ key: field.key, header: field.label })),
        ...evaluatorLeaderboardColumns(visibleEvaluatorColumns),
        ...(showCost ? [costLeaderboardColumn] : []),
      ]}
      data={rows}
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
  providerResults,
  className,
}: {
  leaderboardSummary: LeaderboardSummaryForDetails[];
  evaluatorColumns: TTSEvaluatorColumn[];
  getProviderLabel: (value: string) => string;
  // Provider-level results, used to join per-minute cost onto leaderboard rows
  // when the leaderboard summary doesn't carry it directly.
  providerResults?: Array<{
    provider: string;
    metrics?: Record<string, unknown> | null;
  }>;
  className?: string;
}) {
  // Latency (TTFB) is reported as the median (p50) under `ttfb_p50`. Runs from
  // before the percentile switch carry the value under the legacy `ttfb` key —
  // read whichever is present so both render in a single "Latency (s)" column.
  const hasPercentileTtfb = leaderboardSummary.some(
    (row) => row.ttfb_p50 != null,
  );
  const ttfbKey = hasPercentileTtfb ? "ttfb_p50" : "ttfb";
  const renderTtfb = (v: string | number | undefined) =>
    v != null ? parseFloat(Number(v).toFixed(4)) : "-";

  // Join per-minute cost onto each row (from the row itself or the matching
  // provider result) and expose it under a flat key the column/chart read.
  const { rows, showCost } = withCostPerMinute(leaderboardSummary, providerResults);

  const allCharts: ChartConfig[] = [
    ...evaluatorChartConfigs(evaluatorColumns),
    { title: "Latency (s)", dataKey: ttfbKey },
    ...(showCost ? [costChartConfig] : []),
  ];
  const chartRows = chunkChartRows(allCharts);

  return (
    <LeaderboardTab
      className={className}
      columns={[
        { key: "run", header: "Run", render: (v) => getProviderLabel(v) },
        ...evaluatorLeaderboardColumns(evaluatorColumns),
        { key: ttfbKey, header: "Latency (s)", render: renderTtfb },
        ...(showCost ? [costLeaderboardColumn] : []),
      ]}
      data={rows}
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
  labellingSelection,
  onToggleLabellingSelection,
  onLabellingBulkToggle,
}: {
  providerResults: STTProviderResultForDetails[];
  activeProviderKey: string | null;
  onProviderSelect: (key: string) => void;
  status: EvaluationStatus;
  evaluatorColumns: STTEvaluatorColumn[];
  getProviderLabel: (value: string) => string;
  className?: string;
  tableRef?: React.RefObject<HTMLDivElement | null>;
  // Labelling selection (opt-in). Keys are scoped per provider — the active
  // provider's key prefix is prepended so a row's identity is stable across
  // provider switches (e.g. `openai:0`).
  labellingSelection?: Set<string>;
  onToggleLabellingSelection?: (key: string) => void;
  onLabellingBulkToggle?: (keys: string[]) => void;
}) {
  const selectedProvider = activeProviderKey || providerResults[0]?.provider;
  const providerResult = providerResults.find(
    (pr) => pr.provider === selectedProvider,
  );

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
                ? status === "failed"
                  ? false
                  : null
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
                <p className="text-muted-foreground">
                  Select a provider to view details
                </p>
              </div>
            );
          }

          if (
            providerResult.success === null &&
            (!providerResult.results || providerResult.results.length === 0)
          ) {
            if (status === "failed") {
              return <ProviderErrorState />;
            }
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
                for (const v of Object.values(
                  outputs as Record<string, unknown>,
                )) {
                  if (v && typeof v === "object") return true;
                }
              }
              return evaluatorColumns.some((col) => {
                const v = r[col.scoreField ?? `${col.key}_score`];
                return v !== undefined && v !== null && v !== "";
              });
            }) ??
              false);

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
                    {
                      label: "CER",
                      value:
                        providerResult.metrics.cer != null
                          ? parseFloat(providerResult.metrics.cer.toFixed(4))
                          : "-",
                    },
                    // Semantic WER — shown only when the run computed it.
                    ...(providerResult.metrics.semantic_wer != null
                      ? [
                          {
                            label: "Semantic WER",
                            value: parseFloat(
                              providerResult.metrics.semantic_wer.toFixed(4),
                            ),
                          },
                        ]
                      : []),
                    // Sarvam LLM-judge metrics (LLM-WER/CER, Intent, Entity) —
                    // each shown only when the run computed it.
                    ...SARVAM_METRIC_FIELDS.flatMap((field) => {
                      const value = readNumericMetric(
                        providerResult.metrics?.[field.key],
                      );
                      return value != null
                        ? [{ label: field.label, value: parseFloat(value.toFixed(4)) }]
                        : [];
                    }),
                    // Cost tile — shown only when the run computed cost.
                    ...(readCostPerMinuteUsd(providerResult.metrics) != null
                      ? [
                          {
                            label: COST_PER_MINUTE_LABEL,
                            value: formatCostUsd(
                              readCostPerMinuteUsd(providerResult.metrics),
                            ),
                          },
                        ]
                      : []),
                    // Evaluator tiles — shown only when this provider actually
                    // has a value for the evaluator (mirrors the Sarvam tiles),
                    // so e.g. a "Semantic match" tile is hidden when it didn't
                    // run rather than rendering "-".
                    ...evaluatorColumns.flatMap((col) => {
                      const mean = readProviderEvaluatorMean(col, providerResult);
                      return mean != null
                        ? [
                            {
                              label: col.label,
                              value: formatEvaluatorAggregate(
                                mean,
                                col.outputType,
                                col.scaleMax,
                              ),
                            },
                          ]
                        : [];
                    }),
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
                  labellingSelection={
                    onToggleLabellingSelection ? labellingSelection : undefined
                  }
                  onToggleLabellingSelection={onToggleLabellingSelection}
                  onLabellingBulkToggle={onLabellingBulkToggle}
                  labellingKeyForRow={
                    onToggleLabellingSelection
                      ? (_row, i) => `${selectedProvider}:${i}`
                      : undefined
                  }
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
  labellingSelection,
  onToggleLabellingSelection,
  onLabellingBulkToggle,
  labellingRowEligible,
}: {
  providerResults: TTSProviderResultForDetails[];
  activeProviderKey: string | null;
  onProviderSelect: (key: string) => void;
  status: EvaluationStatus;
  evaluatorColumns: TTSEvaluatorColumn[];
  getProviderLabel: (value: string) => string;
  className?: string;
  // Labelling selection (opt-in). Keys are scoped per provider — the active
  // provider's key prefix is prepended so a row's identity is stable across
  // provider switches (e.g. `openai:0`).
  labellingSelection?: Set<string>;
  onToggleLabellingSelection?: (key: string) => void;
  onLabellingBulkToggle?: (keys: string[]) => void;
  // Which rows can be selected. The TTS page gates on the audio storage key
  // (only rows the evaluator can actually run on), so it passes this rather
  // than relying on the table's default "has a playback URL" rule.
  labellingRowEligible?: (row: TTSResultRow, index: number) => boolean;
}) {
  const selectedProvider = activeProviderKey || providerResults[0]?.provider;
  const providerResult = providerResults.find(
    (pr) => pr.provider === selectedProvider,
  );

  return (
    <div className={className}>
      <ProviderSidebar
        items={providerResults.map((pr) => ({
          key: pr.provider,
          label: getProviderLabel(pr.provider),
          success:
            pr.success === true
              ? true
              : pr.success === false
                ? false
                : status === "failed"
                  ? false
                  : null,
        }))}
        activeKey={selectedProvider ?? null}
        onSelect={onProviderSelect}
      />

      <div className="flex-1 overflow-y-auto p-4 md:p-6">
        {(() => {
          if (!providerResult) {
            return (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground">
                  Select a provider to view details
                </p>
              </div>
            );
          }

          if (
            providerResult.success === null &&
            (!providerResult.results || providerResult.results.length === 0)
          ) {
            if (status === "failed") {
              return <ProviderErrorState />;
            }
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
                for (const v of Object.values(
                  outputs as Record<string, unknown>,
                )) {
                  if (v && typeof v === "object") return true;
                }
              }
              return evaluatorColumns.some((col) => {
                const v = r[col.scoreField ?? `${col.key}_score`];
                return v !== undefined && v !== null && v !== "";
              });
            }) ??
              false);

          const ttfbValue = (() => {
            // p50 is the new headline TTFB; fall back to legacy `mean`.
            const t = providerResult.metrics?.ttfb;
            const value = t?.p50 ?? t?.mean;
            if (typeof value === "number") {
              return parseFloat(value.toFixed(4));
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
                    { label: "Latency (s)", value: ttfbValue },
                    // Cost tile — shown only when the run computed cost.
                    ...(readCostPerMinuteUsd(providerResult.metrics) != null
                      ? [
                          {
                            label: COST_PER_MINUTE_LABEL,
                            value: formatCostUsd(
                              readCostPerMinuteUsd(providerResult.metrics),
                            ),
                          },
                        ]
                      : []),
                  ]}
                />
              )}
              {providerResult.results && providerResult.results.length > 0 && (
                <TTSResultsTable
                  results={providerResult.results}
                  showMetrics={showMetrics}
                  evaluatorColumns={evaluatorColumns}
                  labellingSelection={
                    onToggleLabellingSelection ? labellingSelection : undefined
                  }
                  onToggleLabellingSelection={onToggleLabellingSelection}
                  onLabellingBulkToggle={onLabellingBulkToggle}
                  labellingKeyForRow={
                    onToggleLabellingSelection
                      ? (_row, i) => `${selectedProvider}:${i}`
                      : undefined
                  }
                  labellingRowEligible={labellingRowEligible}
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
      <svg
        className="w-5 h-5 animate-spin text-muted-foreground"
        fill="none"
        viewBox="0 0 24 24"
      >
        <circle
          className="opacity-25"
          cx="12"
          cy="12"
          r="10"
          stroke="currentColor"
          strokeWidth="4"
        ></circle>
        <path
          className="opacity-75"
          fill="currentColor"
          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
        ></path>
      </svg>
    </div>
  );
}

function ProviderErrorState() {
  return (
    <div className="flex items-center justify-center h-full min-h-[200px]">
      <div className="border border-red-500/50 bg-red-500/10 rounded-lg p-4 max-w-md text-center">
        <div className="text-red-500 text-[14px] font-medium mb-1">
          There was an error running this provider. Please contact us by posting
          your issue to help us help you.
        </div>
      </div>
    </div>
  );
}
