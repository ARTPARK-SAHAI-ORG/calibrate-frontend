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

  it("always shows the expected tool-call section heading", () => {
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
    expect(screen.getByText("Expected Tool Calls")).toBeInTheDocument();
    expect(screen.getByText("book_flight")).toBeInTheDocument();
  });

  it("says so when no expected tool calls are specified (a trace)", () => {
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
    expect(
      screen.getByText("No expected tool calls specified"),
    ).toBeInTheDocument();
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
    // The expected spec is still shown alongside the wrong text reply.
    expect(screen.getByText("Expected Tool Calls")).toBeInTheDocument();
  });
});
