/**
 * Shared evaluator-column derivation for the STT and TTS detail pages.
 *
 * Both pages need to derive a set of evaluator columns from the response
 * payload, used by the per-row results table, the per-provider metrics
 * card, and the leaderboard. There are four shapes the backend has emitted
 * over time — we walk them in priority order:
 *
 *   1) New format — `evaluator_runs[]` on each provider. Each entry has
 *      stable `evaluator_uuid`, the artefact column key (`metric_key`),
 *      the live `name`, an `output_type`, and the `aggregate` block (with
 *      `scale_min` / `scale_max` for rating evaluators).
 *
 *   2a) Legacy `_info` format — `${prefix}_info` metric keys on the first
 *       provider's `metrics`. The per-row column is `${prefix}_score`.
 *
 *   2b) Intermediate format used while a run is still in_progress and
 *       `evaluator_runs` hasn't been populated yet — the evaluator metric
 *       lives on `metrics` under its display name as `{ type, mean }`,
 *       and per-row columns share the raw evaluator name with reasoning
 *       at `"<name>_reasoning"`.
 *
 *   3) Truly legacy single-evaluator jobs — synthesise one column reading
 *      `result.llm_judge_score` / `result.llm_judge_reasoning`, attributed
 *      to the task's default evaluator.
 *
 * The only difference between STT and TTS callers is which metric keys are
 * reserved (and therefore skipped in branches 2a/2b): WER & friends for
 * STT, TTFB & friends for TTS.
 */

export type EvaluatorColumnOutputType = "binary" | "rating";

export type DerivedEvaluatorColumn = {
  key: string;
  label: string;
  outputType: EvaluatorColumnOutputType;
  evaluatorUuid?: string;
  scoreField: string;
  reasoningField: string;
  scaleMin?: number | null;
  scaleMax?: number | null;
};

type AggregateLike = {
  type?: string;
  scale_min?: number | null;
  scale_max?: number | null;
};

export type EvaluatorRunForColumns = {
  evaluator_uuid: string;
  metric_key: string;
  aggregate?: AggregateLike | null;
  name?: string;
  output_type?: EvaluatorColumnOutputType;
};

export type ProviderForColumns = {
  metrics?: Record<string, unknown> | null;
  evaluator_runs?: EvaluatorRunForColumns[] | null;
};

export type AboutEvaluatorLite = {
  uuid: string;
  name: string;
  outputType?: EvaluatorColumnOutputType;
};

export type SingleJudgeFallback = {
  /** Column key for the legacy single-judge column (defaults to "llm_judge"). */
  key?: string;
  scoreField?: string;
  reasoningField?: string;
  /** Default evaluator's uuid, used to resolve a friendly label from `aboutEvaluators`. */
  defaultEvaluatorUuid?: string | null;
  /** Header label when no friendly evaluator name can be resolved. */
  defaultLabel: string;
  /** Output type when no friendly evaluator can be resolved. */
  defaultOutputType?: EvaluatorColumnOutputType;
};

export function deriveEvaluatorColumns({
  providerResults,
  aboutEvaluators,
  reservedMetricKeys,
  singleJudgeFallback,
}: {
  providerResults: ProviderForColumns[];
  aboutEvaluators: AboutEvaluatorLite[];
  /** Metric keys that should be skipped when scanning for evaluator metrics. */
  reservedMetricKeys: ReadonlySet<string>;
  singleJudgeFallback: SingleJudgeFallback;
}): DerivedEvaluatorColumn[] {
  // (1) New format — evaluator_runs[].
  const firstRuns = providerResults
    .map((pr) => pr.evaluator_runs)
    .find(
      (er): er is EvaluatorRunForColumns[] =>
        Array.isArray(er) && er.length > 0,
    );
  if (firstRuns) {
    return firstRuns.map((run) => ({
      key: run.metric_key,
      label: run.name ?? run.metric_key,
      // Backend now supplies `output_type` directly; fall back to inferring
      // from the aggregate.type for older cached responses.
      outputType:
        run.output_type === "rating" || run.output_type === "binary"
          ? run.output_type
          : run.aggregate?.type === "rating"
            ? "rating"
            : "binary",
      evaluatorUuid: run.evaluator_uuid,
      scoreField: run.metric_key,
      reasoningField: `${run.metric_key}_reasoning`,
      scaleMin: run.aggregate?.scale_min ?? null,
      scaleMax: run.aggregate?.scale_max ?? null,
    }));
  }

  // (2) Legacy `_info` and intermediate bare-name formats.
  const firstMetrics = providerResults
    .map((pr) => pr.metrics)
    .find((m): m is Record<string, unknown> => !!m);

  type ColInfo = {
    key: string;
    outputType: EvaluatorColumnOutputType;
    scoreField: string;
    reasoningField: string;
  };
  const dataDriven: ColInfo[] = [];
  if (firstMetrics) {
    for (const k of Object.keys(firstMetrics)) {
      if (reservedMetricKeys.has(k)) continue;
      if (k.endsWith("_info")) {
        const prefix = k.slice(0, -"_info".length);
        const info = firstMetrics[k] as { type?: string } | undefined;
        dataDriven.push({
          key: prefix,
          outputType: info?.type === "rating" ? "rating" : "binary",
          scoreField: `${prefix}_score`,
          reasoningField: `${prefix}_reasoning`,
        });
        continue;
      }
      // (2b) — `{ type, mean }` shape under the evaluator's display name.
      const v = firstMetrics[k];
      if (
        v &&
        typeof v === "object" &&
        !Array.isArray(v) &&
        "type" in (v as Record<string, unknown>)
      ) {
        const info = v as { type?: string };
        dataDriven.push({
          key: k,
          outputType: info.type === "rating" ? "rating" : "binary",
          scoreField: k,
          reasoningField: `${k}_reasoning`,
        });
      }
    }
  }

  if (dataDriven.length > 0) {
    return dataDriven.map((c) => {
      const a = aboutEvaluators.find((e) => e.name === c.key);
      return {
        key: c.key,
        // The label is the evaluator's stored name. Falls back to the raw
        // data prefix when the about-fetch hasn't resolved (e.g. mid-poll);
        // the label updates once the detail-fetch lands.
        label: a ? a.name : c.key,
        outputType: c.outputType,
        scoreField: c.scoreField,
        reasoningField: c.reasoningField,
      };
    });
  }

  // (3) Legacy single-evaluator fallback.
  const fallback = singleJudgeFallback;
  const defaultAbout = fallback.defaultEvaluatorUuid
    ? aboutEvaluators.find((e) => e.uuid === fallback.defaultEvaluatorUuid)
    : undefined;
  return [
    {
      key: fallback.key ?? "llm_judge",
      label: defaultAbout?.name ?? fallback.defaultLabel,
      outputType:
        defaultAbout?.outputType ?? fallback.defaultOutputType ?? "binary",
      scoreField: fallback.scoreField ?? "llm_judge_score",
      reasoningField: fallback.reasoningField ?? "llm_judge_reasoning",
    },
  ];
}

/** STT-specific reserved keys — neither WER, string-similarity, nor the legacy
 * llm_judge_score column should be treated as an evaluator metric. */
export const STT_RESERVED_METRIC_KEYS: ReadonlySet<string> = new Set([
  "wer",
  "string_similarity",
  "llm_judge_score",
]);

/** TTS-specific reserved keys — skip latency / processing-time / legacy llm_judge. */
export const TTS_RESERVED_METRIC_KEYS: ReadonlySet<string> = new Set([
  "llm_judge_score",
  "ttfb",
  "processing_time",
]);
