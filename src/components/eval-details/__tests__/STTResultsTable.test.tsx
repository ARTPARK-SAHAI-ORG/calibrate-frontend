import React from "react";
import { render, screen } from "@/test-utils";
import { STTResultsTable, type STTResultRow, type STTEvaluatorColumn } from "../STTResultsTable";

const baseRow: STTResultRow = {
  id: "1",
  gt: "hello world",
  pred: "hello world",
  wer: "0.1234",
  cer: "0.0567",
  string_similarity: "0.9876",
  llm_judge_score: "true",
  llm_judge_reasoning: "Matches well",
};

describe("STTResultsTable", () => {
  it("renders legacy columns with WER/similarity/pass badge, no audio column when no audio_url", () => {
    render(<STTResultsTable results={[baseRow]} />);
    expect(screen.getAllByText("Ground Truth").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Prediction").length).toBeGreaterThan(0);
    expect(screen.getAllByText("WER").length).toBeGreaterThan(0);
    expect(screen.getAllByText("CER").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Similarity").length).toBeGreaterThan(0);
    expect(screen.queryByText("Audio")).not.toBeInTheDocument();
    // WER/CER/similarity formatted values (appear in both desktop+mobile)
    expect(screen.getAllByText("0.1234").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0.0567").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0.9876").length).toBeGreaterThan(0);
    // Pass badge (from legacy llm_judge_score true)
    expect(screen.getAllByText("Pass").length).toBeGreaterThan(0);
  });

  it("shows audio column when a row has audio_url", () => {
    render(<STTResultsTable results={[{ ...baseRow, audio_url: "https://example.com/a.wav" }]} />);
    expect(screen.getAllByText("Audio").length).toBeGreaterThan(0);
  });

  it("renders em-dash placeholder for a row without audio when other rows have audio", () => {
    render(
      <STTResultsTable
        results={[
          { ...baseRow, audio_url: "https://example.com/a.wav" },
          { ...baseRow, id: "2", audio_url: undefined },
        ]}
      />,
    );
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
  });

  it("shows empty-prediction fallback text and highlight when pred is blank/whitespace", () => {
    render(<STTResultsTable results={[{ ...baseRow, pred: "   " }]} />);
    expect(screen.getAllByText("No transcript generated").length).toBeGreaterThan(0);
  });

  it("renders Fail badge when llm_judge_score is falsy string", () => {
    render(<STTResultsTable results={[{ ...baseRow, llm_judge_score: "false" }]} />);
    expect(screen.getAllByText("Fail").length).toBeGreaterThan(0);
  });

  it("renders dash for missing llm_judge_score in legacy mode", () => {
    render(<STTResultsTable results={[{ ...baseRow, llm_judge_score: undefined, llm_judge_reasoning: undefined }]} />);
    // no llm_judge_score -> dash '-' rendered by LLMJudgeBadge in desktop, mobile omits pill
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });

  it("falls back to 'Score: X' tooltip text when llm_judge_reasoning is missing", () => {
    render(<STTResultsTable results={[{ ...baseRow, llm_judge_reasoning: undefined }]} />);
    expect(screen.getAllByText("Pass").length).toBeGreaterThan(0);
  });

  it("renders dash for null wer/similarity", () => {
    render(<STTResultsTable results={[{ ...baseRow, wer: undefined as any, string_similarity: undefined }]} />);
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });

  it("hides metrics columns entirely when showMetrics=false", () => {
    render(<STTResultsTable results={[baseRow]} showMetrics={false} />);
    expect(screen.queryByText("WER")).not.toBeInTheDocument();
    expect(screen.queryByText("CER")).not.toBeInTheDocument();
    expect(screen.queryByText("Similarity")).not.toBeInTheDocument();
    expect(screen.queryByText("Evaluator")).not.toBeInTheDocument();
  });

  it("renders CER column even when similarity is hidden (auth STT page config)", () => {
    render(<STTResultsTable results={[baseRow]} showSimilarity={false} />);
    expect(screen.getAllByText("CER").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0.0567").length).toBeGreaterThan(0);
  });

  it("renders dash for a row with no cer value", () => {
    render(<STTResultsTable results={[{ ...baseRow, cer: undefined }]} />);
    // CER header still shown, cell falls back to '-'
    expect(screen.getAllByText("CER").length).toBeGreaterThan(0);
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });

  it("hides similarity column when showSimilarity=false", () => {
    render(<STTResultsTable results={[baseRow]} showSimilarity={false} />);
    expect(screen.queryByText("Similarity")).not.toBeInTheDocument();
    expect(screen.getAllByText("WER").length).toBeGreaterThan(0);
  });

  it("uses a custom judgeLabel for the legacy evaluator column", () => {
    render(<STTResultsTable results={[baseRow]} judgeLabel="Custom Judge" />);
    expect(screen.getAllByText("Custom Judge").length).toBeGreaterThan(0);
  });

  it("renders dynamic evaluator columns (binary + rating) from legacy flat fields", () => {
    const cols: STTEvaluatorColumn[] = [
      { key: "semantic_match", label: "Semantic Match", outputType: "binary", scoreField: "semantic_match_score", reasoningField: "semantic_match_reasoning" },
      { key: "quality", label: "Quality", outputType: "rating", scoreField: "quality_score", reasoningField: "quality_reasoning", scaleMax: 5 },
    ];
    render(
      <STTResultsTable
        results={[
          {
            ...baseRow,
            semantic_match_score: "true",
            semantic_match_reasoning: "good match",
            quality_score: "4",
            quality_reasoning: "solid",
          },
        ]}
        evaluatorColumns={cols}
      />,
    );
    expect(screen.getAllByText("Semantic Match").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Quality").length).toBeGreaterThan(0);
    expect(screen.getAllByText("4/5").length).toBeGreaterThan(0);
    // legacy judge column and pill should not render in dynamic mode
    expect(screen.queryByText("Evaluator")).not.toBeInTheDocument();
  });

  it("reads dynamic evaluator via evaluator_outputs uuid path and shows error badge", () => {
    const cols: STTEvaluatorColumn[] = [
      { key: "ev1", label: "Ev1", outputType: "binary", evaluatorUuid: "uuid-1" },
    ];
    render(
      <STTResultsTable
        results={[
          {
            ...baseRow,
            evaluator_outputs: { "uuid-1": { error: true, reasoning: "bad" } },
          },
        ]}
        evaluatorColumns={cols}
      />,
    );
    expect(screen.getAllByText("Error").length).toBeGreaterThan(0);
  });

  it("omits an evaluator column entirely when no row has a value for it", () => {
    const cols: STTEvaluatorColumn[] = [
      { key: "ev2", label: "Ev2", outputType: "binary" },
    ];
    render(<STTResultsTable results={[baseRow]} evaluatorColumns={cols} />);
    // No row carries a value for this evaluator, so neither its header nor any
    // cell should render — an all-"-" column is dropped.
    expect(screen.queryByText("Ev2")).not.toBeInTheDocument();
  });

  it("keeps evaluator columns that have a value in at least one row", () => {
    const cols: STTEvaluatorColumn[] = [
      { key: "ev3", label: "Ev3", outputType: "binary", scoreField: "ev3_score" },
      { key: "ev4", label: "Ev4", outputType: "binary", scoreField: "ev4_score" },
    ];
    render(
      <STTResultsTable
        results={[{ ...baseRow, ev3_score: "true" }]}
        evaluatorColumns={cols}
      />,
    );
    // Ev3 has a value → shown; Ev4 is empty in every row → dropped.
    expect(screen.getAllByText("Ev3").length).toBeGreaterThan(0);
    expect(screen.queryByText("Ev4")).not.toBeInTheDocument();
  });

  it("renders LLM-WER / LLM-CER / Intent / Entity columns and formatted values when the row carries Sarvam metrics", () => {
    render(
      <STTResultsTable
        results={[
          {
            ...baseRow,
            sarvam_llm_wer: 0.05,
            sarvam_llm_cer: 0.0321,
            sarvam_intent_score: 1,
            sarvam_entity_score: 0.8333,
            sarvam_llm_wer_reasoning: '[{"segment":"foo","verdict":"equivalent"}]',
            sarvam_intent_reasoning: "Meaning preserved.",
            sarvam_entity_reasoning: "One entity slightly off.",
          },
        ]}
      />,
    );
    expect(screen.getAllByText("LLM-WER").length).toBeGreaterThan(0);
    expect(screen.getAllByText("LLM-CER").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Intent Score").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Entity Score").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0.05").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0.0321").length).toBeGreaterThan(0);
    expect(screen.getAllByText("0.8333").length).toBeGreaterThan(0);
    // Reasoning surfaces a per-metric tooltip trigger on LLM-WER, Intent, and
    // Entity (LLM-CER has no reasoning).
    expect(
      screen.getAllByLabelText("View LLM-WER reasoning").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByLabelText("View Intent Score reasoning").length,
    ).toBeGreaterThan(0);
    expect(
      screen.getAllByLabelText("View Entity Score reasoning").length,
    ).toBeGreaterThan(0);
  });

  it("hides the Sarvam columns when no row carries them", () => {
    render(<STTResultsTable results={[baseRow]} />);
    expect(screen.queryByText("LLM-WER")).not.toBeInTheDocument();
    expect(screen.queryByText("LLM-CER")).not.toBeInTheDocument();
    expect(screen.queryByText("Intent Score")).not.toBeInTheDocument();
    expect(screen.queryByText("Entity Score")).not.toBeInTheDocument();
  });

  it("renders only the Sarvam columns that are present (intent/entity without llm-wer/cer)", () => {
    render(
      <STTResultsTable
        results={[{ ...baseRow, sarvam_intent_score: 0.5, sarvam_entity_score: 1 }]}
      />,
    );
    expect(screen.getAllByText("Intent Score").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Entity Score").length).toBeGreaterThan(0);
    expect(screen.queryByText("LLM-WER")).not.toBeInTheDocument();
  });

  it("accepts Sarvam metrics as stringified numbers", () => {
    render(
      <STTResultsTable
        results={[{ ...baseRow, sarvam_llm_wer: "0.5" }]}
      />,
    );
    expect(screen.getAllByText("LLM-WER").length).toBeGreaterThan(0);
    // No reasoning provided → no tooltip trigger.
    expect(
      screen.queryByLabelText("View LLM-WER reasoning"),
    ).not.toBeInTheDocument();
  });

  it("attaches tableRef to the desktop table wrapper", () => {
    const ref = React.createRef<HTMLDivElement>();
    render(<STTResultsTable results={[baseRow]} tableRef={ref} />);
    expect(ref.current).not.toBeNull();
  });

  it("renders nothing extra with empty results array", () => {
    render(<STTResultsTable results={[]} />);
    expect(screen.getAllByText("Ground Truth").length).toBeGreaterThan(0);
  });

  it("renders no labelling checkboxes without selection props", () => {
    render(<STTResultsTable results={[baseRow]} />);
    expect(
      screen.queryByLabelText("Select for labelling"),
    ).not.toBeInTheDocument();
  });

  it("toggles a row when its labelling checkbox is clicked", () => {
    const onToggle = jest.fn();
    render(
      <STTResultsTable
        results={[baseRow]}
        labellingSelection={new Set()}
        onToggleLabellingSelection={onToggle}
        onLabellingBulkToggle={jest.fn()}
        labellingKeyForRow={(_r, i) => `openai:${i}`}
      />,
    );
    // desktop + mobile both render a button; click the first
    screen.getAllByLabelText("Select for labelling")[0].click();
    expect(onToggle).toHaveBeenCalledWith("openai:0");
  });

  it("disables the checkbox for rows with empty ground truth", () => {
    const onToggle = jest.fn();
    render(
      <STTResultsTable
        results={[{ ...baseRow, gt: "" }]}
        labellingSelection={new Set()}
        onToggleLabellingSelection={onToggle}
        onLabellingBulkToggle={jest.fn()}
        labellingKeyForRow={(_r, i) => `openai:${i}`}
      />,
    );
    const buttons = screen.getAllByLabelText("Select for labelling");
    expect(buttons[0]).toBeDisabled();
    buttons[0].click();
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("bulk-toggles all eligible rows via the header select-all", () => {
    const onBulk = jest.fn();
    render(
      <STTResultsTable
        results={[baseRow, { ...baseRow, id: "2" }]}
        labellingSelection={new Set()}
        onToggleLabellingSelection={jest.fn()}
        onLabellingBulkToggle={onBulk}
        labellingKeyForRow={(_r, i) => `openai:${i}`}
      />,
    );
    screen.getByLabelText("Select all").click();
    expect(onBulk).toHaveBeenCalledWith(["openai:0", "openai:1"]);
  });
});
