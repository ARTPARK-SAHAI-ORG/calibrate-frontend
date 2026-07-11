import { render, screen, setupUser } from "@/test-utils";
import {
  EVALUATOR_USE_CASE_OPTIONS,
  EvaluatorUseCaseCards,
  type EvaluatorUseCaseOption,
} from "../evaluatorUseCases";

describe("EVALUATOR_USE_CASE_OPTIONS", () => {
  it("contains the five canonical use cases with expected groups", () => {
    expect(EVALUATOR_USE_CASE_OPTIONS.map((o) => o.value)).toEqual([
      "llm",
      "conversation",
      "llm-general",
      "stt",
      "tts",
    ]);
    expect(EVALUATOR_USE_CASE_OPTIONS.find((o) => o.value === "llm")?.group).toBe(
      "conversation",
    );
    expect(
      EVALUATOR_USE_CASE_OPTIONS.find((o) => o.value === "llm-general")?.group,
    ).toBe("text");
    expect(EVALUATOR_USE_CASE_OPTIONS.find((o) => o.value === "stt")?.group).toBe(
      "audio",
    );
    expect(EVALUATOR_USE_CASE_OPTIONS.find((o) => o.value === "tts")?.group).toBe(
      "audio",
    );
  });
});

describe("EvaluatorUseCaseCards", () => {
  it("renders section headers for groups present in options", () => {
    render(
      <EvaluatorUseCaseCards
        options={EVALUATOR_USE_CASE_OPTIONS}
        selected={null}
        onSelect={jest.fn()}
      />,
    );
    expect(screen.getByText("Conversation")).toBeInTheDocument();
    expect(screen.getByText("Text")).toBeInTheDocument();
    expect(screen.getByText("Audio")).toBeInTheDocument();
  });

  it("omits a section header when no options belong to that group", () => {
    const options = EVALUATOR_USE_CASE_OPTIONS.filter((o) => o.group !== "text");
    render(
      <EvaluatorUseCaseCards options={options} selected={null} onSelect={jest.fn()} />,
    );
    expect(screen.queryByText("Text")).not.toBeInTheDocument();
    expect(screen.getByText("Conversation")).toBeInTheDocument();
  });

  it("renders all option titles and descriptions", () => {
    render(
      <EvaluatorUseCaseCards
        options={EVALUATOR_USE_CASE_OPTIONS}
        selected={null}
        onSelect={jest.fn()}
      />,
    );
    for (const opt of EVALUATOR_USE_CASE_OPTIONS) {
      expect(screen.getByText(opt.title)).toBeInTheDocument();
      expect(screen.getByText(opt.description)).toBeInTheDocument();
    }
  });

  it("calls onSelect with the option's value when a card is clicked", async () => {
    const user = setupUser();
    const onSelect = jest.fn();
    render(
      <EvaluatorUseCaseCards
        options={EVALUATOR_USE_CASE_OPTIONS}
        selected={null}
        onSelect={onSelect}
      />,
    );
    await user.click(screen.getByText("LLM reply"));
    expect(onSelect).toHaveBeenCalledWith("llm");
  });

  it("applies active styling classes to the selected card", () => {
    render(
      <EvaluatorUseCaseCards
        options={EVALUATOR_USE_CASE_OPTIONS}
        selected="stt"
        onSelect={jest.fn()}
      />,
    );
    const card = screen.getByText("Speech to Text").closest("button");
    expect(card?.className).toContain("ring-blue-500/40");
  });

  it("applies inactive styling classes to non-selected cards", () => {
    render(
      <EvaluatorUseCaseCards
        options={EVALUATOR_USE_CASE_OPTIONS}
        selected="stt"
        onSelect={jest.fn()}
      />,
    );
    const card = screen.getByText("LLM reply").closest("button");
    expect(card?.className).toContain("hover:border-orange-500/40");
  });

  it("shows the 'Most common' badge only when recommended is true", () => {
    const options: EvaluatorUseCaseOption[] = [
      {
        value: "llm",
        title: "Recommended one",
        description: "desc",
        group: "conversation",
        recommended: true,
      },
      {
        value: "conversation",
        title: "Not recommended",
        description: "desc2",
        group: "conversation",
      },
    ];
    render(
      <EvaluatorUseCaseCards options={options} selected={null} onSelect={jest.fn()} />,
    );
    expect(screen.getByText("Most common")).toBeInTheDocument();
    const badges = screen.getAllByText("Most common");
    expect(badges).toHaveLength(1);
  });

  it("renders nothing (no groups) when options is empty", () => {
    const { container } = render(
      <EvaluatorUseCaseCards options={[]} selected={null} onSelect={jest.fn()} />,
    );
    expect(container.querySelectorAll("button")).toHaveLength(0);
    expect(screen.queryByText("Conversation")).not.toBeInTheDocument();
  });
});
