import { render, screen, setupUser } from "@/test-utils";
import { LabellingJobIntro } from "../LabellingJobIntro";

describe("LabellingJobIntro", () => {
  it.each([
    ["llm", "Read each conversation and answer the questions about it", "Is the reply correct?"],
    ["conversation", "Read each conversation and answer the questions about it", "Was the agent polite?"],
    ["llm-general", "Read each input and output and answer the questions about them", "Is the output correct?"],
    ["stt", "Compare each pair of transcripts and answer the questions about them", "Do they match?"],
    ["tts", "Listen to each audio clip and answer the questions about it", "Does the audio match?"],
    ["tool-call", "Compare the agent's answer with the expected one, then answer the questions about it", "Is the answer right?"],
  ] as const)("welcomes a %s labeller with its own line and example", (kind, line, question) => {
    render(<LabellingJobIntro kind={kind} onSkip={jest.fn()} onStart={jest.fn()} />);
    expect(screen.getByRole("dialog", { name: "Welcome to your labelling task" })).toBeInTheDocument();
    expect(screen.getByText(line)).toBeInTheDocument();
    expect(screen.getByText(question)).toBeInTheDocument();
  });

  it("picks the right answer in the example, red where the right answer is no", () => {
    const { unmount } = render(<LabellingJobIntro kind="stt" onSkip={jest.fn()} onStart={jest.fn()} />);
    expect(screen.getByText("No")).toHaveClass("bg-red-600");
    unmount();
    render(<LabellingJobIntro kind="llm" onSkip={jest.fn()} onStart={jest.fn()} />);
    expect(screen.getByText("Correct")).toHaveClass("bg-green-600");
  });

  it("reports Skip, Escape and Show me how", async () => {
    const user = setupUser();
    const onSkip = jest.fn();
    const onStart = jest.fn();
    render(<LabellingJobIntro kind="llm" onSkip={onSkip} onStart={onStart} />);
    await user.click(screen.getByRole("button", { name: "Skip" }));
    expect(onSkip).toHaveBeenCalledTimes(1);
    await user.keyboard("{Escape}");
    expect(onSkip).toHaveBeenCalledTimes(2);
    await user.click(screen.getByRole("button", { name: "Show me how" }));
    expect(onStart).toHaveBeenCalledTimes(1);
  });
});
