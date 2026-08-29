import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import { TestTypePicker } from "../TestTypePicker";

describe("TestTypePicker", () => {
  it("opens on the reply option and shows its example", () => {
    render(
      <TestTypePicker
        title="Create a test"
        onNext={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(screen.getByText("Create a test")).toBeInTheDocument();
    expect(
      screen.getByText("Select what you want to test about the agent"),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Does the agent give the right reply?"),
    ).toBeInTheDocument();
    expect(screen.getByText("Conversation history")).toBeInTheDocument();
    expect(screen.getByText("Agent's reply")).toBeInTheDocument();
  });

  it("shows the tool call example once that option is picked", async () => {
    const user = setupUser();
    render(
      <TestTypePicker
        title="Create a test"
        onNext={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    await user.click(screen.getByText("Does the agent use the right tool?"));
    expect(screen.getByText("Tool the agent used")).toBeInTheDocument();
    expect(screen.getByText("Tool it should have used")).toBeInTheDocument();
  });

  it("reports the picked type on Next", async () => {
    const user = setupUser();
    const onNext = jest.fn();
    render(
      <TestTypePicker
        title="Create a test"
        onNext={onNext}
        onClose={jest.fn()}
      />,
    );
    await user.click(screen.getByText("Does the agent use the right tool?"));
    await user.click(screen.getByRole("button", { name: "Next" }));
    expect(onNext).toHaveBeenCalledWith("tool-invocation");
  });

  it("asks about the answer, not the reply, for a single response agent", () => {
    render(
      <TestTypePicker
        title="Bulk upload tests"
        agentNature="general"
        onNext={jest.fn()}
        onClose={jest.fn()}
      />,
    );
    expect(
      screen.getByText("Does the agent give the right answer?"),
    ).toBeInTheDocument();
    expect(screen.getByText("Input")).toBeInTheDocument();
    expect(screen.getByText("Agent's output")).toBeInTheDocument();
  });

  it("closes from its close button", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    render(
      <TestTypePicker
        title="Create a test"
        onNext={jest.fn()}
        onClose={onClose}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalled();
  });
});
