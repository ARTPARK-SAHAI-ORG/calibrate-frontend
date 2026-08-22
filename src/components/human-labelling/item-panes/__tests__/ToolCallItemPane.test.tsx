import React from "react";
import { render, screen } from "@/test-utils";
import { ToolCallItemPane } from "../ToolCallItemPane";

// jsdom doesn't implement scrollIntoView; TestDetailView (rendered when there
// is any history/output) calls it in a useEffect.
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

describe("ToolCallItemPane", () => {
  it("shows a placeholder when there is nothing to render", () => {
    render(<ToolCallItemPane payload={{}} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders the conversation history", () => {
    render(
      <ToolCallItemPane
        payload={{
          chat_history: [{ role: "user", content: "Book a flight" }],
          expected_tool_calls: [
            { function: { name: "book_flight", arguments: "{}" } },
          ],
          actual_tool_calls: [],
        }}
      />,
    );
    expect(screen.getByText("Book a flight")).toBeInTheDocument();
  });

  it("renders the agent's actual tool call", () => {
    render(
      <ToolCallItemPane
        payload={{
          actual_tool_calls: [
            { function: { name: "book_flight", arguments: "{}" } },
          ],
          expected_tool_calls: [],
        }}
      />,
    );
    expect(screen.getByText("book_flight")).toBeInTheDocument();
  });

  it("shows the agent's text reply when it made no tool call (a failed test)", () => {
    render(
      <ToolCallItemPane
        payload={{
          chat_history: [{ role: "user", content: "Hi" }],
          expected_tool_calls: [
            { function: { name: "book_flight", arguments: "{}" } },
          ],
          actual_tool_calls: [],
          agent_response: "calling a tool with param success true",
        }}
      />,
    );
    expect(
      screen.getByText("calling a tool with param success true"),
    ).toBeInTheDocument();
  });

  it("does not render the expected tool calls (that's the other side's job now)", () => {
    render(
      <ToolCallItemPane
        payload={{
          chat_history: [{ role: "user", content: "Hi" }],
          expected_tool_calls: [
            { function: { name: "book_flight", arguments: "{}" } },
          ],
          actual_tool_calls: [],
        }}
      />,
    );
    expect(screen.queryByText("Expected Tool Calls")).not.toBeInTheDocument();
    expect(screen.queryByText("book_flight")).not.toBeInTheDocument();
  });
});
