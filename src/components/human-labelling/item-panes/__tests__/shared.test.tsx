import React from "react";
import { render, screen } from "@/test-utils";
import { Section, ChatMessage, normaliseHistoryItem } from "../shared";

describe("Section", () => {
  it("renders title, subtitle, and children", () => {
    render(
      <Section title="My Title" subtitle="My subtitle">
        <p>child content</p>
      </Section>,
    );
    expect(screen.getByText("My Title")).toBeInTheDocument();
    expect(screen.getByText("My subtitle")).toBeInTheDocument();
    expect(screen.getByText("child content")).toBeInTheDocument();
  });

  it("omits the subtitle when not provided", () => {
    render(
      <Section title="Just a title">
        <span>content</span>
      </Section>,
    );
    expect(screen.getByText("Just a title")).toBeInTheDocument();
    expect(screen.queryByText("My subtitle")).not.toBeInTheDocument();
  });
});

describe("ChatMessage", () => {
  it('labels role "assistant" as Agent and applies the assistant color', () => {
    render(<ChatMessage role="assistant" content="Hi there" />);
    const label = screen.getByText("Agent");
    expect(label).toBeInTheDocument();
    expect(label.className).toContain("text-blue-600");
    expect(screen.getByText("Hi there")).toBeInTheDocument();
  });

  it('labels role "agent" as Agent too', () => {
    render(<ChatMessage role="agent" content="Hi there" />);
    expect(screen.getByText("Agent")).toBeInTheDocument();
  });

  it('labels role "tool" as Tool', () => {
    render(<ChatMessage role="tool" content="Tool output" />);
    const label = screen.getByText("Tool");
    expect(label.className).not.toContain("text-blue-600");
  });

  it('labels role "user" (and any other role) as User', () => {
    render(<ChatMessage role="user" content="Hello" />);
    expect(screen.getByText("User")).toBeInTheDocument();
  });

  it("shows an em-dash placeholder when content is empty", () => {
    render(<ChatMessage role="user" content="" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("normaliseHistoryItem", () => {
  const extras = { label: "English", versions: { Hindi: "नमस्ते" } };
  const toolCall = {
    id: "call-1",
    type: "function",
    function: { name: "lookup", arguments: "{}" },
  };

  it.each([
    ["user", { role: "user", content: "Hi", ...extras }],
    ["assistant text", { role: "assistant", content: "Hello", ...extras }],
  ])("keeps label and versions on a %s turn", (_name, raw) => {
    const turn = normaliseHistoryItem(raw);
    expect(turn?.label).toBe("English");
    expect(turn?.versions).toEqual({ Hindi: "नमस्ते" });
  });

  it.each([
    [
      "assistant tool call",
      { role: "assistant", tool_calls: [toolCall], ...extras },
    ],
    [
      "tool",
      { role: "tool", content: "ok", tool_call_id: "call-1", ...extras },
    ],
  ])("drops label and versions on a %s turn, which never shows them", (_name, raw) => {
    const turn = normaliseHistoryItem(raw);
    expect(turn).not.toBeNull();
    expect(turn).not.toHaveProperty("label");
    expect(turn).not.toHaveProperty("versions");
  });

  it.each([
    ["user", { role: "user", content: "Hi" }],
    ["assistant text", { role: "assistant", content: "Hello" }],
    ["assistant tool call", { role: "assistant", tool_calls: [toolCall] }],
    ["tool", { role: "tool", content: "ok" }],
  ])(
    "has no label or versions keys on a %s turn without them",
    (_name, raw) => {
      const turn = normaliseHistoryItem(raw);
      expect(turn).not.toBeNull();
      expect(turn).not.toHaveProperty("label");
      expect(turn).not.toHaveProperty("versions");
    },
  );

  it("drops a blank label and a versions map with no text", () => {
    const turn = normaliseHistoryItem({
      role: "user",
      content: "Hi",
      label: "  ",
      versions: { Hindi: 5 },
    });
    expect(turn).toEqual({ role: "user", content: "Hi" });
  });
});
