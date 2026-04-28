/**
 * Optional aggregate per benchmark `model_results[].evaluator_summary`
 * (metrics.json criteria — response judges only). Absent on older jobs or until a model finishes.
 */

import type { ChartConfig } from "@/components/eval-details/LeaderboardTab";

export type BenchmarkEvaluatorSummaryBinary = {
  metric_key: string;
  name?: string;
  description?: string | null;
  evaluator_uuid?: string | null;
  type: "binary";
  passed: number;
  total: number;
  /** 0–100 */
  pass_rate: number;
};

export type BenchmarkEvaluatorSummaryRating = {
  metric_key: string;
  name?: string;
  description?: string | null;
  evaluator_uuid?: string | null;
  type: "rating";
  mean: number;
  min: number;
  max: number;
  count: number;
  scale_min: number;
  scale_max: number;
};

export type BenchmarkEvaluatorSummaryEntry =
  | BenchmarkEvaluatorSummaryBinary
  | BenchmarkEvaluatorSummaryRating;

export type BenchmarkModelLike = {
  model: string;
  evaluator_summary?: BenchmarkEvaluatorSummaryEntry[] | null;
};

export type BenchmarkLeaderboardSummaryRow = {
  model: string;
  passed?: string;
  total?: string;
  pass_rate: string;
};

export type BenchmarkCombinedEvaluatorColumn = {
  metric_key: string;
  dataKey: string;
  label: string;
  type: "binary" | "rating";
  scale_min?: number;
  scale_max?: number;
  description?: string | null;
};

export type BenchmarkCombinedLeaderboardPayload = {
  rows: Record<string, unknown>[];
  chartRows: ChartConfig[][];
  plan: {
    showPassedTotal: boolean;
    showOverallPassRate: boolean;
    evaluators: BenchmarkCombinedEvaluatorColumn[];
  };
};

/** Table header and chart title for rating evaluators: `Name (min–max)` when scale is finite. */
export function benchmarkRatingEvaluatorCaption(
  label: string,
  scale_min: number | undefined,
  scale_max: number | undefined,
): string {
  if (Number.isFinite(scale_min) && Number.isFinite(scale_max)) {
    return `${label} (${scale_min}\u2013${scale_max})`;
  }
  return label;
}

/** Stable column key per evaluator metric (matches row keys). */
export function benchmarkEvaluatorColumnKey(metric_key: string): string {
  const safe =
    metric_key.replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_|_$/g, "") ||
    "metric";
  return `ev_${safe}`;
}

/** Collect ordered metric keys from first-seen order across models. */
export function benchmarkMetricKeyOrder(models: BenchmarkModelLike[]): string[] {
  const keys: string[] = [];
  const seen = new Set<string>();
  for (const m of models) {
    for (const e of m.evaluator_summary ?? []) {
      if (!seen.has(e.metric_key)) {
        seen.add(e.metric_key);
        keys.push(e.metric_key);
      }
    }
  }
  return keys;
}

function firstEntryForMetric(
  models: BenchmarkModelLike[],
  metric_key: string,
): BenchmarkEvaluatorSummaryEntry | undefined {
  for (const m of models) {
    const found = (m.evaluator_summary ?? []).find((e) => e.metric_key === metric_key);
    if (found) return found;
  }
  return undefined;
}

/**
 * Map `leaderboard_summary.model` to the same string used in `model_results[].model` when the
 * backend sends mismatched shapes for one logical model (e.g. `gpt-4.1` vs `openai/gpt-4.1`).
 * Prefer the `model_results` identifier. When multiple `model_results` rows could match a short
 * name, keep `raw` unchanged.
 */
export function benchmarkCanonicalModelId(
  raw: string,
  modelResults: BenchmarkModelLike[],
): string {
  const exact = modelResults.find((m) => m.model === raw);
  if (exact) return exact.model;

  if (!raw.includes("/")) {
    const suffixMatches = modelResults.filter(
      (m) => m.model === raw || m.model.endsWith("/" + raw),
    );
    if (suffixMatches.length === 1) return suffixMatches[0].model;
  }

  return raw;
}

function orderedCanonicalModels(
  leaderboardSummary: BenchmarkLeaderboardSummaryRow[] | undefined,
  modelResults: BenchmarkModelLike[],
): string[] {
  const out: string[] = [];
  const seen = new Set<string>();

  for (const s of leaderboardSummary ?? []) {
    const c = benchmarkCanonicalModelId(s.model, modelResults);
    if (!seen.has(c)) {
      seen.add(c);
      out.push(c);
    }
  }

  for (const m of modelResults) {
    if (!seen.has(m.model)) {
      seen.add(m.model);
      out.push(m.model);
    }
  }

  return out;
}

/**
 * Single leaderboard table row data + chart configs (packed two charts per row),
 * mirroring STT/TTS `LeaderboardTab` layout.
 * Returns null when there is no leaderboard row and no evaluator summaries.
 */
export function buildBenchmarkCombinedLeaderboardPayload(
  leaderboardSummary: BenchmarkLeaderboardSummaryRow[] | undefined,
  modelResults: BenchmarkModelLike[],
  benchmarkScoreLabel: string,
): BenchmarkCombinedLeaderboardPayload | null {
  const keys = benchmarkMetricKeyOrder(modelResults);
  const showOverallPassRate =
    Array.isArray(leaderboardSummary) && leaderboardSummary.length > 0;
  const showPassedTotal = showOverallPassRate;

  const evaluators: BenchmarkCombinedEvaluatorColumn[] = [];
  for (const metric_key of keys) {
    const meta = firstEntryForMetric(modelResults, metric_key);
    if (!meta) continue;

    const dataKey = benchmarkEvaluatorColumnKey(metric_key);
    const label = meta.name ?? metric_key;

    if (meta.type === "binary") {
      evaluators.push({
        metric_key,
        dataKey,
        label,
        type: "binary",
        description: meta.description,
      });
    } else {
      evaluators.push({
        metric_key,
        dataKey,
        label,
        type: "rating",
        scale_min: meta.scale_min,
        scale_max: meta.scale_max,
        description: meta.description,
      });
    }
  }

  if (!showOverallPassRate && evaluators.length === 0) return null;

  const modelsOrdered = orderedCanonicalModels(leaderboardSummary, modelResults);
  const rows: Record<string, unknown>[] = [];

  for (const model of modelsOrdered) {
    const lbRow = leaderboardSummary?.find(
      (s) => benchmarkCanonicalModelId(s.model, modelResults) === model,
    );
    const mr = modelResults.find((x) => x.model === model);

    const row: Record<string, unknown> = { model };

    if (lbRow) {
      row.passed = lbRow.passed;
      row.total = lbRow.total;
      const pr = parseFloat(lbRow.pass_rate);
      row.pass_rate = Number.isFinite(pr) ? pr : undefined;
    }

    for (const ev of evaluators) {
      const entry = (mr?.evaluator_summary ?? []).find(
        (e) => e.metric_key === ev.metric_key,
      );
      if (!entry) {
        row[ev.dataKey] = undefined;
      } else if (entry.type === "binary") {
        row[ev.dataKey] = entry.pass_rate;
      } else {
        row[ev.dataKey] = entry.mean;
      }
    }

    rows.push(row);
  }

  const allCharts: ChartConfig[] = [];

  if (showOverallPassRate) {
    allCharts.push({
      title: benchmarkScoreLabel,
      dataKey: "pass_rate",
      yDomain: [0, 100],
      formatTooltip: (v) => `${v.toFixed(1)}%`,
    });
  }

  for (const ev of evaluators) {
    if (ev.type === "binary") {
      allCharts.push({
        title: ev.label,
        dataKey: ev.dataKey,
        yDomain: [0, 100],
        formatTooltip: (v) => `${v.toFixed(1)}%`,
      });
    } else {
      const sm = ev.scale_min;
      const sx = ev.scale_max;
      const yDomain: [number, number] =
        Number.isFinite(sm) && Number.isFinite(sx)
          ? [sm as number, sx as number]
          : [0, 5];
      allCharts.push({
        title: benchmarkRatingEvaluatorCaption(ev.label, sm, sx),
        dataKey: ev.dataKey,
        yDomain,
        formatTooltip: (v) => v.toFixed(2),
      });
    }
  }

  const chartRows: ChartConfig[][] = [];
  for (let i = 0; i < allCharts.length; i += 2) {
    chartRows.push(allCharts.slice(i, i + 2));
  }

  return {
    rows,
    chartRows,
    plan: {
      showPassedTotal,
      showOverallPassRate,
      evaluators,
    },
  };
}
