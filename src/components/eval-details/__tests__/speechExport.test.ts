import {
  evaluatorCsvValue,
  sttExportContents,
  ttsExportContents,
} from "../speechExport";

const binary = {
  key: "correct",
  label: "Correct",
  outputType: "binary" as const,
  evaluatorUuid: "e1",
};
const rating = {
  key: "clarity",
  label: "Clarity",
  outputType: "rating" as const,
  evaluatorUuid: "e2",
};
const label = (p: string) => p.toUpperCase();

describe("evaluatorCsvValue", () => {
  const row = (value: unknown, error?: boolean) => ({
    evaluator_outputs: { e1: { value, error }, e2: { value, error } },
  });

  it("writes a pass-or-fail score as true or false, whatever its case", () => {
    expect(evaluatorCsvValue(row("TRUE"), binary)).toBe("true");
    expect(evaluatorCsvValue(row("1"), binary)).toBe("true");
    expect(evaluatorCsvValue(row("False"), binary)).toBe("false");
  });

  it("writes a rating as a number, and keeps text that is not one", () => {
    expect(evaluatorCsvValue(row("4"), rating)).toBe(4);
    expect(evaluatorCsvValue(row("n/a"), rating)).toBe("n/a");
  });

  it("leaves the cell blank when there is no score or the evaluator failed", () => {
    expect(evaluatorCsvValue({}, rating)).toBe("");
    expect(evaluatorCsvValue(row("4", true), rating)).toBe("");
  });
});

describe("sttExportContents", () => {
  const clip = "https://bucket/a/audio_1.MP3?sig=x.y";
  const run = (metrics: Record<string, unknown> = {}) => ({
    provider_results: [
      {
        provider: "deepgram",
        metrics,
        results: [
          {
            id: "audio_1",
            audio_url: clip,
            gt: "hello",
            pred: "hallo",
            wer: "0.5",
            cer: "0.2",
            semantic_wer: 0.1,
            sarvam_llm_wer: 0.3,
            evaluator_outputs: { e1: { value: "true" } },
          },
          { id: "audio_2", gt: "bye", pred: "bye", wer: "0" },
        ],
      },
      {
        provider: "openai",
        metrics,
        results: [
          {
            id: "audio_1",
            audio_url: clip,
            gt: "hello",
            pred: "hello",
            wer: "0",
          },
        ],
      },
    ],
  });

  it("puts each clip in the zip once and names it in every row that used it", () => {
    const { csv, files } = sttExportContents(run(), [binary], label);
    expect(files).toEqual([{ path: "audios/audio_1.mp3", url: clip }]);
    expect(csv.rows.map((r) => [r.provider, r.audio_name])).toEqual([
      ["DEEPGRAM", "audio_1.mp3"],
      ["DEEPGRAM", ""],
      ["OPENAI", "audio_1.mp3"],
    ]);
    expect(csv.rows[0]).toMatchObject({
      reference_text: "hello",
      predicted_text: "hallo",
      wer: "0.5",
      cer: "0.2",
      correct: "true",
    });
    expect(csv.columns.map((c) => c.header)).toEqual([
      "Provider",
      "Audio name",
      "Reference text",
      "Predicted text",
      "WER",
      "CER",
      "Correct",
    ]);
  });

  it("adds Semantic WER and the Sarvam columns only when the run measured them", () => {
    const { csv } = sttExportContents(
      run({ semantic_wer: 0.1, sarvam_llm_wer: 0.3 }),
      [],
      label,
    );
    const headers = csv.columns.map((c) => c.header);
    expect(headers).toContain("Semantic WER");
    expect(headers).toContain("LLM-WER");
    expect(csv.rows[0]).toMatchObject({ semantic_wer: 0.1, llm_wer: 0.3 });
    expect(csv.rows[1]).toMatchObject({ semantic_wer: "", llm_wer: "" });
  });

  it("handles a run with no results", () => {
    expect(sttExportContents({}, [], label)).toEqual({
      csv: expect.objectContaining({ rows: [] }),
      files: [],
    });
  });
});

describe("ttsExportContents", () => {
  it("names each provider's clip after the provider and row", () => {
    const { csv, files } = ttsExportContents(
      {
        provider_results: [
          {
            provider: "openai",
            results: [
              {
                id: "1",
                text: "hi",
                audio_path: "https://bucket/x/1?sig=a.b",
                evaluator_outputs: { e2: { value: "5" } },
              },
              { id: "2", text: "bye", audio_path: "" },
            ],
          },
        ],
      },
      [rating],
      label,
    );
    expect(files).toEqual([
      { path: "audios/openai_1.wav", url: "https://bucket/x/1?sig=a.b" },
    ]);
    expect(csv.rows).toEqual([
      {
        provider: "OPENAI",
        audio_name: "openai_1.wav",
        text: "hi",
        clarity: 5,
      },
      { provider: "OPENAI", audio_name: "", text: "bye", clarity: "" },
    ]);
    expect(csv.columns.map((c) => c.header)).toEqual([
      "Provider",
      "Audio name",
      "Text",
      "Clarity",
    ]);
  });
});
