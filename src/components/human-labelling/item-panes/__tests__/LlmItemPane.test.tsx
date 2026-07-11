import React from "react";
import { render, screen } from "@/test-utils";
import { LlmItemPane } from "../LlmItemPane";

// jsdom doesn't implement scrollIntoView; TestDetailView (rendered by
// LlmItemPane when there is any history) calls it in a useEffect.
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

describe("LlmItemPane", () => {
  it("shows an em-dash placeholder when there is no chat_history and no agent_response", () => {
    render(<LlmItemPane payload={{}} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows an em-dash placeholder when chat_history is not an array and agent_response is empty", () => {
    render(
      <LlmItemPane payload={{ chat_history: "nope", agent_response: "" }} />
    );
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("appends agent_response as a trailing assistant turn", () => {
    render(
      <LlmItemPane
        payload={{
          chat_history: [{ role: "user", content: "Hi" }],
          agent_response: "Hello, how can I help?",
        }}
      />
    );
    expect(screen.getByText("Hi")).toBeInTheDocument();
    expect(screen.getByText("Hello, how can I help?")).toBeInTheDocument();
  });

  it("renders when only agent_response is present (no chat_history)", () => {
    render(<LlmItemPane payload={{ agent_response: "Just a reply" }} />);
    expect(screen.getByText("Just a reply")).toBeInTheDocument();
  });

  it("ignores a non-string agent_response", () => {
    render(
      <LlmItemPane
        payload={{ chat_history: [{ role: "user", content: "Hi" }], agent_response: 42 }}
      />
    );
    expect(screen.getByText("Hi")).toBeInTheDocument();
  });

  it("normalises assistant turns with tool_calls, user turns, and tool turns", () => {
    render(
      <LlmItemPane
        payload={{
          chat_history: [
            null,
            "invalid",
            { role: "user", content: "Book a flight" },
            {
              role: "assistant",
              tool_calls: [
                {
                  id: "call-1",
                  type: "function",
                  function: { name: "book_flight", arguments: "{}" },
                },
              ],
            },
            {
              role: "tool",
              content: "Booked!",
              tool_call_id: "call-1",
              created_at: "2024-01-01T00:00:00Z",
            },
            { role: "assistant" }, // no content, no tool_calls -> dropped
            { role: "tool" }, // no content -> dropped
            { role: "bogus", content: "x" }, // unknown role -> dropped
          ],
        }}
      />
    );
    expect(screen.getByText("Book a flight")).toBeInTheDocument();
    expect(screen.getByText("Booked!")).toBeInTheDocument();
  });

  it("normalises an assistant tool_calls turn that also carries content", () => {
    render(
      <LlmItemPane
        payload={{
          chat_history: [
            {
              role: "assistant",
              content: "Let me look that up",
              tool_calls: [
                {
                  id: "call-2",
                  type: "function",
                  function: { name: "lookup", arguments: "{}" },
                },
              ],
            },
          ],
        }}
      />
    );
    expect(screen.getByText("lookup")).toBeInTheDocument();
  });

  it("normalises a plain assistant turn (content, no tool_calls) from chat_history", () => {
    render(
      <LlmItemPane
        payload={{
          chat_history: [
            { role: "user", content: "Hi" },
            { role: "assistant", content: "Hello from history!" },
          ],
        }}
      />
    );
    expect(screen.getByText("Hello from history!")).toBeInTheDocument();
  });

  it("drops an assistant turn with no content and no tool_calls", () => {
    render(
      <LlmItemPane
        payload={{
          chat_history: [
            { role: "assistant" },
            { role: "user", content: "Hello" },
          ],
        }}
      />
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });

  it("normalises a tool turn with content but no tool_call_id", () => {
    render(
      <LlmItemPane
        payload={{
          chat_history: [
            { role: "tool", content: "orphan tool result" },
            { role: "user", content: "Hello" },
          ],
        }}
      />
    );
    expect(screen.getByText("Hello")).toBeInTheDocument();
  });
});
