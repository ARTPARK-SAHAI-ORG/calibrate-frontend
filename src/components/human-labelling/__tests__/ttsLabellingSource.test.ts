import {
  ttsRowAudioKey,
  isTtsRowLabellingEligible,
  countTtsLabellingEligible,
  buildTtsLabellingRows,
} from "../ttsLabellingSource";

const label = (v: string) => (v === "openai" ? "OpenAI" : v);

// A row as it arrives from /tts/evaluate: `audio_path` is the presigned
// playback URL, `audio_s3_path` is the bare storage key.
const row = (over: Record<string, unknown> = {}) => ({
  id: "1",
  text: "hi",
  audio_path: "https://cdn.example.com/signed/openai/audio_1.wav?sig=abc",
  audio_s3_path: "tts/evals/run-1/outputs/openai/audio_1.wav",
  ...over,
});

describe("ttsRowAudioKey", () => {
  it("returns the trimmed storage key", () => {
    expect(ttsRowAudioKey(row())).toBe(
      "tts/evals/run-1/outputs/openai/audio_1.wav",
    );
    expect(ttsRowAudioKey(row({ audio_s3_path: "  key.wav  " }))).toBe("key.wav");
  });

  it("returns empty string when the key is missing or non-string", () => {
    expect(ttsRowAudioKey(row({ audio_s3_path: undefined }))).toBe("");
    expect(ttsRowAudioKey(row({ audio_s3_path: null }))).toBe("");
    expect(ttsRowAudioKey(row({ audio_s3_path: 123 }))).toBe("");
    expect(ttsRowAudioKey(row({ audio_s3_path: "" }))).toBe("");
  });
});

describe("isTtsRowLabellingEligible", () => {
  it("is eligible only when a storage key is present", () => {
    expect(isTtsRowLabellingEligible(row())).toBe(true);
    // A playback URL but no storage key is NOT eligible.
    expect(isTtsRowLabellingEligible(row({ audio_s3_path: undefined }))).toBe(
      false,
    );
  });
});

describe("countTtsLabellingEligible", () => {
  it("counts rows with a storage key across providers", () => {
    const providerResults = [
      { provider: "openai", results: [row(), row({ audio_s3_path: "" })] },
      { provider: "azure", results: [row()] },
      { provider: "empty", results: null },
    ];
    expect(countTtsLabellingEligible(providerResults)).toBe(2);
  });
});

describe("buildTtsLabellingRows", () => {
  it("submits the storage key as audio_path, NOT the playback URL", () => {
    const providerResults = [{ provider: "openai", results: [row()] }];
    const rows = buildTtsLabellingRows(
      providerResults,
      new Set(["openai:0"]),
      "run-abcd",
      label,
    );
    expect(rows).toHaveLength(1);
    // The regression this test pins: audio_path is the key, never the URL.
    expect(rows[0].audio_path).toBe(
      "tts/evals/run-1/outputs/openai/audio_1.wav",
    );
    expect(rows[0].audio_path).not.toContain("https://");
    expect(rows[0]).toEqual({
      name: "OpenAI #1 — run-abcd",
      text: "hi",
      audio_path: "tts/evals/run-1/outputs/openai/audio_1.wav",
    });
  });

  it("includes only selected, key-bearing rows", () => {
    const providerResults = [
      {
        provider: "openai",
        results: [
          row({ audio_s3_path: "k0.wav" }), // selected + eligible
          row({ audio_s3_path: "k1.wav" }), // eligible but NOT selected
          row({ audio_s3_path: "" }), // selected but no key → dropped
        ],
      },
    ];
    const rows = buildTtsLabellingRows(
      providerResults,
      new Set(["openai:0", "openai:2"]),
      "run",
      label,
    );
    expect(rows.map((r) => r.audio_path)).toEqual(["k0.wav"]);
  });

  it("keys rows per provider so selection is stable across providers", () => {
    const providerResults = [
      { provider: "openai", results: [row({ audio_s3_path: "o0.wav" })] },
      { provider: "azure", results: [row({ audio_s3_path: "a0.wav" })] },
    ];
    const rows = buildTtsLabellingRows(
      providerResults,
      new Set(["azure:0"]),
      "run",
      label,
    );
    expect(rows.map((r) => r.audio_path)).toEqual(["a0.wav"]);
  });
});
