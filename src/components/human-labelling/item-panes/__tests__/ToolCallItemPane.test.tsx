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

  it("labels the reply and the calls apart and says they are judged together", () => {
    render(
      <ToolCallItemPane
        payload={{
          chat_history: [{ role: "user", content: "Book a flight" }],
          agent_response: "One moment",
          actual_tool_calls: [{ tool: "book_flight", arguments: {} }],
        }}
      />,
    );
    expect(screen.getByText("One moment")).toBeInTheDocument();
    expect(screen.getByText("book_flight")).toBeInTheDocument();
    expect(screen.getByText("Agent's reply")).toBeInTheDocument();
    expect(screen.getByText("Agent's tool calls")).toBeInTheDocument();
    expect(
      screen.getByText("The reply and the tool calls are judged together"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Evaluation target")).toHaveLength(2);
  });

  it("labels a lone reply as the agent's answer, with no note", () => {
    render(
      <ToolCallItemPane
        payload={{ actual_tool_calls: [], agent_response: "No tool needed" }}
      />,
    );
    expect(screen.getByText("Agent's answer")).toBeInTheDocument();
    expect(
      screen.queryByText("The reply and the tool calls are judged together"),
    ).not.toBeInTheDocument();
  });

  it("reads tool_calls only when actual_tool_calls is not a list", () => {
    render(
      <ToolCallItemPane
        payload={{ tool_calls: [{ tool: "book_train", arguments: {} }] }}
      />,
    );
    expect(screen.getByText("book_train")).toBeInTheDocument();
  });

  it("draws the expected tool call under the conversation, headed as the expected answer", () => {
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
    expect(screen.getByText("Expected answer")).toBeInTheDocument();
    expect(screen.getByText("book_flight")).toBeInTheDocument();
  });

  it("never shows a pass/fail badge — a person is the one judging this item", () => {
    const { container } = render(
      <ToolCallItemPane
        payload={{
          chat_history: [{ role: "user", content: "Hi" }],
          agent_response: "calling a tool with param success true",
        }}
      />,
    );
    expect(container.querySelector(".bg-green-500\\/20")).toBeNull();
    expect(container.querySelector(".bg-red-500\\/20")).toBeNull();
    expect(container.querySelector(".border-l-green-500")).toBeNull();
    expect(container.querySelector(".border-l-red-500")).toBeNull();
  });

  it("shows an object agent_response with its label and versions", () => {
    render(
      <ToolCallItemPane
        payload={{
          chat_history: [{ role: "user", content: "Hi" }],
          actual_tool_calls: [],
          agent_response: {
            content: "I cannot do that",
            label: "English",
            versions: { Hindi: "मैं यह नहीं कर सकता" },
          },
        }}
      />,
    );
    expect(screen.getByText("I cannot do that")).toBeInTheDocument();
    expect(screen.getByText("English")).toBeInTheDocument();
    expect(screen.getByText("Hindi")).toBeInTheDocument();
    expect(screen.getByText("मैं यह नहीं कर सकता")).toBeInTheDocument();
  });

  it("ignores an object agent_response without content", () => {
    render(
      <ToolCallItemPane
        payload={{
          chat_history: [{ role: "user", content: "Hi" }],
          agent_response: { label: "English" },
        }}
      />,
    );
    expect(screen.getByText("Hi")).toBeInTheDocument();
    expect(screen.queryByText("English")).not.toBeInTheDocument();
  });

  it("still draws the expected answer when the agent's side is empty", () => {
    render(
      <ToolCallItemPane
        payload={{ expected_tool_calls: [{ tool: "book_train", arguments: {} }] }}
      />,
    );
    expect(screen.getByText("Expected answer")).toBeInTheDocument();
  });

  it("marks only the agent's calls as judged when an earlier agent turn sits right before them", () => {
    render(
      <ToolCallItemPane
        payload={{
          chat_history: [
            { role: "user", content: "Book a flight" },
            { role: "assistant", content: "Looking it up" },
          ],
          actual_tool_calls: [{ tool: "book_flight", arguments: {} }],
        }}
      />,
    );
    expect(screen.getAllByText("Evaluation target")).toHaveLength(1);
  });

  it("marks only the reply and the calls when an earlier agent tool call has no saved response", () => {
    render(
      <ToolCallItemPane
        payload={{
          chat_history: [
            { role: "user", content: "Book a flight" },
            {
              role: "assistant",
              tool_calls: [
                {
                  id: "call-0",
                  type: "function",
                  function: { name: "search_flights", arguments: "{}" },
                },
              ],
            },
          ],
          agent_response: "One moment",
          actual_tool_calls: [{ tool: "book_flight", arguments: {} }],
        }}
      />,
    );
    expect(screen.getByText("search_flights")).toBeInTheDocument();
    expect(screen.getAllByText("Evaluation target")).toHaveLength(2);
  });

  it("heads only the agent's own calls as its answer, not an earlier call in the conversation", () => {
    render(
      <ToolCallItemPane
        payload={{
          chat_history: [
            { role: "user", content: "Book a flight" },
            {
              role: "assistant",
              tool_calls: [
                {
                  id: "call-0",
                  type: "function",
                  function: { name: "search_flights", arguments: "{}" },
                },
              ],
            },
          ],
          actual_tool_calls: [{ tool: "book_flight", arguments: {} }],
        }}
      />,
    );
    expect(screen.getAllByText("Agent's answer")).toHaveLength(1);
    expect(screen.getByText("Agent Tool Call")).toBeInTheDocument();
  });
});
