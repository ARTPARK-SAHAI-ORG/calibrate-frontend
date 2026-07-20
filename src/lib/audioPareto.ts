/**
 * Builds Pareto-frontier points for the STT and TTS "Model selection" tabs,
 * mirroring the LLM benchmark's cost-vs-quality-vs-latency scatter.
 *
 * The shared axes are: total run cost in USD on X (lower better) — the one
 * cross-provider-comparable cost figure, since providers bill in different
 * units/currencies — a 0–100 quality score on Y (higher better), and latency as
 * the bubble size / third objective (lower better). Latency is passed to the
 * chart in milliseconds (× 1000 from the seconds the STT/TTS runs report) so the
 * existing `formatLatencyMs` / bubble sizing apply unchanged.
 *
 * The quality axis is selectable. STT offers accuracy (1 − error rate) from each
 * of Semantic WER / WER / CER, plus each LLM judge. TTS offers each LLM judge.
 * Only metrics that have a cost and a value for 2+ providers are offered.
 */

import type { ParetoModelPoint } from "@/components/charts/ParetoFrontierChart";
import { isValidParetoPoint } from "@/lib/paretoFrontier";
import { readTotalCostUsd } from "@/lib/audioCost";

const SECONDS_TO_MS = 1000;

type Row = { run: string; [k: string]: unknown };

/** Column shape both STTEvaluatorColumn and TTSEvaluatorColumn satisfy. */
type EvaluatorColumnLike = {
  key: string;
  label: string;
  outputType: "binary" | "rating";
  scoreField?: string;
  scaleMax?: number | null;
};

/** A selectable quality measure for the Model selection chart's Y axis. */
export type AudioQualityMetric = {
  /** Stable id for the picker + React key. */
  id: string;
  /** Picker option text and Y-axis label. */
  label: string;
  /** Quality noun for the chart caption ("accuracy" / "quality"). */
  qualityNoun: string;
  /** Comparative phrase for the caption ("how accurate it is" / "how well it scores"). */
  qualityComparative: string;
  /** Row → 0–100 score (higher is better), or null when the row lacks it. */
  score: (row: Row) => number | null;
};

function toFiniteNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function clampPercent(pct: number): number {
  return Math.max(0, Math.min(100, pct));
}

/** An LLM judge's aggregate as a 0–100 score. Null when unavailable. */
export function evaluatorScorePercent(
  row: Row,
  column: EvaluatorColumnLike,
): number | null {
  const raw = toFiniteNumber(row[column.scoreField ?? `${column.key}_score`]);
  if (raw == null) return null;
  if (column.outputType === "binary") return clampPercent(raw * 100);
  const max = typeof column.scaleMax === "number" ? column.scaleMax : null;
  if (max == null || max <= 0) return null;
  return clampPercent((raw / max) * 100);
}

function latencyMs(seconds: number | null): number | undefined {
  return seconds != null ? seconds * SECONDS_TO_MS : undefined;
}

/** STT latency (ms) from TTFS (percentile headline or legacy flat key). */
function sttLatencyMs(row: Row): number | undefined {
  return latencyMs(toFiniteNumber(row.ttfs) ?? toFiniteNumber(row.ttfs_p50));
}

/** TTS latency (ms) from TTFB (percentile headline or legacy flat key). */
function ttsLatencyMs(row: Row): number | undefined {
  return latencyMs(toFiniteNumber(row.ttfb_p50) ?? toFiniteNumber(row.ttfb));
}

/** A metric is offered only when 2+ providers have both a cost and its value. */
function isPlottable(rows: Row[], score: (row: Row) => number | null): boolean {
  return (
    rows.filter((r) => readTotalCostUsd(r) != null && score(r) != null).length >=
    2
  );
}

// STT error rates, best-first: the default is the first one present.
const STT_ERROR_METRICS = [
  { key: "semantic_wer", name: "Semantic WER" },
  { key: "wer", name: "WER" },
  { key: "cer", name: "CER" },
] as const;

/** Quality metrics the STT chart can plot: accuracy from each error rate, then each judge. */
export function sttQualityMetrics(
  rows: Row[],
  evaluatorColumns: EvaluatorColumnLike[],
): AudioQualityMetric[] {
  const metrics: AudioQualityMetric[] = [];
  for (const { key, name } of STT_ERROR_METRICS) {
    const score = (row: Row) => {
      const rate = toFiniteNumber(row[key]);
      return rate == null ? null : clampPercent((1 - rate) * 100);
    };
    if (isPlottable(rows, score)) {
      metrics.push({
        id: key,
        label: `Accuracy (${name})`,
        qualityNoun: "accuracy",
        qualityComparative: "how accurate it is",
        score,
      });
    }
  }
  for (const col of evaluatorColumns) {
    const score = (row: Row) => evaluatorScorePercent(row, col);
    if (isPlottable(rows, score)) {
      metrics.push({
        id: `judge:${col.key}`,
        label: col.label,
        qualityNoun: "quality",
        qualityComparative: "how well it scores",
        score,
      });
    }
  }
  return metrics;
}

/** Quality metrics the TTS chart can plot: each LLM judge with data. */
export function ttsQualityMetrics(
  rows: Row[],
  evaluatorColumns: EvaluatorColumnLike[],
): AudioQualityMetric[] {
  const metrics: AudioQualityMetric[] = [];
  for (const col of evaluatorColumns) {
    const score = (row: Row) => evaluatorScorePercent(row, col);
    if (isPlottable(rows, score)) {
      metrics.push({
        id: `judge:${col.key}`,
        label: col.label,
        qualityNoun: "quality",
        qualityComparative: "how well it scores",
        score,
      });
    }
  }
  return metrics;
}

/** Pareto points for a chosen quality metric (STT reads TTFS latency, TTS reads TTFB). */
export function buildAudioParetoPoints(
  rows: Row[],
  getLabel: (run: string) => string,
  metric: AudioQualityMetric,
  kind: "stt" | "tts",
): ParetoModelPoint[] {
  const latencyOf = kind === "stt" ? sttLatencyMs : ttsLatencyMs;
  return rows.map((row) => ({
    model: row.run,
    label: getLabel(row.run),
    cost: readTotalCostUsd(row) ?? NaN,
    passRate: metric.score(row) ?? NaN,
    latency: latencyOf(row),
  }));
}

/** How many points have both a finite cost and quality — the Pareto chart's minimum. */
export function countValidParetoPoints(points: ParetoModelPoint[]): number {
  return points.filter(isValidParetoPoint).length;
}
