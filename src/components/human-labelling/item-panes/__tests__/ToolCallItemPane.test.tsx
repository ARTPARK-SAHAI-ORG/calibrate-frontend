import React from "react";
import { render, screen } from "@/test-utils";
import { ToolCallItemPane } from "../ToolCallItemPane";

// jsdom doesn't implement scrollIntoView; TestDetailView calls it on mount.
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

describe("ToolCallItemPane", () => {
  it("shows an em-dash placeholder when the payload is empty", () => {
    render(<ToolCallItemPane payload={{}} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders the conversation, the actual tool call, and the expected spec", () => {
    render(
      <ToolCallItemPane
        payload={{
          chat_history: [{ role: "user", content: "book a flight to NYC" }],
          actual_tool_calls: [
            { tool: "book_flight", arguments: { city: "NYC" } },
          ],
          expected_tool_calls: [
            {
              tool: "book_flight",
              arguments: {
                city: { match_type: "llm_judge", criteria: "a valid city" },
              },
            },
          ],
        }}
      />,
    );
    expect(screen.getByText("book a flight to NYC")).toBeInTheDocument();
    expect(screen.getByText("Expected Tool Calls")).toBeInTheDocument();
    expect(screen.getAllByText("book_flight").length).toBeGreaterThanOrEqual(1);
    // The expected llm_judge arg renders as a "satisfies the criteria" spec.
    expect(screen.getByText("a valid city")).toBeInTheDocument();
  });

  it("notes when no expected tool calls are specified", () => {
    render(
      <ToolCallItemPane
        payload={{
          chat_history: [{ role: "user", content: "hi" }],
          actual_tool_calls: [{ tool: "noop", arguments: {} }],
          expected_tool_calls: [],
        }}
      />,
    );
    expect(
      screen.getByText("No expected tool calls specified"),
    ).toBeInTheDocument();
  });
});
