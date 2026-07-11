import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import {
  EvaluatorVerdictCard,
  ReasoningToggleButton,
  ReasoningExpandedContent,
  readVerdictTone,
  evaluatorCardSurfaceClass,
} from "../EvaluatorVerdictCard";

describe("readVerdictTone", () => {
  it("returns green for binary match=true", () => {
    expect(readVerdictTone({ match: true })).toBe("green");
  });
  it("returns red for binary match=false", () => {
    expect(readVerdictTone({ match: false })).toBe("red");
  });
  it("returns green for rating score at scaleMax", () => {
    expect(readVerdictTone({ score: 5, scaleMax: 5, scaleMin: 1 })).toBe(
      "green",
    );
  });
  it("returns red for rating score at scaleMin", () => {
    expect(readVerdictTone({ score: 1, scaleMax: 5, scaleMin: 1 })).toBe(
      "red",
    );
  });
  it("returns amber for rating score between bounds", () => {
    expect(readVerdictTone({ score: 3, scaleMax: 5, scaleMin: 1 })).toBe(
      "amber",
    );
  });
  it("returns neutral when neither match nor score present", () => {
    expect(readVerdictTone({})).toBe("neutral");
  });
});

describe("evaluatorCardSurfaceClass", () => {
  it("returns a class string per tone", () => {
    expect(evaluatorCardSurfaceClass("green")).toContain("green-500");
    expect(evaluatorCardSurfaceClass("red")).toContain("red-500");
    expect(evaluatorCardSurfaceClass("amber")).toContain("amber-500");
    expect(evaluatorCardSurfaceClass("neutral")).toContain("border-border");
  });
});

describe("EvaluatorVerdictCard - read mode binary", () => {
  it("renders pass verdict with default label and check icon", () => {
    render(
      <EvaluatorVerdictCard
        mode="read"
        name="My Evaluator"
        outputType="binary"
        match={true}
      />,
    );
    expect(screen.getByText("My Evaluator")).toBeInTheDocument();
    expect(screen.getByText("Correct")).toBeInTheDocument();
  });

  it("renders fail verdict with default label", () => {
    render(
      <EvaluatorVerdictCard
        mode="read"
        name="My Evaluator"
        outputType="binary"
        match={false}
      />,
    );
    expect(screen.getByText("Wrong")).toBeInTheDocument();
  });

  it("renders custom true/false labels when provided", () => {
    render(
      <EvaluatorVerdictCard
        mode="read"
        name="My Evaluator"
        outputType="binary"
        match={true}
        trueLabel="Yes indeed"
        falseLabel="Nope"
      />,
    );
    expect(screen.getByText("Yes indeed")).toBeInTheDocument();
  });

  it("falls back to default label when trueLabel is blank", () => {
    render(
      <EvaluatorVerdictCard
        mode="read"
        name="My Evaluator"
        outputType="binary"
        match={true}
        trueLabel="   "
      />,
    );
    expect(screen.getByText("Correct")).toBeInTheDocument();
  });

  it("renders no pill when match is null/undefined", () => {
    const { container } = render(
      <EvaluatorVerdictCard
        mode="read"
        name="My Evaluator"
        outputType="binary"
        match={null}
      />,
    );
    expect(screen.queryByText("Correct")).not.toBeInTheDocument();
    expect(screen.queryByText("Wrong")).not.toBeInTheDocument();
    expect(container).toBeInTheDocument();
  });
});

describe("EvaluatorVerdictCard - read mode rating", () => {
  it("renders score/max pill with amber tone in the middle of the scale", () => {
    render(
      <EvaluatorVerdictCard
        mode="read"
        name="Rating Eval"
        outputType="rating"
        score={3}
        scaleMin={1}
        scaleMax={5}
      />,
    );
    expect(screen.getByText("3 / 5")).toBeInTheDocument();
  });

  it("renders 'Score: N' when scaleMax is not provided", () => {
    render(
      <EvaluatorVerdictCard
        mode="read"
        name="Rating Eval"
        outputType="rating"
        score={3}
      />,
    );
    expect(screen.getByText("Score: 3")).toBeInTheDocument();
  });

  it("renders no pill when score is null/undefined", () => {
    render(
      <EvaluatorVerdictCard
        mode="read"
        name="Rating Eval"
        outputType="rating"
        score={undefined}
      />,
    );
    expect(screen.queryByText(/\/ 5/)).not.toBeInTheDocument();
  });

  it("prefers ratingLabel prop over ratingScale lookup", () => {
    render(
      <EvaluatorVerdictCard
        mode="read"
        name="Rating Eval"
        outputType="rating"
        score={2}
        scaleMin={1}
        scaleMax={5}
        ratingLabel="Backend Label"
        ratingScale={[{ value: 2, name: "Local Label" }]}
      />,
    );
    expect(screen.getByText("Backend Label")).toBeInTheDocument();
    expect(screen.queryByText("Local Label")).not.toBeInTheDocument();
  });

  it("uses green tone for a score at scaleMax", () => {
    render(
      <EvaluatorVerdictCard
        mode="read"
        name="Rating Eval"
        outputType="rating"
        score={5}
        scaleMin={1}
        scaleMax={5}
      />,
    );
    expect(screen.getByText("5 / 5")).toHaveClass("text-green-600");
  });

  it("uses red tone for a score at scaleMin", () => {
    render(
      <EvaluatorVerdictCard
        mode="read"
        name="Rating Eval"
        outputType="rating"
        score={1}
        scaleMin={1}
        scaleMax={5}
      />,
    );
    expect(screen.getByText("1 / 5")).toHaveClass("text-red-600");
  });

  it("falls back to ratingScale lookup when ratingLabel is absent", () => {
    render(
      <EvaluatorVerdictCard
        mode="read"
        name="Rating Eval"
        outputType="rating"
        score={2}
        scaleMin={1}
        scaleMax={5}
        ratingScale={[{ value: 2, name: "Local Label" }]}
      />,
    );
    expect(screen.getByText("Local Label")).toBeInTheDocument();
  });
});

describe("EvaluatorVerdictCard - header extras", () => {
  it("renders description when provided", () => {
    render(
      <EvaluatorVerdictCard
        mode="read"
        name="Eval"
        description="A helpful description"
        outputType="binary"
        match={true}
      />,
    );
    expect(screen.getByText("A helpful description")).toBeInTheDocument();
  });

  it("renders versionLabel pill", () => {
    render(
      <EvaluatorVerdictCard
        mode="read"
        name="Eval"
        versionLabel="v3"
        outputType="binary"
        match={true}
      />,
    );
    expect(screen.getByText("v3")).toBeInTheDocument();
  });

  it("renders name as a link when enableLink and evaluatorUuid are set", () => {
    render(
      <EvaluatorVerdictCard
        mode="read"
        name="Linked Eval"
        outputType="binary"
        match={true}
        enableLink
        evaluatorUuid="abc-123"
      />,
    );
    const link = screen.getByRole("link", { name: "Linked Eval" });
    expect(link).toHaveAttribute("href", "/evaluators/abc-123");
  });

  it("renders name as plain text when enableLink is false", () => {
    render(
      <EvaluatorVerdictCard
        mode="read"
        name="Plain Eval"
        outputType="binary"
        match={true}
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
    expect(screen.getByText("Plain Eval")).toBeInTheDocument();
  });

  it("renders name as plain text when enableLink is set but uuid missing", () => {
    render(
      <EvaluatorVerdictCard
        mode="read"
        name="Plain Eval 2"
        outputType="binary"
        match={true}
        enableLink
      />,
    );
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});

describe("EvaluatorVerdictCard - read mode reasoning/variables toggle", () => {
  it("shows 'See reasoning' toggle when reasoning present, expands on click", async () => {
    const user = setupUser();
    render(
      <EvaluatorVerdictCard
        mode="read"
        name="Eval"
        outputType="binary"
        match={true}
        reasoning="Because it matched exactly."
      />,
    );
    const toggle = screen.getByRole("button", { name: /See reasoning/i });
    expect(
      screen.queryByText("Because it matched exactly."),
    ).not.toBeInTheDocument();
    await user.click(toggle);
    expect(
      screen.getByText("Because it matched exactly."),
    ).toBeInTheDocument();
    expect(screen.getByText("Hide reasoning")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Hide reasoning/i }));
    expect(
      screen.queryByText("Because it matched exactly."),
    ).not.toBeInTheDocument();
  });

  it("shows 'See variables' toggle when reasoning absent but variables present", async () => {
    const user = setupUser();
    render(
      <EvaluatorVerdictCard
        mode="read"
        name="Eval"
        outputType="binary"
        match={true}
        variableValues={{ foo: "bar" }}
      />,
    );
    const toggle = screen.getByRole("button", { name: /See variables/i });
    await user.click(toggle);
    expect(screen.getByText("{{foo}}")).toBeInTheDocument();
    expect(screen.getByText("bar")).toBeInTheDocument();
  });

  it("shows both variables and reasoning under the reasoning toggle when both present", async () => {
    const user = setupUser();
    render(
      <EvaluatorVerdictCard
        mode="read"
        name="Eval"
        outputType="binary"
        match={true}
        reasoning="Some reasoning"
        variableValues={{ x: "1" }}
      />,
    );
    await user.click(screen.getByRole("button", { name: /See reasoning/i }));
    expect(screen.getByText("Some reasoning")).toBeInTheDocument();
    expect(screen.getByText("{{x}}")).toBeInTheDocument();
  });

  it("renders no toggle when reasoning is blank and no variables", () => {
    render(
      <EvaluatorVerdictCard
        mode="read"
        name="Eval"
        outputType="binary"
        match={true}
        reasoning="   "
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("treats an empty variableValues object as no variables", () => {
    render(
      <EvaluatorVerdictCard
        mode="read"
        name="Eval"
        outputType="binary"
        match={true}
        variableValues={{}}
      />,
    );
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });
});

describe("EvaluatorVerdictCard - write mode binary", () => {
  it("calls onValueChange with true/false when buttons clicked", async () => {
    const user = setupUser();
    const onValueChange = jest.fn();
    render(
      <EvaluatorVerdictCard
        mode="write"
        name="Eval"
        outputType="binary"
        onValueChange={onValueChange}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Correct" }));
    expect(onValueChange).toHaveBeenCalledWith(true);
    await user.click(screen.getByRole("button", { name: "Wrong" }));
    expect(onValueChange).toHaveBeenCalledWith(false);
  });

  it("highlights the selected value and respects custom labels", () => {
    render(
      <EvaluatorVerdictCard
        mode="write"
        name="Eval"
        outputType="binary"
        value={true}
        trueLabel="Yep"
        falseLabel="Nah"
      />,
    );
    expect(screen.getByRole("button", { name: "Yep" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Nah" })).toBeInTheDocument();
  });

  it("disables buttons when disabled prop is set", () => {
    render(
      <EvaluatorVerdictCard
        mode="write"
        name="Eval"
        outputType="binary"
        disabled
      />,
    );
    expect(screen.getByRole("button", { name: "Correct" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Wrong" })).toBeDisabled();
  });

  it("highlights the false button when value is false", () => {
    render(
      <EvaluatorVerdictCard mode="write" name="Eval" outputType="binary" value={false} />,
    );
    expect(screen.getByRole("button", { name: "Wrong" })).toHaveClass(
      "bg-red-100",
    );
  });
});

describe("EvaluatorVerdictCard - write mode rating", () => {
  it("shows an error when scale bounds are missing", () => {
    render(
      <EvaluatorVerdictCard mode="write" name="Eval" outputType="rating" />,
    );
    expect(
      screen.getByText(/Rating scale is missing for this evaluator/),
    ).toBeInTheDocument();
  });

  it("shows an error when scaleMax < scaleMin", () => {
    render(
      <EvaluatorVerdictCard
        mode="write"
        name="Eval"
        outputType="rating"
        scaleMin={5}
        scaleMax={1}
      />,
    );
    expect(
      screen.getByText(/Invalid rating scale \(5\.\.1\)/),
    ).toBeInTheDocument();
  });

  it("renders one button per value in range and calls onValueChange", async () => {
    const user = setupUser();
    const onValueChange = jest.fn();
    render(
      <EvaluatorVerdictCard
        mode="write"
        name="Eval"
        outputType="rating"
        scaleMin={1}
        scaleMax={3}
        onValueChange={onValueChange}
      />,
    );
    expect(screen.getByRole("button", { name: "1" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "2" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "3" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "2" }));
    expect(onValueChange).toHaveBeenCalledWith(2);
  });

  it("highlights the currently active rating value", () => {
    render(
      <EvaluatorVerdictCard
        mode="write"
        name="Eval"
        outputType="rating"
        scaleMin={1}
        scaleMax={3}
        value={2}
      />,
    );
    expect(screen.getByRole("button", { name: "2" })).toHaveClass(
      "bg-foreground",
    );
  });

  it("renders per-level labels beneath the numbers when ratingScale has names", () => {
    render(
      <EvaluatorVerdictCard
        mode="write"
        name="Eval"
        outputType="rating"
        scaleMin={1}
        scaleMax={2}
        ratingScale={[
          { value: 1, name: "Bad" },
          { value: 2, name: "Good" },
        ]}
      />,
    );
    expect(screen.getByText("Bad")).toBeInTheDocument();
    expect(screen.getByText("Good")).toBeInTheDocument();
  });
});

describe("EvaluatorVerdictCard - write mode variables + reasoning", () => {
  it("renders variables block inline in write mode", () => {
    render(
      <EvaluatorVerdictCard
        mode="write"
        name="Eval"
        outputType="binary"
        variableValues={{ input: "hello" }}
      />,
    );
    expect(screen.getByText("{{input}}")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
  });

  it("calls onCommentChange when the reasoning textarea changes", async () => {
    const user = setupUser();
    const onCommentChange = jest.fn();
    render(
      <EvaluatorVerdictCard
        mode="write"
        name="Eval"
        outputType="binary"
        comment=""
        onCommentChange={onCommentChange}
      />,
    );
    const textarea = screen.getByPlaceholderText("Add your reasoning");
    await user.type(textarea, "x");
    expect(onCommentChange).toHaveBeenCalledWith("x");
  });

  it("shows disabled textarea without placeholder and without '(optional)' label", () => {
    render(
      <EvaluatorVerdictCard
        mode="write"
        name="Eval"
        outputType="binary"
        disabled
      />,
    );
    const textarea = screen.getByRole("textbox");
    expect(textarea).toBeDisabled();
    expect(textarea).toHaveAttribute("placeholder", "");
    expect(screen.getByText("Reasoning")).toBeInTheDocument();
  });
});

describe("ReasoningToggleButton", () => {
  it("renders closed reasoning label by default and calls onToggle", async () => {
    const user = setupUser();
    const onToggle = jest.fn();
    render(<ReasoningToggleButton open={false} onToggle={onToggle} />);
    expect(screen.getByText("See reasoning")).toBeInTheDocument();
    await user.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalled();
  });

  it("renders open reasoning label", () => {
    render(<ReasoningToggleButton open={true} onToggle={jest.fn()} />);
    expect(screen.getByText("Hide reasoning")).toBeInTheDocument();
  });

  it("renders variables kind labels", () => {
    const { rerender } = render(
      <ReasoningToggleButton open={false} onToggle={jest.fn()} kind="variables" />,
    );
    expect(screen.getByText("See variables")).toBeInTheDocument();
    rerender(
      <ReasoningToggleButton open={true} onToggle={jest.fn()} kind="variables" />,
    );
    expect(screen.getByText("Hide variables")).toBeInTheDocument();
  });

  it("stops propagation on click", async () => {
    const user = setupUser();
    const onToggle = jest.fn();
    const parentClick = jest.fn();
    render(
      <div onClick={parentClick}>
        <ReasoningToggleButton open={false} onToggle={onToggle} />
      </div>,
    );
    await user.click(screen.getByRole("button"));
    expect(onToggle).toHaveBeenCalled();
    expect(parentClick).not.toHaveBeenCalled();
  });
});

describe("ReasoningExpandedContent", () => {
  it("renders text without label by default, muted body", () => {
    render(<ReasoningExpandedContent text="Some text" />);
    expect(screen.getByText("Some text")).toBeInTheDocument();
    expect(screen.queryByText("Reasoning")).not.toBeInTheDocument();
  });

  it("renders the 'Reasoning' label when showReasoningLabel is true", () => {
    render(<ReasoningExpandedContent text="Some text" showReasoningLabel />);
    expect(screen.getByText("Reasoning")).toBeInTheDocument();
  });

  it("applies italic class when italic is true", () => {
    render(<ReasoningExpandedContent text="Italic text" italic />);
    expect(screen.getByText("Italic text")).toHaveClass("italic");
  });

  it("uses foreground text color when mutedBody is false", () => {
    render(<ReasoningExpandedContent text="Body text" mutedBody={false} />);
    expect(screen.getByText("Body text")).toHaveClass("text-foreground");
  });
});
