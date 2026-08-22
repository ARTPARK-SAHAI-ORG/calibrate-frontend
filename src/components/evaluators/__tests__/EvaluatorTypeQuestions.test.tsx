import { useState } from "react";
import { render, screen, setupUser } from "@/test-utils";
import { EvaluatorTypeQuestions } from "../EvaluatorTypeQuestions";
import type { EvaluatorType } from "@/components/EvaluatorPills";

const ALL: EvaluatorType[] = [
  "llm",
  "conversation",
  "llm-general",
  "stt",
  "tts",
];

/** The questions report upwards, so drive them through a real parent. */
function Harness({
  allowed = ALL,
  onChange,
  firstQuestionNote,
}: {
  allowed?: EvaluatorType[];
  onChange?: (value: EvaluatorType | null) => void;
  firstQuestionNote?: string;
}) {
  const [value, setValue] = useState<EvaluatorType | null>(null);
  return (
    <>
      <EvaluatorTypeQuestions
        allowed={allowed}
        value={value}
        firstQuestionNote={firstQuestionNote}
        onChange={(next) => {
          setValue(next);
          onChange?.(next);
        }}
      />
      <div data-testid="chosen">{value ?? "none"}</div>
    </>
  );
}

const chosen = () => screen.getByTestId("chosen").textContent;

describe("EvaluatorTypeQuestions", () => {
  it("asks nothing below a question until it is answered", () => {
    render(<Harness />);
    expect(screen.getByText("What are you labelling?")).toBeInTheDocument();
    expect(screen.queryByText("Which one?")).not.toBeInTheDocument();
    expect(
      screen.queryByText("Is there a conversation?"),
    ).not.toBeInTheDocument();
  });

  it("reaches a single reply in a conversation", async () => {
    const user = setupUser();
    render(<Harness />);
    await user.click(screen.getByText("Text"));
    await user.click(screen.getByText("A conversation"));
    expect(chosen()).toBe("none");
    await user.click(screen.getByText("A single reply"));
    expect(chosen()).toBe("llm");
  });

  it("reaches the whole conversation", async () => {
    const user = setupUser();
    render(<Harness />);
    await user.click(screen.getByText("Text"));
    await user.click(screen.getByText("A conversation"));
    await user.click(screen.getByText("The whole conversation"));
    expect(chosen()).toBe("conversation");
  });

  it("reaches a single response without a third question", async () => {
    const user = setupUser();
    render(<Harness />);
    await user.click(screen.getByText("Text"));
    await user.click(screen.getByText("Single LLM response"));
    expect(chosen()).toBe("llm-general");
    expect(
      screen.queryByText("What do you want judged?"),
    ).not.toBeInTheDocument();
  });

  it("reaches both audio kinds", async () => {
    const user = setupUser();
    render(<Harness />);
    await user.click(screen.getByText("Voice"));
    await user.click(screen.getByText("Speech to Text"));
    expect(chosen()).toBe("stt");
    await user.click(screen.getByText("Text to Speech"));
    expect(chosen()).toBe("tts");
  });

  it("clears the answers under one that changes", async () => {
    const user = setupUser();
    render(<Harness />);
    await user.click(screen.getByText("Text"));
    await user.click(screen.getByText("A conversation"));
    await user.click(screen.getByText("A single reply"));
    expect(chosen()).toBe("llm");

    await user.click(screen.getByText("Voice"));
    expect(chosen()).toBe("none");
    expect(screen.queryByText("A single reply")).not.toBeInTheDocument();
    expect(screen.queryByText("A conversation")).not.toBeInTheDocument();
  });

  it("clears the kind when the branch inside text changes", async () => {
    const user = setupUser();
    render(<Harness />);
    await user.click(screen.getByText("Text"));
    await user.click(screen.getByText("Single LLM response"));
    expect(chosen()).toBe("llm-general");

    await user.click(screen.getByText("A conversation"));
    expect(chosen()).toBe("none");
  });

  it("does nothing when the answer already chosen is clicked again", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(<Harness onChange={onChange} />);
    await user.click(screen.getByText("Text"));
    onChange.mockClear();
    await user.click(screen.getByText("Text"));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("skips text or voice when only text kinds are on offer", async () => {
    const user = setupUser();
    render(<Harness allowed={["llm", "llm-general"]} />);
    expect(screen.queryByText("Voice")).not.toBeInTheDocument();
    expect(screen.getByText("Is there a conversation?")).toBeInTheDocument();

    // Only one conversation kind is left, so choosing a conversation is the
    // whole answer and no further question is asked.
    await user.click(screen.getByText("A conversation"));
    expect(chosen()).toBe("llm");
    expect(
      screen.queryByText("What do you want judged?"),
    ).not.toBeInTheDocument();
  });

  it("skips text or voice, and the kind question, when only audio is on offer", async () => {
    render(<Harness allowed={["stt", "tts"]} />);
    expect(
      screen.queryByText("What are you labelling?"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("Which one?")).toBeInTheDocument();
  });

  it("takes the only audio kind without asking which one", async () => {
    const user = setupUser();
    render(<Harness allowed={["llm", "stt"]} />);
    await user.click(screen.getByText("Voice"));
    expect(chosen()).toBe("stt");
    expect(screen.queryByText("Which one?")).not.toBeInTheDocument();
  });

  it("asks only what is judged when both conversation kinds are on offer alone", () => {
    render(<Harness allowed={["llm", "conversation"]} />);
    expect(
      screen.queryByText("What are you labelling?"),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText("Is there a conversation?"),
    ).not.toBeInTheDocument();
    expect(screen.getByText("What do you want judged?")).toBeInTheDocument();
  });

  it("shows the note under the first question actually asked", () => {
    render(
      <Harness
        allowed={["llm", "llm-general"]}
        firstQuestionNote="Cannot be changed later"
      />,
    );
    expect(screen.getByText("Cannot be changed later")).toBeInTheDocument();
  });
});
