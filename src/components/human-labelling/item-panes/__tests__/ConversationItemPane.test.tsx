import React from "react";
import { render, screen } from "@/test-utils";
import { ConversationItemPane } from "../ConversationItemPane";

// jsdom doesn't implement scrollIntoView; TestDetailView (rendered by
// ConversationItemPane when there is any history) calls it in a useEffect.
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

describe("ConversationItemPane", () => {
  it("shows an em-dash placeholder when transcript is missing", () => {
    render(<ConversationItemPane payload={{}} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows an em-dash placeholder when transcript is not an array", () => {
    render(<ConversationItemPane payload={{ transcript: "not-an-array" }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows an em-dash placeholder when transcript is an array of unusable items", () => {
    render(
      <ConversationItemPane
        payload={{
          transcript: [
            null,
            "a string",
            42,
            { role: "assistant" }, // no content, no tool_calls
            { role: "user" }, // no content
            { role: "tool" }, // no content
            { role: "unknown-role", content: "x" },
          ],
        }}
      />
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders user and assistant turns with timestamps", () => {
    render(
      <ConversationItemPane
        payload={{
          transcript: [
            { role: "user", content: "Hi", created_at: "2024-01-01T00:00:00Z" },
            { role: "assistant", content: "Hello!" },
          ],
        }}
      />
    );
    expect(screen.getByText("Hi")).toBeInTheDocument();
    expect(screen.getByText("Hello!")).toBeInTheDocument();
  });

  it("surfaces a tool turn's content inline on its parent tool_call card", () => {
    render(
      <ConversationItemPane
        payload={{
          transcript: [
            {
              role: "assistant",
              tool_calls: [
                {
                  id: "call-1",
                  type: "function",
                  function: { name: "lookup", arguments: "{}" },
                },
              ],
            },
            {
              role: "tool",
              content: "tool result",
              tool_call_id: "call-1",
            },
          ],
        }}
      />
    );
    expect(screen.getByText("lookup")).toBeInTheDocument();
  });

  it("renders assistant turns with tool_calls and no content", () => {
    render(
      <ConversationItemPane
        payload={{
          transcript: [
            {
              role: "assistant",
              tool_calls: [
                {
                  id: "call-1",
                  type: "function",
                  function: { name: "lookup", arguments: "{}" },
                },
              ],
            },
          ],
        }}
      />
    );
    // TestDetailView should render something for the tool call turn rather
    // than falling back to the empty placeholder.
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("renders assistant turns with both content and tool_calls (tool-call view wins)", () => {
    render(
      <ConversationItemPane
        payload={{
          transcript: [
            {
              role: "assistant",
              content: "Let me check that",
              tool_calls: [
                {
                  id: "call-1",
                  type: "function",
                  function: { name: "lookup", arguments: "{}" },
                },
              ],
            },
          ],
        }}
      />
    );
    // The tool-call rendering path takes precedence over the plain-text
    // assistant message when both content and tool_calls are present.
    expect(screen.getByText("lookup")).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("skips tool turns without content", () => {
    render(
      <ConversationItemPane
        payload={{
          transcript: [
            { role: "tool", tool_call_id: "call-1" },
            { role: "user", content: "Hello" },
          ],
        }}
      />
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("normalises a tool turn with content but no tool_call_id (still not rendered inline)", () => {
    render(
      <ConversationItemPane
        payload={{
          transcript: [
            { role: "tool", content: "orphan tool result" },
            { role: "user", content: "Hello" },
          ],
        }}
      />
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});
