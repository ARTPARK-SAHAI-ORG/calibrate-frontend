/**
 * Builds Pareto-frontier points for the STT and TTS leaderboards, mirroring the
 * LLM benchmark's cost-vs-quality-vs-latency scatter.
 *
 * The shared axes are: total run cost in USD on X (lower better) — the one
 * cross-provider-comparable cost figure, since providers bill in different
 * units/currencies — a 0–100 quality score on Y (higher better), and latency as
 * the bubble size / third objective (lower better). Latency is passed to the
 * chart in milliseconds (× 1000 from the seconds the STT/TTS runs report) so the
 * existing `formatLatencyMs` / bubble sizing apply unchanged.
 *
 *   - STT quality = accuracy = 1 − Semantic WER (falling back to 1 − WER when a
 *     run didn't compute Semantic WER), clamped to 0–100%.
 *   - TTS quality = the primary (first attached) evaluator's aggregate score
 *     normalized to 0–100% (binary → pass %, rating → % of its scale max).
 */

import type { ParetoModelPoint } from "@/components/charts/ParetoFrontierChart";
import { isValidParetoPoint } from "@/lib/paretoFrontier";
import { readTotalCostUsd } from "@/lib/audioCost";

const SECONDS_TO_MS = 1000;

type Row = { run: string; [k: string]: unknown };

/** Column shape both STTEvaluatorColumn and TTSEvaluatorColumn satisfy. */
type EvaluatorColumnLike = {
  key: string;
  outputType: "binary" | "rating";
  scoreField?: string;
  scaleMax?: number | null;
};

function toFiniteNumber(v: unknown): number | null {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
}

function clampPercent(pct: number): number {
  return Math.max(0, Math.min(100, pct));
}

/** STT accuracy (%) from 1 − Semantic WER (fallback 1 − WER). Null when neither. */
export function sttAccuracyPercent(row: Row): number | null {
  const wer = toFiniteNumber(row.semantic_wer) ?? toFiniteNumber(row.wer);
  if (wer == null) return null;
  return clampPercent((1 - wer) * 100);
}

/** TTS quality (%) from the primary evaluator's aggregate. Null when unavailable. */
export function ttsQualityPercent(
  row: Row,
  primaryColumn: EvaluatorColumnLike | undefined,
): number | null {
  if (!primaryColumn) return null;
  const raw = toFiniteNumber(
    row[primaryColumn.scoreField ?? `${primaryColumn.key}_score`],
  );
  if (raw == null) return null;
  if (primaryColumn.outputType === "binary") return clampPercent(raw * 100);
  const max =
    typeof primaryColumn.scaleMax === "number" ? primaryColumn.scaleMax : null;
  if (max == null || max <= 0) return null;
  return clampPercent((raw / max) * 100);
}

function latencyMs(seconds: number | null): number | undefined {
  return seconds != null ? seconds * SECONDS_TO_MS : undefined;
}

/** Pareto points for the STT leaderboard (accuracy vs cost, TTFS as latency). */
export function buildSttParetoPoints(
  rows: Row[],
  getLabel: (run: string) => string,
): ParetoModelPoint[] {
  return rows.map((row) => ({
    model: row.run,
    label: getLabel(row.run),
    cost: readTotalCostUsd(row) ?? NaN,
    passRate: sttAccuracyPercent(row) ?? NaN,
    latency: latencyMs(
      toFiniteNumber(row.ttfs) ?? toFiniteNumber(row.ttfs_p50),
    ),
  }));
}

/** Pareto points for the TTS leaderboard (primary evaluator vs cost, TTFB latency). */
export function buildTtsParetoPoints(
  rows: Row[],
  evaluatorColumns: EvaluatorColumnLike[],
  getLabel: (run: string) => string,
): ParetoModelPoint[] {
  const primary = evaluatorColumns[0];
  return rows.map((row) => ({
    model: row.run,
    label: getLabel(row.run),
    cost: readTotalCostUsd(row) ?? NaN,
    passRate: ttsQualityPercent(row, primary) ?? NaN,
    latency: latencyMs(
      toFiniteNumber(row.ttfb_p50) ?? toFiniteNumber(row.ttfb),
    ),
  }));
}

/** How many points have both a finite cost and quality — the Pareto chart's minimum. */
export function countValidParetoPoints(points: ParetoModelPoint[]): number {
  return points.filter(isValidParetoPoint).length;
}
