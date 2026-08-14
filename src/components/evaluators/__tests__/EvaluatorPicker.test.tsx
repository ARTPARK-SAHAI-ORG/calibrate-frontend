import { render, screen, setupUser } from "@/test-utils";
import { EvaluatorPicker } from "../EvaluatorPicker";
import type { EvaluatorData } from "@/lib/evaluatorApi";

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

const setup = (props: Partial<React.ComponentProps<typeof EvaluatorPicker>>) => {
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
    setup({ evaluators: [], emptyMessage: "All evaluators are already added" });

    expect(
      screen.getByText("All evaluators are already added"),
    ).toBeInTheDocument();
  });

});
