import { render, screen, setupUser } from "@/test-utils";
import { ChoiceCard, EVALUATOR_USE_CASE_OPTIONS } from "../evaluatorUseCases";

describe("EVALUATOR_USE_CASE_OPTIONS", () => {
  it("contains the six canonical use cases in order", () => {
    expect(EVALUATOR_USE_CASE_OPTIONS).toEqual([
      "llm",
      "conversation",
      "llm-general",
      "tool-call",
      "stt",
      "tts",
    ]);
  });
});

describe("ChoiceCard", () => {
  it("renders the title and description", () => {
    render(
      <ChoiceCard
        title="Yes"
        description="Every reply is judged"
        selected={false}
        onSelect={jest.fn()}
        tone="neutral"
      />,
    );
    expect(screen.getByText("Yes")).toBeInTheDocument();
    expect(screen.getByText("Every reply is judged")).toBeInTheDocument();
  });

  it("marks the selected card with aria-pressed", () => {
    const { unmount } = render(
      <ChoiceCard title="Yes" selected onSelect={jest.fn()} tone="neutral" />,
    );
    expect(screen.getByRole("button", { name: "Yes" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    unmount();
    render(
      <ChoiceCard
        title="No"
        selected={false}
        onSelect={jest.fn()}
        tone="neutral"
      />,
    );
    expect(screen.getByRole("button", { name: "No" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("calls onSelect when clicked", async () => {
    const user = setupUser();
    const onSelect = jest.fn();
    render(
      <ChoiceCard
        title="Yes"
        selected={false}
        onSelect={onSelect}
        tone="neutral"
      />,
    );
    await user.click(screen.getByRole("button", { name: "Yes" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("uses plain tokens and no colour classes for a neutral card", () => {
    const { rerender } = render(
      <ChoiceCard
        title="Yes"
        selected={false}
        onSelect={jest.fn()}
        tone="neutral"
      />,
    );
    const inactive = screen.getByRole("button", { name: "Yes" });
    expect(inactive.className).not.toMatch(
      /purple|blue|orange|teal|pink|(^|\s)ring-/,
    );
    expect(inactive.className).toContain("border-border");
    expect(inactive.className).toContain("bg-muted/20");
    expect(screen.getByText("Yes").className).toContain("text-foreground");

    rerender(
      <ChoiceCard title="Yes" selected onSelect={jest.fn()} tone="neutral" />,
    );
    const active = screen.getByRole("button", { name: "Yes" });
    expect(active.className).not.toMatch(/purple|blue|orange|teal|pink/);
    expect(active.className).toContain("border-foreground");
    expect(active.className).toContain("ring-1 ring-foreground/20");
  });

  it("paints an evaluator-type card in that type's colour", () => {
    render(
      <ChoiceCard title="Yes" selected onSelect={jest.fn()} tone="blue" />,
    );
    expect(screen.getByRole("button", { name: "Yes" }).className).toContain(
      "ring-blue-500/40",
    );
  });
});
