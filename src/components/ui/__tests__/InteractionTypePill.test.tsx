import { render, screen, setupUser } from "@/test-utils";
import { InteractionTypePill } from "../InteractionTypePill";

describe("InteractionTypePill", () => {
  it("reads Conversation by default", () => {
    render(<InteractionTypePill interactionType="conversation" />);
    expect(screen.getByText("Conversation")).toBeInTheDocument();
  });

  it("falls back to Conversation when the type is missing", () => {
    render(<InteractionTypePill />);
    expect(screen.getByText("Conversation")).toBeInTheDocument();
  });

  it("reads Single Agent Response for a general agent", () => {
    render(<InteractionTypePill interactionType="general" />);
    expect(screen.getByText("Single Agent Response")).toHaveClass(
      "bg-teal-500/10"
    );
  });

  it("describes the kind of agent on hover", async () => {
    const user = setupUser();
    render(<InteractionTypePill interactionType="general" />);

    await user.hover(screen.getByText("Single Agent Response"));
    expect(
      await screen.findByText("The agent takes an input and generates an output")
    ).toBeInTheDocument();
  });

  it("sits in the line of text so a sentence around it stays on one line", () => {
    render(<InteractionTypePill interactionType="conversation" />);
    expect(screen.getByText("Conversation").parentElement).toHaveClass(
      "inline-block"
    );
  });

  it("takes padding and corner classes from the caller", () => {
    render(
      <InteractionTypePill
        interactionType="conversation"
        className="px-1.5 py-0.5 rounded"
      />
    );
    expect(screen.getByText("Conversation")).toHaveClass("px-1.5", "rounded");
  });
});
