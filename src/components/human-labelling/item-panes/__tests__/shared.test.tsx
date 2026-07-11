import React from "react";
import { render, screen } from "@/test-utils";
import { Section, ChatMessage } from "../shared";

describe("Section", () => {
  it("renders title, subtitle, and children", () => {
    render(
      <Section title="My Title" subtitle="My subtitle">
        <p>child content</p>
      </Section>
    );
    expect(screen.getByText("My Title")).toBeInTheDocument();
    expect(screen.getByText("My subtitle")).toBeInTheDocument();
    expect(screen.getByText("child content")).toBeInTheDocument();
  });

  it("omits the subtitle when not provided", () => {
    render(
      <Section title="Just a title">
        <span>content</span>
      </Section>
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
