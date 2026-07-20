import {
  deriveEvaluatorColumns,
  STT_RESERVED_METRIC_KEYS,
  TTS_RESERVED_METRIC_KEYS,
  type ProviderForColumns,
  type AboutEvaluatorLite,
} from "../evaluatorColumns";

describe("STT_RESERVED_METRIC_KEYS / TTS_RESERVED_METRIC_KEYS", () => {
  it("contains the expected STT keys", () => {
    expect([...STT_RESERVED_METRIC_KEYS]).toEqual([
      "wer",
      "cer",
      "string_similarity",
      "sarvam_llm_wer",
      "sarvam_llm_cer",
      "sarvam_intent_score",
      "sarvam_entity_score",
      "llm_judge_score",
      "ttfs",
      "ttfs_p50",
      "ttfs_p95",
      "ttfs_p99",
    ]);
  });

  it("contains the expected TTS keys", () => {
    expect([...TTS_RESERVED_METRIC_KEYS]).toEqual([
      "llm_judge_score",
      "ttfb",
      "ttfb_p50",
      "ttfb_p95",
      "ttfb_p99",
      "processing_time",
    ]);
  });
});

describe("deriveEvaluatorColumns", () => {
  describe("(1) new evaluator_runs format", () => {
    it("derives columns from the first provider with a non-empty evaluator_runs array", () => {
      const providerResults: ProviderForColumns[] = [
        { evaluator_runs: [] },
        {
          evaluator_runs: [
            {
              evaluator_uuid: "u1",
              metric_key: "politeness",
              name: "Politeness",
              output_type: "binary",
              aggregate: { type: "binary" },
            },
            {
              evaluator_uuid: "u2",
              metric_key: "coherence",
              name: "Coherence",
              output_type: "rating",
              aggregate: { type: "rating", scale_min: 1, scale_max: 5 },
            },
          ],
        },
        { evaluator_runs: [{ evaluator_uuid: "u3", metric_key: "unused" }] },
      ];

      const result = deriveEvaluatorColumns({
        providerResults,
        aboutEvaluators: [],
        reservedMetricKeys: new Set(),
        singleJudgeFallback: { defaultLabel: "LLM Judge" },
      });

      expect(result).toEqual([
        {
          key: "politeness",
          label: "Politeness",
          outputType: "binary",
          evaluatorUuid: "u1",
          scoreField: "politeness",
          reasoningField: "politeness_reasoning",
          scaleMin: null,
          scaleMax: null,
        },
        {
          key: "coherence",
          label: "Coherence",
          outputType: "rating",
          evaluatorUuid: "u2",
          scoreField: "coherence",
          reasoningField: "coherence_reasoning",
          scaleMin: 1,
          scaleMax: 5,
        },
      ]);
    });

    it("falls back to metric_key as label when name is missing", () => {
      const providerResults: ProviderForColumns[] = [
        {
          evaluator_runs: [
            { evaluator_uuid: "u1", metric_key: "politeness" },
          ],
        },
      ];
      const [col] = deriveEvaluatorColumns({
        providerResults,
        aboutEvaluators: [],
        reservedMetricKeys: new Set(),
        singleJudgeFallback: { defaultLabel: "LLM Judge" },
      });
      expect(col.label).toBe("politeness");
    });

    it("infers rating output_type from aggregate.type when output_type is absent", () => {
      const providerResults: ProviderForColumns[] = [
        {
          evaluator_runs: [
            {
              evaluator_uuid: "u1",
              metric_key: "coherence",
              aggregate: { type: "rating" },
            },
          ],
        },
      ];
      const [col] = deriveEvaluatorColumns({
        providerResults,
        aboutEvaluators: [],
        reservedMetricKeys: new Set(),
        singleJudgeFallback: { defaultLabel: "LLM Judge" },
      });
      expect(col.outputType).toBe("rating");
    });

    it("defaults to binary output_type when output_type and aggregate.type are both absent", () => {
      const providerResults: ProviderForColumns[] = [
        {
          evaluator_runs: [{ evaluator_uuid: "u1", metric_key: "politeness" }],
        },
      ];
      const [col] = deriveEvaluatorColumns({
        providerResults,
        aboutEvaluators: [],
        reservedMetricKeys: new Set(),
        singleJudgeFallback: { defaultLabel: "LLM Judge" },
      });
      expect(col.outputType).toBe("binary");
    });

    it("defaults to binary output_type when aggregate is null", () => {
      const providerResults: ProviderForColumns[] = [
        {
          evaluator_runs: [
            { evaluator_uuid: "u1", metric_key: "politeness", aggregate: null },
          ],
        },
      ];
      const [col] = deriveEvaluatorColumns({
        providerResults,
        aboutEvaluators: [],
        reservedMetricKeys: new Set(),
        singleJudgeFallback: { defaultLabel: "LLM Judge" },
      });
      expect(col.outputType).toBe("binary");
      expect(col.scaleMin).toBeNull();
      expect(col.scaleMax).toBeNull();
    });

    it("skips providers with null or missing evaluator_runs when finding the first populated one", () => {
      const providerResults: ProviderForColumns[] = [
        { evaluator_runs: null },
        {},
        {
          evaluator_runs: [{ evaluator_uuid: "u1", metric_key: "politeness" }],
        },
      ];
      const result = deriveEvaluatorColumns({
        providerResults,
        aboutEvaluators: [],
        reservedMetricKeys: new Set(),
        singleJudgeFallback: { defaultLabel: "LLM Judge" },
      });
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe("politeness");
    });
  });

  describe("(2a) legacy _info format", () => {
    it("derives columns from `${prefix}_info` metric keys", () => {
      const providerResults: ProviderForColumns[] = [
        {
          metrics: {
            politeness_info: { type: "binary" },
            coherence_info: { type: "rating" },
          },
        },
      ];
      const result = deriveEvaluatorColumns({
        providerResults,
        aboutEvaluators: [],
        reservedMetricKeys: new Set(),
        singleJudgeFallback: { defaultLabel: "LLM Judge" },
      });
      expect(result).toEqual([
        {
          key: "politeness",
          label: "politeness",
          outputType: "binary",
          scoreField: "politeness_score",
          reasoningField: "politeness_reasoning",
        },
        {
          key: "coherence",
          label: "coherence",
          outputType: "rating",
          scoreField: "coherence_score",
          reasoningField: "coherence_reasoning",
        },
      ]);
    });

    it("resolves the label from aboutEvaluators when a matching name exists", () => {
      const providerResults: ProviderForColumns[] = [
        { metrics: { politeness_info: { type: "binary" } } },
      ];
      const aboutEvaluators: AboutEvaluatorLite[] = [
        { uuid: "u1", name: "politeness" },
      ];
      const [col] = deriveEvaluatorColumns({
        providerResults,
        aboutEvaluators,
        reservedMetricKeys: new Set(),
        singleJudgeFallback: { defaultLabel: "LLM Judge" },
      });
      expect(col.label).toBe("politeness");
    });

    it("skips reserved metric keys", () => {
      const providerResults: ProviderForColumns[] = [
        {
          metrics: {
            wer_info: { type: "binary" },
            politeness_info: { type: "binary" },
          },
        },
      ];
      const result = deriveEvaluatorColumns({
        providerResults,
        aboutEvaluators: [],
        reservedMetricKeys: new Set(["wer_info"]),
        singleJudgeFallback: { defaultLabel: "LLM Judge" },
      });
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe("politeness");
    });

    it("defaults to binary when _info.type is missing or not rating", () => {
      const providerResults: ProviderForColumns[] = [
        { metrics: { politeness_info: {} } },
      ];
      const [col] = deriveEvaluatorColumns({
        providerResults,
        aboutEvaluators: [],
        reservedMetricKeys: new Set(),
        singleJudgeFallback: { defaultLabel: "LLM Judge" },
      });
      expect(col.outputType).toBe("binary");
    });
  });

  describe("(2b) intermediate bare-name format", () => {
    it("derives columns from `{ type, mean }` shaped metrics", () => {
      const providerResults: ProviderForColumns[] = [
        {
          metrics: {
            Politeness: { type: "binary", mean: 0.8 },
            Coherence: { type: "rating", mean: 4.1 },
          },
        },
      ];
      const result = deriveEvaluatorColumns({
        providerResults,
        aboutEvaluators: [],
        reservedMetricKeys: new Set(),
        singleJudgeFallback: { defaultLabel: "LLM Judge" },
      });
      expect(result).toEqual([
        {
          key: "Politeness",
          label: "Politeness",
          outputType: "binary",
          scoreField: "Politeness",
          reasoningField: "Politeness_reasoning",
        },
        {
          key: "Coherence",
          label: "Coherence",
          outputType: "rating",
          scoreField: "Coherence",
          reasoningField: "Coherence_reasoning",
        },
      ]);
    });

    it("skips array values and values without a `type` property", () => {
      const providerResults: ProviderForColumns[] = [
        {
          metrics: {
            some_array: [1, 2, 3],
            no_type: { mean: 5 },
            other_scalar: "just a string",
            Politeness: { type: "binary", mean: 0.8 },
          },
        },
      ];
      const result = deriveEvaluatorColumns({
        providerResults,
        aboutEvaluators: [],
        reservedMetricKeys: new Set(),
        singleJudgeFallback: { defaultLabel: "LLM Judge" },
      });
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe("Politeness");
    });

    it("skips reserved keys in the bare-name branch", () => {
      const providerResults: ProviderForColumns[] = [
        {
          metrics: {
            ttfb: { type: "rating", mean: 100 },
            Politeness: { type: "binary", mean: 0.8 },
          },
        },
      ];
      const result = deriveEvaluatorColumns({
        providerResults,
        aboutEvaluators: [],
        reservedMetricKeys: TTS_RESERVED_METRIC_KEYS,
        singleJudgeFallback: { defaultLabel: "LLM Judge" },
      });
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe("Politeness");
    });

    it("resolves label from aboutEvaluators, falling back to the raw key otherwise", () => {
      const providerResults: ProviderForColumns[] = [
        {
          metrics: {
            Politeness: { type: "binary", mean: 0.8 },
            Unresolved: { type: "binary", mean: 0.1 },
          },
        },
      ];
      const aboutEvaluators: AboutEvaluatorLite[] = [
        { uuid: "u1", name: "Politeness" },
      ];
      const result = deriveEvaluatorColumns({
        providerResults,
        aboutEvaluators,
        reservedMetricKeys: new Set(),
        singleJudgeFallback: { defaultLabel: "LLM Judge" },
      });
      const politeness = result.find((c) => c.key === "Politeness")!;
      const unresolved = result.find((c) => c.key === "Unresolved")!;
      expect(politeness.label).toBe("Politeness");
      expect(unresolved.label).toBe("Unresolved");
    });

    it("finds the first provider with a truthy metrics object, skipping null/missing ones", () => {
      const providerResults: ProviderForColumns[] = [
        { metrics: null },
        {},
        { metrics: { Politeness: { type: "binary", mean: 0.8 } } },
      ];
      const result = deriveEvaluatorColumns({
        providerResults,
        aboutEvaluators: [],
        reservedMetricKeys: new Set(),
        singleJudgeFallback: { defaultLabel: "LLM Judge" },
      });
      expect(result).toHaveLength(1);
    });
  });

  describe("(3) legacy single-evaluator fallback", () => {
    it("returns a single llm_judge column with defaults when nothing else matches", () => {
      const result = deriveEvaluatorColumns({
        providerResults: [{}],
        aboutEvaluators: [],
        reservedMetricKeys: new Set(),
        singleJudgeFallback: { defaultLabel: "LLM Judge" },
      });
      expect(result).toEqual([
        {
          key: "llm_judge",
          label: "LLM Judge",
          outputType: "binary",
          scoreField: "llm_judge_score",
          reasoningField: "llm_judge_reasoning",
        },
      ]);
    });

    it("returns the fallback when providerResults is empty", () => {
      const result = deriveEvaluatorColumns({
        providerResults: [],
        aboutEvaluators: [],
        reservedMetricKeys: new Set(),
        singleJudgeFallback: { defaultLabel: "LLM Judge" },
      });
      expect(result).toHaveLength(1);
      expect(result[0].key).toBe("llm_judge");
    });

    it("resolves the label and outputType from aboutEvaluators via defaultEvaluatorUuid", () => {
      const aboutEvaluators: AboutEvaluatorLite[] = [
        { uuid: "u1", name: "Custom Judge", outputType: "rating" },
      ];
      const result = deriveEvaluatorColumns({
        providerResults: [{}],
        aboutEvaluators,
        reservedMetricKeys: new Set(),
        singleJudgeFallback: {
          defaultEvaluatorUuid: "u1",
          defaultLabel: "LLM Judge",
        },
      });
      expect(result[0].label).toBe("Custom Judge");
      expect(result[0].outputType).toBe("rating");
    });

    it("falls back to defaultOutputType when no matching evaluator is found", () => {
      const result = deriveEvaluatorColumns({
        providerResults: [{}],
        aboutEvaluators: [],
        reservedMetricKeys: new Set(),
        singleJudgeFallback: {
          defaultEvaluatorUuid: "does-not-exist",
          defaultLabel: "LLM Judge",
          defaultOutputType: "rating",
        },
      });
      expect(result[0].label).toBe("LLM Judge");
      expect(result[0].outputType).toBe("rating");
    });

    it("uses custom key/scoreField/reasoningField overrides when provided", () => {
      const result = deriveEvaluatorColumns({
        providerResults: [{}],
        aboutEvaluators: [],
        reservedMetricKeys: new Set(),
        singleJudgeFallback: {
          key: "custom_key",
          scoreField: "custom_score",
          reasoningField: "custom_reasoning",
          defaultLabel: "LLM Judge",
        },
      });
      expect(result[0]).toEqual({
        key: "custom_key",
        label: "LLM Judge",
        outputType: "binary",
        scoreField: "custom_score",
        reasoningField: "custom_reasoning",
      });
    });

    it("does not resolve defaultAbout when defaultEvaluatorUuid is null/undefined", () => {
      const aboutEvaluators: AboutEvaluatorLite[] = [
        { uuid: "u1", name: "Custom Judge" },
      ];
      const result = deriveEvaluatorColumns({
        providerResults: [{}],
        aboutEvaluators,
        reservedMetricKeys: new Set(),
        singleJudgeFallback: { defaultLabel: "LLM Judge" },
      });
      expect(result[0].label).toBe("LLM Judge");
    });
  });
});
