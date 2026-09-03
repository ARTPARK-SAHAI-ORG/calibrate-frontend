/**
 * The two cards someone picks between when an agent is created or copied.
 */
import { render, screen, setupUser } from "@/test-utils";
import { InteractionTypeChooser } from "../InteractionTypeChooser";
import { INTERACTION_TYPES } from "../InteractionTypePill";

const SELECTED_CLASSES = ["border-foreground", "bg-muted/30"];

function cardFor(type: "conversation" | "general") {
  const card = document.querySelector(`[data-tour="agent-nature-${type}"]`);
  if (!card) throw new Error(`no card for ${type}`);
  return card as HTMLButtonElement;
}

function isSelected(type: "conversation" | "general") {
  const { classList } = cardFor(type);
  return SELECTED_CLASSES.every((c) => classList.contains(c));
}

describe("InteractionTypeChooser", () => {
  it("renders both options with their label and description", () => {
    render(<InteractionTypeChooser value="conversation" onChange={jest.fn()} />);

    for (const { label, description } of Object.values(INTERACTION_TYPES)) {
      expect(screen.getByText(label)).toBeInTheDocument();
      expect(screen.getByText(description)).toBeInTheDocument();
    }
  });

  it("marks the option matching value as selected and the other as not", () => {
    const { rerender } = render(
      <InteractionTypeChooser value="conversation" onChange={jest.fn()} />,
    );
    expect(isSelected("conversation")).toBe(true);
    expect(isSelected("general")).toBe(false);

    rerender(<InteractionTypeChooser value="general" onChange={jest.fn()} />);
    expect(isSelected("general")).toBe(true);
    expect(isSelected("conversation")).toBe(false);
  });

  it("calls onChange with general when the other option is clicked", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(<InteractionTypeChooser value="conversation" onChange={onChange} />);

    await user.click(cardFor("general"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("general");
  });

  it("calls onChange with conversation when the other option is clicked", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(<InteractionTypeChooser value="general" onChange={onChange} />);

    await user.click(cardFor("conversation"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("conversation");
  });

  it("shows the Most popular badge only when asked, and only on Conversation", () => {
    const { rerender } = render(
      <InteractionTypeChooser value="conversation" onChange={jest.fn()} />,
    );
    expect(screen.queryByText("Most popular")).not.toBeInTheDocument();

    rerender(
      <InteractionTypeChooser
        value="conversation"
        onChange={jest.fn()}
        highlightPopular
      />,
    );
    const badge = screen.getByText("Most popular");
    expect(cardFor("conversation")).toContainElement(badge);
    expect(cardFor("general")).not.toContainElement(badge);
  });

  it("uses the default label and lets a custom one replace it", () => {
    const { rerender } = render(
      <InteractionTypeChooser value="conversation" onChange={jest.fn()} />,
    );
    expect(screen.getByText("What does your agent do?")).toBeInTheDocument();

    rerender(
      <InteractionTypeChooser
        value="conversation"
        onChange={jest.fn()}
        label="What does the copy do?"
      />,
    );
    expect(screen.getByText("What does the copy do?")).toBeInTheDocument();
    expect(
      screen.queryByText("What does your agent do?"),
    ).not.toBeInTheDocument();
  });
});
