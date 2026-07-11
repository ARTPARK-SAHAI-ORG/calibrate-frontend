import React from "react";
import { render, screen } from "@/test-utils";
import { setupUser } from "@/test-utils";
import {
  EvaluatorScoreCell,
  readEvaluatorCell,
  type EvaluatorColumnLike,
} from "../EvaluatorScoreCell";

describe("readEvaluatorCell", () => {
  const col: EvaluatorColumnLike = { key: "safety", evaluatorUuid: "uuid-1" };

  it("reads from the namespaced evaluator_outputs shape when evaluatorUuid matches", () => {
    const row = {
      evaluator_outputs: {
        "uuid-1": { value: true, reasoning: "ok", error: false },
      },
    };
    expect(readEvaluatorCell(row, col)).toEqual({
      score: "true",
      reasoning: "ok",
      error: false,
    });
  });

  it("surfaces the error flag from the namespaced shape", () => {
    const row = {
      evaluator_outputs: { "uuid-1": { value: null, reasoning: null, error: true } },
    };
    expect(readEvaluatorCell(row, col)).toEqual({
      score: undefined,
      reasoning: undefined,
      error: true,
    });
  });

  it("falls back to legacy flat keys when no evaluatorUuid is set", () => {
    const legacyCol: EvaluatorColumnLike = { key: "safety" };
    const row = { safety_score: "1", safety_reasoning: "legacy reason" };
    expect(readEvaluatorCell(row, legacyCol)).toEqual({
      score: "1",
      reasoning: "legacy reason",
      error: false,
    });
  });

  it("falls back to legacy keys when evaluator_outputs is missing the uuid entry", () => {
    const row = { evaluator_outputs: {}, safety_score: "0", safety_reasoning: "r" };
    expect(readEvaluatorCell(row, col)).toEqual({
      score: "0",
      reasoning: "r",
      error: false,
    });
  });

  it("uses custom scoreField / reasoningField overrides", () => {
    const customCol: EvaluatorColumnLike = {
      key: "safety",
      scoreField: "custom_score",
      reasoningField: "custom_reason",
    };
    const row = { custom_score: 42, custom_reason: "custom" };
    expect(readEvaluatorCell(row, customCol)).toEqual({
      score: "42",
      reasoning: "custom",
      error: false,
    });
  });

  it("coerces numeric values to strings and treats null/undefined as undefined", () => {
    const legacyCol: EvaluatorColumnLike = { key: "quality" };
    expect(readEvaluatorCell({ quality_score: 3 }, legacyCol).score).toBe("3");
    expect(readEvaluatorCell({ quality_score: null }, legacyCol).score).toBeUndefined();
    expect(readEvaluatorCell({}, legacyCol).score).toBeUndefined();
  });

  it("ignores evaluator_outputs when it is an array or non-object", () => {
    const row1 = { evaluator_outputs: [], safety_score: "1", safety_reasoning: "r" };
    expect(readEvaluatorCell(row1, col).score).toBe("1");
    const row2 = { evaluator_outputs: "not-an-object", safety_score: "1", safety_reasoning: "r" };
    expect(readEvaluatorCell(row2, col).score).toBe("1");
  });

  it("ignores a non-object entry value inside evaluator_outputs", () => {
    const row = { evaluator_outputs: { "uuid-1": "not-an-object" }, safety_score: "1", safety_reasoning: "r" };
    expect(readEvaluatorCell(row, col).score).toBe("1");
  });
});

describe("EvaluatorScoreCell", () => {
  it("renders '-' when score is absent and not in error", () => {
    render(<EvaluatorScoreCell outputType="binary" />);
    expect(screen.getByText("-")).toBeInTheDocument();
  });

  it("renders the error badge with a View error tooltip trigger", () => {
    render(<EvaluatorScoreCell outputType="binary" error />);
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "View error" })).toBeInTheDocument();
  });

  it("renders the error badge without the tooltip button when hideTooltipButton is set", () => {
    render(<EvaluatorScoreCell outputType="binary" error hideTooltipButton />);
    expect(screen.getByText("Error")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders a Pass pill for binary score 'true'", () => {
    render(<EvaluatorScoreCell outputType="binary" score="true" reasoning="good" />);
    expect(screen.getByText("Pass")).toBeInTheDocument();
  });

  it("renders a Pass pill for binary score '1'", () => {
    render(<EvaluatorScoreCell outputType="binary" score="1" />);
    expect(screen.getByText("Pass")).toBeInTheDocument();
  });

  it("renders a Fail pill for other binary scores", () => {
    render(<EvaluatorScoreCell outputType="binary" score="false" />);
    expect(screen.getByText("Fail")).toBeInTheDocument();
  });

  it("renders a rating score with scaleMax as score/scaleMax", () => {
    render(<EvaluatorScoreCell outputType="rating" score="3.14159" scaleMax={5} />);
    expect(screen.getByText("3.1416/5")).toBeInTheDocument();
  });

  it("renders a rating score without scaleMax as a bare number", () => {
    render(<EvaluatorScoreCell outputType="rating" score="3.14159" />);
    expect(screen.getByText("3.1416")).toBeInTheDocument();
  });

  it("falls back to the raw score string when rating score is non-numeric", () => {
    render(<EvaluatorScoreCell outputType="rating" score="n/a" />);
    expect(screen.getByText("n/a")).toBeInTheDocument();
  });

  it("hides the tooltip button for a non-error score when hideTooltipButton is set", () => {
    render(<EvaluatorScoreCell outputType="binary" score="1" reasoning="r" hideTooltipButton />);
    expect(screen.getByText("Pass")).toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("renders the reasoning tooltip button when reasoning is present and not hidden", () => {
    render(<EvaluatorScoreCell outputType="binary" score="1" reasoning="great job" />);
    expect(screen.getByRole("button", { name: "View reasoning" })).toBeInTheDocument();
  });
});
