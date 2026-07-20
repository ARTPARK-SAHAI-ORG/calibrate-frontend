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
import {
  PIPECAT_SEMANTIC_WER_URL,
  PIPECAT_STT_TTFS_URL,
  SARVAM_ASR_BLOG_URL,
} from "@/constants/links";
import { SARVAM_METRIC_FIELDS } from "./sarvamMetrics";
import {
  readEvaluatorCell,
  type EvaluatorColumnLike,
} from "./EvaluatorScoreCell";
import {
  type AudioCostBreakdown,
  costTiles,
  aggregateCostCaveats,
  formatMoney,
  readTotalCostUsd,
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
        // TTFS (Time To Final Segment) — streaming latency from when the user
        // stops speaking to the final transcription segment. Reported as a
        // latency block (`p50` headline) or a plain number. Present only when
        // the run measured it — `null` for providers that don't report it
        // (e.g. Gemini STT).
        ttfs?: LatencyMetric | number | null;
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
        // `null` for a provider that didn't report latency.
        ttfb?: LatencyMetric | null;
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

/** Whether any provider computed Sarvam LLM-judge metrics. Drives the STT
 * About-tab rows and CSV columns on both the detail and public pages. */
export function hasSarvamMetrics(
  providerResults:
    | Array<{ metrics?: Record<string, unknown> | null }>
    | null
    | undefined,
): boolean {
  return (providerResults ?? []).some(
    (pr) =>
      pr.metrics?.sarvam_llm_wer != null || pr.metrics?.sarvam_llm_cer != null,
  );
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

// STT latency is surfaced as "Latency" in the table/tiles; the About tab is
// where it's explained as TTFS (Time To Final Segment), the streaming STT
// latency defined by Pipecat's STT benchmark. The metric name links out to the
// benchmark's definition in a new tab. Rendered only when a run measured it.
export const TTFS_ABOUT_METRIC: MetricDescription = {
  key: "ttfs",
  metric: (
    <a
      href={PIPECAT_STT_TTFS_URL}
      target="_blank"
      rel="noopener noreferrer"
      className="text-foreground underline-offset-2 hover:underline"
      title="Learn more in the Pipecat STT benchmark"
    >
      Latency
    </a>
  ),
  description:
    "For streaming STT, latency is measured as TTFS (Time To Final Segment): the time from when the user stops speaking to when the final transcription segment is received. Lower is better \u2014 faster responses for voice agents. The reported value is the median (p50) across the dataset.",
  preference: "Lower is better",
  range: "0 - \u221E",
};

/**
 * Read a latency value in seconds from a TTFS/TTFB-style metric, tolerating
 * both the percentile block (`p50` headline, legacy `mean`) and a plain number.
 */
function readLatencySeconds(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (value && typeof value === "object") {
    const m = value as LatencyMetric;
    const v = m.p50 ?? m.mean;
    return typeof v === "number" && Number.isFinite(v) ? v : null;
  }
  return null;
}

/** Whether any provider measured TTFS. Drives the STT About-tab row. */
export function hasTtfsMetric(
  providerResults:
    | Array<{ metrics?: Record<string, unknown> | null }>
    | null
    | undefined,
): boolean {
  return (providerResults ?? []).some(
    (pr) => readLatencySeconds(pr.metrics?.ttfs) != null,
  );
}

export type EvaluatorColumnsVisibilityInput = {
  leaderboardSummary?: Array<Record<string, unknown>> | null;
  providerResults?: Array<Record<string, unknown>> | null;
};

/** Whether a run actually carries values for an evaluator column — used to
 * drop phantom defaults (e.g. the public page's legacy llm_judge fallback)
 * and all-"-" columns from About tabs, exports, etc. */
export function evaluatorColumnHasData(
  col: EvaluatorColumnLike,
  input: EvaluatorColumnsVisibilityInput,
): boolean {
  const scoreKey = col.scoreField ?? `${col.key}_score`;

  if ((input.leaderboardSummary ?? []).some((row) => row[scoreKey] != null)) {
    return true;
  }

  if (
    (input.providerResults ?? []).some((pr) => {
      const runs = pr.evaluator_runs;
      if (!Array.isArray(runs)) return false;
      return runs.some((run) => {
        if (!run || typeof run !== "object") return false;
        const metricKey = (run as { metric_key?: string }).metric_key;
        const aggregate = (run as { aggregate?: { mean?: unknown } | null })
          .aggregate;
        return (
          metricKey === col.key && aggregate != null && aggregate.mean != null
        );
      });
    })
  ) {
    return true;
  }

  return (input.providerResults ?? []).some((pr) => {
    const results = pr.results;
    if (!Array.isArray(results)) return false;
    return results.some((row) => {
      if (!row || typeof row !== "object") return false;
      const { score, error } = readEvaluatorCell(
        row as Record<string, unknown>,
        col,
      );
      return error || (score != null && score !== "");
    });
  });
}

export function visibleEvaluatorColumns<T extends EvaluatorColumnLike>(
  columns: T[],
  input: EvaluatorColumnsVisibilityInput,
): T[] {
  if (columns.length === 0) return [];
  return columns.filter((col) => evaluatorColumnHasData(col, input));
}

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

// STT latency lives on the `ttfs` row key (TTFS = Time To Final Segment) but is
// labelled "Latency (s)" in the UI, matching the TTS latency column; the About
// tab explains that STT latency is TTFS.
const TTFS_KEY = "ttfs";
const TTFS_LABEL = "Latency (s)";

/** Leaderboard column for TTFS (STT only). */
const ttfsLeaderboardColumn = {
  key: TTFS_KEY,
  header: TTFS_LABEL,
  render: (v: unknown) =>
    typeof v === "number" ? parseFloat(v.toFixed(4)) : "-",
};

/** Leaderboard chart for TTFS (STT only). */
const ttfsChartConfig: ChartConfig = { title: TTFS_LABEL, dataKey: TTFS_KEY };

// Total run cost in USD — the one cross-provider-comparable cost figure (the
// per-unit / native price stays on the per-provider Overall Metrics card).
// Shown as a leaderboard column + chart, keyed on the `cost_usd` joined by
// `withTotalCostUsd`.
const COST_USD_KEY = "cost_usd";
const COST_USD_LABEL = "Total cost";

/** Leaderboard column for total USD cost (shared by STT and TTS). */
const costLeaderboardColumn = {
  key: COST_USD_KEY,
  header: COST_USD_LABEL,
  render: (v: unknown) => (typeof v === "number" ? formatMoney(v, "USD") : "-"),
};

/** Leaderboard chart for total USD cost (shared by STT and TTS). */
const costChartConfig: ChartConfig = {
  title: COST_USD_LABEL,
  dataKey: COST_USD_KEY,
  formatTooltip: (v: number) => formatMoney(v, "USD"),
};

// Total run cost, explained on the STT/TTS About tab. Rendered only when a run
// computed a cost; the applicable estimate caveats show as prose below the table.
const COST_ABOUT_METRIC: MetricDescription = {
  key: "cost_usd",
  metric: `${COST_USD_LABEL}*`,
  description:
    "Estimated total cost (USD) to run this dataset through the provider.",
  preference: "Lower is better",
  range: "0 - ∞",
};

/** The cost caveats as a footnote: a single * marker, one point per line. */
function CostCaveatFootnote({ lines }: { lines: string[] }) {
  if (lines.length === 0) return null;
  return (
    <div className="text-[12px] text-muted-foreground space-y-0.5 pb-8 md:pb-10">
      {lines.map((line, i) => (
        <p key={i} className={i === 0 ? "" : "pl-3"}>
          {i === 0 ? `* ${line}` : line}
        </p>
      ))}
    </div>
  );
}

/**
 * Adds a derived numeric metric to leaderboard rows under `key`, reading it via
 * `read` (row → value, falling back to a joined provider value). Rows without a
 * value are left untouched; returns whether any row ended up with one.
 */
function withRowMetric(
  rows: LeaderboardSummaryForDetails[],
  key: string,
  read: (row: LeaderboardSummaryForDetails) => number | null,
): { rows: LeaderboardSummaryForDetails[]; show: boolean } {
  let show = false;
  const out = rows.map((row) => {
    const v = read(row);
    if (v == null) return row;
    show = true;
    return { ...row, [key]: v };
  });
  return { rows: out, show };
}

/**
 * Joins total USD cost onto leaderboard rows under a flat `cost_usd` key (the
 * comparable cost figure). Reads the cost off the row itself when the summary
 * carries it, otherwise off the matching provider result. Drives both the "Total
 * cost (USD)" leaderboard column/chart; the per-unit / native price stays on
 * the per-provider Overall Metrics card.
 */
function withTotalCostUsd(
  leaderboardSummary: LeaderboardSummaryForDetails[],
  providerResults?: Array<{
    provider: string;
    metrics?: Record<string, unknown> | null;
  }>,
): { rows: LeaderboardSummaryForDetails[]; showCost: boolean } {
  const costByRun: Record<string, number> = {};
  for (const pr of providerResults ?? []) {
    const c = readTotalCostUsd(pr.metrics);
    if (c != null) costByRun[pr.provider] = c;
  }
  const { rows, show } = withRowMetric(
    leaderboardSummary,
    COST_USD_KEY,
    (row) => costByRun[row.run] ?? readTotalCostUsd(row),
  );
  return { rows, showCost: show };
}

/**
 * Joins TTFS (seconds) onto STT leaderboard rows under a single flat `ttfs`
 * key. Reads the percentile headline (`ttfs_p50`) or legacy flat `ttfs` off the
 * row, falling back to the matching provider result's `ttfs` block.
 */
function withTtfs(
  leaderboardSummary: LeaderboardSummaryForDetails[],
  providerResults?: Array<{
    provider: string;
    metrics?: Record<string, unknown> | null;
  }>,
): { rows: LeaderboardSummaryForDetails[]; showTtfs: boolean } {
  const ttfsByRun: Record<string, number> = {};
  for (const pr of providerResults ?? []) {
    const t = readLatencySeconds(pr.metrics?.ttfs);
    if (t != null) ttfsByRun[pr.provider] = t;
  }
  const { rows, show } = withRowMetric(
    leaderboardSummary,
    TTFS_KEY,
    (row) =>
      readLatencySeconds(row.ttfs_p50) ??
      readLatencySeconds(row.ttfs) ??
      ttfsByRun[row.run] ??
      null,
  );
  return { rows, showTtfs: show };
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
  showTtfs = false,
  providerResults,
  runDate,
}: {
  evaluatorRows: EvaluatorAboutMetricRow[];
  /** Include the Sarvam LLM-judge metric rows — set when the run used them. */
  showSarvamMetrics?: boolean;
  /** Include the Semantic WER row — set when the run computed it. */
  showSemanticWer?: boolean;
  /** Include the TTFS row — set when the run measured it. */
  showTtfs?: boolean;
  /** Provider results — drive the cost row and its estimate caveats. */
  providerResults?: Array<{ metrics?: Record<string, unknown> | null }>;
  /** Run date (created_at) — dates the FX-conversion caveat. */
  runDate?: string | null;
}) {
  const costCaveatLines = aggregateCostCaveats(providerResults, { runDate });
  const showCost = costCaveatLines.length > 0;
  return (
    <div className="space-y-4 md:space-y-6">
      <AboutMetricsTable
        metrics={[
          WER_ABOUT_METRIC,
          CER_ABOUT_METRIC,
          ...(showSemanticWer ? [SEMANTIC_WER_ABOUT_METRIC] : []),
          ...(showSarvamMetrics ? SARVAM_ABOUT_METRICS : []),
          ...(showTtfs ? [TTFS_ABOUT_METRIC] : []),
          ...(showCost ? [COST_ABOUT_METRIC] : []),
          ...evaluatorRowsToMetricDescriptions(evaluatorRows),
        ]}
      />
      <CostCaveatFootnote lines={costCaveatLines} />
    </div>
  );
}

export function TTSEvaluationAbout({
  evaluatorRows,
  providerResults,
  runDate,
}: {
  evaluatorRows: EvaluatorAboutMetricRow[];
  /** Provider results — drive the cost row and its estimate caveats. */
  providerResults?: Array<{ metrics?: Record<string, unknown> | null }>;
  /** Run date (created_at) — dates the FX-conversion caveat. */
  runDate?: string | null;
}) {
  const costCaveatLines = aggregateCostCaveats(providerResults, { runDate });
  const showCost = costCaveatLines.length > 0;
  return (
    <div className="space-y-4 md:space-y-6">
      <AboutMetricsTable
        metrics={[
          ...evaluatorRowsToMetricDescriptions(evaluatorRows),
          TTFB_ABOUT_METRIC,
          ...(showCost ? [COST_ABOUT_METRIC] : []),
        ]}
      />
      <CostCaveatFootnote lines={costCaveatLines} />
    </div>
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

  // Join total USD cost (comparable) and TTFS onto each row for their columns
  // and charts.
  const withCost = withTotalCostUsd(leaderboardSummary, providerResults);
  const { rows, showTtfs } = withTtfs(withCost.rows, providerResults);
  const showCost = withCost.showCost;

  const visibleEvaluatorColumnsForLeaderboard = visibleEvaluatorColumns(
    evaluatorColumns,
    { leaderboardSummary, providerResults },
  );

  const allCharts: ChartConfig[] = [
    { title: "WER", dataKey: "wer" },
    { title: "CER", dataKey: "cer" },
    ...(showSemanticWer
      ? [{ title: "Semantic WER", dataKey: "semantic_wer" }]
      : []),
    ...sarvamFields.map((field) => ({
      title: field.label,
      dataKey: field.key,
    })),
    ...evaluatorChartConfigs(visibleEvaluatorColumnsForLeaderboard),
    ...(showTtfs ? [ttfsChartConfig] : []),
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
        ...sarvamFields.map((field) => ({
          key: field.key,
          header: field.label,
        })),
        ...evaluatorLeaderboardColumns(visibleEvaluatorColumnsForLeaderboard),
        ...(showTtfs ? [ttfsLeaderboardColumn] : []),
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

  // Join total USD cost (comparable) onto each row for the cost column/chart;
  // the per-unit / native price stays on the per-provider card.
  const { rows, showCost } = withTotalCostUsd(
    leaderboardSummary,
    providerResults,
  );

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
                        ? [
                            {
                              label: field.label,
                              value: parseFloat(value.toFixed(4)),
                            },
                          ]
                        : [];
                    }),
                    // TTFS tile — shown only when the run measured it.
                    ...(readLatencySeconds(providerResult.metrics?.ttfs) != null
                      ? [
                          {
                            label: TTFS_LABEL,
                            value: parseFloat(
                              readLatencySeconds(
                                providerResult.metrics?.ttfs,
                              )!.toFixed(4),
                            ),
                          },
                        ]
                      : []),
                    // Cost tiles — total USD cost + native per-unit price.
                    // Shown only when the run computed cost.
                    ...costTiles(providerResult.metrics),
                    // Evaluator tiles — shown only when this provider actually
                    // has a value for the evaluator (mirrors the Sarvam tiles),
                    // so e.g. a "Semantic match" tile is hidden when it didn't
                    // run rather than rendering "-".
                    ...evaluatorColumns.flatMap((col) => {
                      const mean = readProviderEvaluatorMean(
                        col,
                        providerResult,
                      );
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
                    // Cost tiles — total USD cost + native per-unit price.
                    // Shown only when the run computed cost.
                    ...costTiles(providerResult.metrics),
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
