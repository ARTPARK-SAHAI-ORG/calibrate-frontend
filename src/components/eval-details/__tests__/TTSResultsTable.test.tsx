import React from "react";
import { render, screen } from "@/test-utils";
import { TTSResultsTable, type TTSResultRow, type TTSEvaluatorColumn } from "../TTSResultsTable";

const baseRow: TTSResultRow = {
  id: "1",
  text: "hello world",
  audio_path: "https://example.com/a.wav",
  llm_judge_score: "true",
  llm_judge_reasoning: "Sounds great",
};

describe("TTSResultsTable", () => {
  it("renders legacy columns with judge pass badge", () => {
    render(<TTSResultsTable results={[baseRow]} />);
    expect(screen.getAllByText("ID").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Text").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Audio").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Evaluator").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Pass").length).toBeGreaterThan(0);
    expect(screen.getAllByText("hello world").length).toBeGreaterThan(0);
  });

  it("renders Fail badge for a falsy legacy score", () => {
    render(<TTSResultsTable results={[{ ...baseRow, llm_judge_score: "false" }]} />);
    expect(screen.getAllByText("Fail").length).toBeGreaterThan(0);
  });

  it("renders dash when llm_judge_score is missing", () => {
    render(<TTSResultsTable results={[{ ...baseRow, llm_judge_score: undefined, llm_judge_reasoning: undefined }]} />);
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });

  it("falls back to 'Score: X' tooltip when reasoning is missing", () => {
    render(<TTSResultsTable results={[{ ...baseRow, llm_judge_reasoning: undefined }]} />);
    expect(screen.getAllByText("Pass").length).toBeGreaterThan(0);
  });

  it("hides metrics when showMetrics=false", () => {
    render(<TTSResultsTable results={[baseRow]} showMetrics={false} />);
    expect(screen.queryByText("Evaluator")).not.toBeInTheDocument();
    expect(screen.queryByText("Pass")).not.toBeInTheDocument();
  });

  it("uses a custom judgeLabel", () => {
    render(<TTSResultsTable results={[baseRow]} judgeLabel="Custom Judge" />);
    expect(screen.getAllByText("Custom Judge").length).toBeGreaterThan(0);
    // Mobile reasoning block uses the judgeLabel too
    expect(screen.getAllByText("Custom Judge Reasoning").length).toBeGreaterThan(0);
  });

  it("does not render mobile pass pill when llm_judge_score is falsy", () => {
    render(<TTSResultsTable results={[{ ...baseRow, llm_judge_score: undefined }]} />);
    // header index pill still renders
    expect(screen.getByText("#1")).toBeInTheDocument();
  });

  it("renders dynamic evaluator columns (binary + rating) via flat score fields", () => {
    const cols: TTSEvaluatorColumn[] = [
      { key: "semantic_match", label: "Semantic Match", outputType: "binary", scoreField: "semantic_match_score", reasoningField: "semantic_match_reasoning" },
      { key: "quality", label: "Quality", outputType: "rating", scoreField: "quality_score", reasoningField: "quality_reasoning", scaleMax: 5 },
    ];
    render(
      <TTSResultsTable
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
    expect(screen.getAllByText("good match").length).toBeGreaterThan(0);
    expect(screen.queryByText("Evaluator")).not.toBeInTheDocument();
  });

  it("reads dynamic evaluator via evaluator_outputs uuid path and shows error badge", () => {
    const cols: TTSEvaluatorColumn[] = [
      { key: "ev1", label: "Ev1", outputType: "binary", evaluatorUuid: "uuid-1" },
    ];
    render(
      <TTSResultsTable
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

  it("omits dynamic evaluator mobile block entirely when no score/reasoning/error", () => {
    const cols: TTSEvaluatorColumn[] = [
      { key: "ev2", label: "Ev2", outputType: "binary" },
    ];
    render(<TTSResultsTable results={[baseRow]} evaluatorColumns={cols} />);
    expect(screen.getAllByText("Ev2").length).toBeGreaterThan(0);
  });

  it("renders with empty results array", () => {
    render(<TTSResultsTable results={[]} />);
    expect(screen.getAllByText("Text").length).toBeGreaterThan(0);
  });

  it("renders no labelling checkboxes without selection props", () => {
    render(<TTSResultsTable results={[baseRow]} />);
    expect(
      screen.queryByLabelText("Select for labelling"),
    ).not.toBeInTheDocument();
  });

  it("toggles a row when its labelling checkbox is clicked", () => {
    const onToggle = jest.fn();
    render(
      <TTSResultsTable
        results={[baseRow]}
        labellingSelection={new Set()}
        onToggleLabellingSelection={onToggle}
        onLabellingBulkToggle={jest.fn()}
        labellingKeyForRow={(_r, i) => `openai:${i}`}
      />,
    );
    screen.getAllByLabelText("Select for labelling")[0].click();
    expect(onToggle).toHaveBeenCalledWith("openai:0");
  });

  it("disables the checkbox for rows without synthesized audio", () => {
    const onToggle = jest.fn();
    render(
      <TTSResultsTable
        results={[{ ...baseRow, audio_path: "" }]}
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
      <TTSResultsTable
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
