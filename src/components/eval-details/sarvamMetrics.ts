// Single source of truth for Sarvam's LLM-judge STT metrics. Every surface
// that renders them — the per-provider aggregate card, the per-row results
// table, the leaderboard, and the CSV export — reads this list so a new
// metric or a renamed key only has to be changed here.
//
// `key` is the field name used in the aggregate `metrics` block, per-row
// results, and leaderboard rows. `csvKey` is the (shorter) CSV column key.
// `reasoningKey` is the per-row reasoning field (a JSON string of the judged
// segments) — only LLM-WER carries one. `width` is the desktop column width.
export type SarvamMetricField = {
  key: string;
  label: string;
  csvKey: string;
  reasoningKey?: string;
  width: number;
};

export const SARVAM_METRIC_FIELDS: readonly SarvamMetricField[] = [
  {
    key: "sarvam_llm_wer",
    label: "LLM-WER",
    csvKey: "llm_wer",
    reasoningKey: "sarvam_llm_wer_reasoning",
    width: 110,
  },
  { key: "sarvam_llm_cer", label: "LLM-CER", csvKey: "llm_cer", width: 110 },
  { key: "sarvam_intent_score", label: "Intent", csvKey: "intent", width: 90 },
  { key: "sarvam_entity_score", label: "Entity", csvKey: "entity", width: 90 },
];
