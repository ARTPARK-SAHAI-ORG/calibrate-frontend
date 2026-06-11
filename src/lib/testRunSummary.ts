/**
 * Single-model test runs don't ship a backend `evaluator_summary` block (only
 * benchmarks do, per model). So we aggregate the per-case `judge_results` into
 * the same `BenchmarkEvaluatorSummaryEntry` shape the benchmark leaderboard
 * uses — binary evaluators → pass rate, rating evaluators → mean — so the test
 * Summary tab can render per-evaluator metrics with the same cards.
 */

import type { JudgeResult, TestRunEvaluator } from "@/components/test-results/shared";
import type { BenchmarkEvaluatorSummaryEntry } from "./benchmarkEvaluatorSummary";

type ResultLike = { judge_results?: JudgeResult[] | null };

/**
 * Group every row's `judge_results` by evaluator and produce one aggregate
 * entry per evaluator (first-seen order). Binary evaluators count `match`
 * verdicts; rating evaluators average `score`. Rows without a verdict for an
 * evaluator are skipped, so `count`/`total` reflect only scored cases.
 * Returns `[]` when no row carries judge results.
 */
export function buildEvaluatorSummaryFromResults(
  results: ResultLike[],
  evaluatorsByUuid: Record<string, TestRunEvaluator>,
): BenchmarkEvaluatorSummaryEntry[] {
  const order: string[] = [];
  const byUuid = new Map<string, JudgeResult[]>();

  for (const r of results) {
    const jrs = r.judge_results;
    if (!Array.isArray(jrs)) continue;
    for (const jr of jrs) {
      const uuid = jr.evaluator_uuid;
      if (!uuid) continue;
      if (!byUuid.has(uuid)) {
        byUuid.set(uuid, []);
        order.push(uuid);
      }
      byUuid.get(uuid)!.push(jr);
    }
  }

  const out: BenchmarkEvaluatorSummaryEntry[] = [];
  for (const uuid of order) {
    const jrs = byUuid.get(uuid)!;
    const ev = evaluatorsByUuid[uuid];
    const name = ev?.name;
    const description = ev?.description ?? null;

    // A rating evaluator is identified by its metadata, or — for legacy rows
    // without metadata — by any numeric `score` verdict.
    const isRating =
      ev?.output_type === "rating" ||
      (ev?.output_type !== "binary" &&
        jrs.some((j) => j.score !== null && j.score !== undefined));

    if (isRating) {
      const scores = jrs
        .map((j) => j.score)
        .filter((s): s is number => typeof s === "number" && Number.isFinite(s));
      if (scores.length === 0) continue;
      const sum = scores.reduce((a, b) => a + b, 0);
      out.push({
        metric_key: uuid,
        name,
        description,
        evaluator_uuid: uuid,
        type: "rating",
        mean: sum / scores.length,
        min: Math.min(...scores),
        max: Math.max(...scores),
        count: scores.length,
        scale_min: typeof ev?.scale_min === "number" ? ev.scale_min : NaN,
        scale_max: typeof ev?.scale_max === "number" ? ev.scale_max : NaN,
      });
    } else {
      const matches = jrs
        .map((j) => j.match)
        .filter((m): m is boolean => typeof m === "boolean");
      if (matches.length === 0) continue;
      const passed = matches.filter(Boolean).length;
      out.push({
        metric_key: uuid,
        name,
        description,
        evaluator_uuid: uuid,
        type: "binary",
        passed,
        total: matches.length,
        pass_rate: (passed / matches.length) * 100,
      });
    }
  }

  return out;
}
