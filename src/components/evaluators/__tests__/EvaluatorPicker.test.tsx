import { render, screen, setupUser } from "@/test-utils";
import { EvaluatorPicker } from "../EvaluatorPicker";
import type { EvaluatorData } from "@/lib/evaluatorApi";

// The prompt column does its own fetching; this file is about the list.
jest.mock("../EvaluatorPromptPreview", () => ({
  EvaluatorPromptPreview: ({
    evaluatorUuid,
  }: {
    evaluatorUuid: string | null;
  }) => (
    <div data-testid="prompt-preview">preview:{evaluatorUuid ?? "none"}</div>
  ),
}));

const evaluator = (over: Partial<EvaluatorData> = {}): EvaluatorData => ({
  uuid: over.uuid ?? "ev-1",
  name: over.name ?? "Evaluator",
  description: over.description ?? "Description",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  owner_user_id: "user-1",
  // Defaults are distinguished by is_default only (every evaluator has an owner).
  is_default: over.is_default ?? false,
  output_type: "binary",
  evaluator_type: "llm",
  ...over,
});

const setup = (
  props: Partial<React.ComponentProps<typeof EvaluatorPicker>>,
) => {
  const onToggle = jest.fn();
  render(
    <EvaluatorPicker
      evaluators={[]}
      selectedIds={new Set()}
      onToggle={onToggle}
      emptyMessage="Nothing to add"
      {...props}
    />,
  );
  return { onToggle };
};

describe("EvaluatorPicker", () => {
  it("renders a row per evaluator with its name and description", () => {
    setup({
      evaluators: [
        evaluator({
          uuid: "ev-a",
          name: "Tone check",
          description: "Checks the tone of the reply",
        }),
        evaluator({ uuid: "ev-b", name: "Policy fit" }),
      ],
    });

    expect(screen.getByText("Tone check")).toBeInTheDocument();
    expect(
      screen.getByText("Checks the tone of the reply"),
    ).toBeInTheDocument();
    expect(screen.getByText("Policy fit")).toBeInTheDocument();
    expect(screen.getAllByRole("checkbox")).toHaveLength(2);
  });

  it("puts the box level with the name, description or not", () => {
    setup({
      evaluators: [
        evaluator({
          uuid: "ev-a",
          name: "Tone check",
          description: "Some text",
        }),
        evaluator({ uuid: "ev-b", name: "Policy fit", description: null }),
      ],
    });

    // Both boxes sit centred in a box the height of one line of the name, so
    // the description underneath one of them changes nothing.
    const [withText, withoutText] = screen.getAllByRole("checkbox");
    for (const box of [withText, withoutText]) {
      expect(box.parentElement).toHaveClass("h-5", "items-center");
      expect(box).not.toHaveClass("mt-0.5");
      expect(box.parentElement?.parentElement).toHaveClass("items-start");
    }
  });

  it("narrows the list as the user searches", async () => {
    const user = setupUser();
    setup({
      evaluators: [
        evaluator({ uuid: "ev-a", name: "Tone check" }),
        evaluator({ uuid: "ev-b", name: "Policy fit" }),
      ],
    });

    await user.type(screen.getByPlaceholderText("Search evaluators"), "tone");

    expect(screen.getByText("Tone check")).toBeInTheDocument();
    expect(screen.queryByText("Policy fit")).not.toBeInTheDocument();
  });

  it("splits default and owned evaluators into sections", () => {
    setup({
      evaluators: [
        evaluator({ uuid: "ev-a", name: "Correctness", is_default: true }),
        evaluator({ uuid: "ev-b", name: "Tone check" }),
      ],
    });

    expect(screen.getByText("My evaluators")).toBeInTheDocument();
    expect(screen.getByText("Default")).toBeInTheDocument();
  });

  it("hides the section headers when every evaluator is owned", () => {
    setup({ evaluators: [evaluator({ uuid: "ev-a", name: "Tone check" })] });

    expect(screen.queryByText("My evaluators")).not.toBeInTheDocument();
    expect(screen.queryByText("Default")).not.toBeInTheDocument();
  });

  it("reports the clicked evaluator through onToggle", async () => {
    const user = setupUser();
    const { onToggle } = setup({
      evaluators: [evaluator({ uuid: "ev-a", name: "Tone check" })],
    });

    await user.click(screen.getByRole("checkbox"));

    expect(onToggle).toHaveBeenCalledWith("ev-a");
  });

  it("shows the selected evaluators as checked", () => {
    setup({
      evaluators: [
        evaluator({ uuid: "ev-a", name: "Tone check" }),
        evaluator({ uuid: "ev-b", name: "Policy fit" }),
      ],
      selectedIds: new Set(["ev-a"]),
    });

    const [first, second] = screen.getAllByRole("checkbox");
    expect(first).toBeChecked();
    expect(second).not.toBeChecked();
  });

  it("says nothing matched when the search excludes every evaluator", async () => {
    const user = setupUser();
    setup({ evaluators: [evaluator({ uuid: "ev-a", name: "Tone check" })] });

    await user.type(
      screen.getByPlaceholderText("Search evaluators"),
      "missing",
    );

    expect(screen.getByText("No matching evaluators.")).toBeInTheDocument();
    expect(screen.queryByText("Nothing to add")).not.toBeInTheDocument();
  });

  it("shows the caller's message when there are no evaluators at all", () => {
    setup({
      evaluators: [],
      emptyMessage: "Every evaluator in your library is already added",
    });

    expect(
      screen.getByText("Every evaluator in your library is already added"),
    ).toBeInTheDocument();
  });
});

describe("EvaluatorPicker prompt column", () => {
  it("shows nothing until a row is clicked", () => {
    render(
      <EvaluatorPicker
        evaluators={[evaluator()]}
        selectedIds={new Set()}
        onToggle={jest.fn()}
      />,
    );
    expect(screen.getByTestId("prompt-preview")).toHaveTextContent(
      "preview:none",
    );
  });

  it("opens a row's prompt without ticking it", async () => {
    const user = setupUser();
    const onToggle = jest.fn();
    render(
      <EvaluatorPicker
        evaluators={[evaluator({ uuid: "ev-9", name: "Conciseness" })]}
        selectedIds={new Set()}
        onToggle={onToggle}
      />,
    );

    await user.click(screen.getByText("Conciseness"));
    expect(screen.getByTestId("prompt-preview")).toHaveTextContent(
      "preview:ev-9",
    );
    expect(onToggle).not.toHaveBeenCalled();
  });

  it("ticks from the checkbox without changing the prompt on show", async () => {
    const user = setupUser();
    const onToggle = jest.fn();
    render(
      <EvaluatorPicker
        evaluators={[evaluator({ uuid: "ev-9", name: "Conciseness" })]}
        selectedIds={new Set()}
        onToggle={onToggle}
      />,
    );

    await user.click(screen.getByLabelText("Select Conciseness"));
    expect(onToggle).toHaveBeenCalledWith("ev-9");
    expect(screen.getByTestId("prompt-preview")).toHaveTextContent(
      "preview:none",
    );
  });
});

describe("EvaluatorPicker hidden types", () => {
  it("shows full-conversation evaluators when the caller allows them", () => {
    render(
      <EvaluatorPicker
        evaluators={[
          evaluator({
            uuid: "b",
            name: "Whole chat judge",
            evaluator_type: "conversation",
          }),
        ]}
        selectedIds={new Set()}
        onToggle={jest.fn()}
        allowConversationType
      />,
    );
    expect(screen.getByText("Whole chat judge")).toBeInTheDocument();
  });

  it("leaves out full-conversation evaluators", () => {
    render(
      <EvaluatorPicker
        evaluators={[
          evaluator({ uuid: "a", name: "Reply judge", evaluator_type: "llm" }),
          evaluator({
            uuid: "b",
            name: "Whole chat judge",
            evaluator_type: "conversation",
          }),
        ]}
        selectedIds={new Set()}
        onToggle={jest.fn()}
      />,
    );
    expect(screen.getByText("Reply judge")).toBeInTheDocument();
    expect(screen.queryByText("Whole chat judge")).not.toBeInTheDocument();
  });

  it("shows the name without type or scoring pills", () => {
    render(
      <EvaluatorPicker
        evaluators={[
          evaluator({
            uuid: "a",
            name: "Reply judge",
            evaluator_type: "llm",
            output_type: "binary",
          }),
        ]}
        selectedIds={new Set()}
        onToggle={jest.fn()}
      />,
    );
    expect(screen.queryByText("LLM reply")).not.toBeInTheDocument();
    expect(screen.queryByText("Binary")).not.toBeInTheDocument();
  });
});
