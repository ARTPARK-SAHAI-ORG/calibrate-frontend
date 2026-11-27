import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import { KnowledgeBaseTabContent } from "../KnowledgeBaseTabContent";

function renderComponent(
  text = "",
  onTextChange = jest.fn(),
  maxChars: number | null = 5000,
) {
  render(
    <KnowledgeBaseTabContent
      text={text}
      onTextChange={onTextChange}
      maxChars={maxChars}
    />,
  );
  return { onTextChange };
}

describe("KnowledgeBaseTabContent", () => {
  it("shows the label, the description and a textarea found by its label", () => {
    renderComponent("Open 9 to 5");
    expect(
      screen.getByText(
        "Add the information the agent needs to answer users' queries, such as program details and FAQs",
      ),
    ).toBeInTheDocument();
    const textarea = screen.getByLabelText("Knowledge base");
    expect(textarea.tagName).toBe("TEXTAREA");
    expect(textarea).toHaveValue("Open 9 to 5");
    expect(textarea).toHaveAttribute(
      "placeholder",
      "Paste text here, for example your opening hours, services and fees",
    );
  });

  it("calls onTextChange when typing", async () => {
    const user = setupUser();
    const { onTextChange } = renderComponent();
    await user.type(screen.getByLabelText("Knowledge base"), "A");
    expect(onTextChange).toHaveBeenCalledWith("A");
  });

  it("shows the count when empty", () => {
    renderComponent();
    expect(screen.getByText("0 of 5,000 characters")).toBeInTheDocument();
    expect(screen.queryByText(/over the limit/)).not.toBeInTheDocument();
  });

  it("formats the count with a thousands separator", () => {
    renderComponent("a".repeat(1234));
    expect(screen.getByText("1,234 of 5,000 characters")).toBeInTheDocument();
  });

  it("counts an emoji as one character", () => {
    renderComponent("😀");
    expect(screen.getByText("1 of 5,000 characters")).toBeInTheDocument();
  });

  it("shows no over-limit message at exactly the limit", () => {
    renderComponent("a".repeat(5000));
    expect(screen.getByText("5,000 of 5,000 characters")).toHaveClass(
      "text-muted-foreground",
    );
    expect(screen.queryByText(/over the limit/)).not.toBeInTheDocument();
  });

  it("shows how far over the limit the text is, in red", () => {
    renderComponent("a".repeat(5007));
    expect(screen.getByText("7 characters over the limit")).toHaveClass(
      "text-red-500",
    );
    expect(screen.getByText("5,007 of 5,000 characters")).toHaveClass(
      "text-red-500",
    );
    expect(
      screen.getByLabelText("Knowledge base").parentElement,
    ).toHaveClass("border-red-500");
  });

  it("explains how the agent uses the text", () => {
    renderComponent();
    expect(
      screen.getByRole("heading", { name: "How the agent uses this text" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "In chats and in evaluations, the agent reads this text together with its system prompt.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "When you update the text, the agent uses the updated information from its next reply.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the count alone, never red, until the limit is known", () => {
    renderComponent("a".repeat(9000), jest.fn(), null);
    expect(screen.getByText("9,000 characters")).toHaveClass(
      "text-muted-foreground",
    );
    expect(screen.queryByText(/over the limit/)).not.toBeInTheDocument();
  });

  it("measures against whatever limit the backend gives", () => {
    renderComponent("a".repeat(30), jest.fn(), 20);
    expect(screen.getByText("30 of 20 characters")).toBeInTheDocument();
    expect(screen.getByText("10 characters over the limit")).toBeInTheDocument();
  });

  it("says character, not characters, when one over", () => {
    renderComponent("a".repeat(5001));
    expect(screen.getByText("1 character over the limit")).toBeInTheDocument();
  });
});
