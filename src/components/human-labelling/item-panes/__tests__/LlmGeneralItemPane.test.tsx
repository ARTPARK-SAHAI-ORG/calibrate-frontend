import React from "react";
import { render, screen } from "@/test-utils";
import { LlmGeneralItemPane } from "../LlmGeneralItemPane";

describe("LlmGeneralItemPane", () => {
  it("renders input and output when both present", () => {
    render(
      <LlmGeneralItemPane
        payload={{ input: "Summarise this", output: "A short summary" }}
      />,
    );
    expect(screen.getByText("Input")).toBeInTheDocument();
    expect(screen.getByText("Summarise this")).toBeInTheDocument();
    expect(screen.getByText("Output")).toBeInTheDocument();
    expect(screen.getByText("A short summary")).toBeInTheDocument();
  });

  it("renders only output with em-dash for missing input", () => {
    render(<LlmGeneralItemPane payload={{ output: "Just output" }} />);
    expect(screen.getByText("Just output")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders only input with em-dash for missing output", () => {
    render(<LlmGeneralItemPane payload={{ input: "Just input" }} />);
    expect(screen.getByText("Just input")).toBeInTheDocument();
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("falls back to a raw JSON dump when neither input nor output is present", () => {
    render(<LlmGeneralItemPane payload={{ foo: "bar", n: 1 }} />);
    expect(screen.getByText("Item payload")).toBeInTheDocument();
    expect(screen.getByText(/"foo": "bar"/)).toBeInTheDocument();
  });

  it("falls back to raw JSON dump when input/output are non-string types", () => {
    render(<LlmGeneralItemPane payload={{ input: 5, output: null }} />);
    expect(screen.getByText("Item payload")).toBeInTheDocument();
  });

  it("treats empty-string input/output as falsy and falls back to JSON dump", () => {
    render(<LlmGeneralItemPane payload={{ input: "", output: "" }} />);
    expect(screen.getByText("Item payload")).toBeInTheDocument();
  });

  it("shows the tool calls the agent made when the output is empty", () => {
    render(
      <LlmGeneralItemPane
        payload={{
          input: "Book me a flight to Delhi",
          output: "",
          actual_tool_calls: [
            { tool: "book_flight", arguments: { destination: "Delhi" } },
          ],
          expected_tool_calls: [{ tool: "should_not_render", arguments: {} }],
        }}
      />,
    );
    expect(screen.getByText("Book me a flight to Delhi")).toBeInTheDocument();
    expect(screen.getByText("book_flight")).toBeInTheDocument();
    expect(screen.getByText("destination")).toBeInTheDocument();
    expect(screen.getByText("Delhi")).toBeInTheDocument();
    expect(screen.queryByText("Item payload")).not.toBeInTheDocument();
    expect(screen.queryByText("should_not_render")).not.toBeInTheDocument();
  });

  it("shows the text reply above the tool calls when there is both", () => {
    render(
      <LlmGeneralItemPane
        payload={{
          input: "Book a flight",
          output: "Let me look that up",
          actual_tool_calls: [{ tool: "book_flight", arguments: {} }],
        }}
      />,
    );
    expect(screen.getByText("Let me look that up")).toBeInTheDocument();
    expect(screen.getByText("book_flight")).toBeInTheDocument();
    expect(screen.queryByText("—")).not.toBeInTheDocument();
  });

  it("ignores an empty actual_tool_calls list", () => {
    render(
      <LlmGeneralItemPane
        payload={{ input: "", output: "", actual_tool_calls: [] }}
      />,
    );
    expect(screen.getByText("Item payload")).toBeInTheDocument();
  });

  const versioned = {
    input: {
      content: "Summarise this",
      label: "English prompt",
      versions: { Hindi: "इसका सार दो" },
    },
    output: {
      content: "A short summary",
      label: "English reply",
      versions: { Hindi: "एक छोटा सार" },
    },
  };

  it("renders object input and output with their labels under the titles and their versions", () => {
    render(<LlmGeneralItemPane payload={versioned} />);
    expect(screen.getByText("English prompt")).toBeInTheDocument();
    expect(screen.getByText("Summarise this")).toBeInTheDocument();
    expect(screen.getByText("इसका सार दो")).toBeInTheDocument();
    expect(screen.getByText("English reply")).toBeInTheDocument();
    expect(screen.getByText("A short summary")).toBeInTheDocument();
    expect(screen.getByText("एक छोटा सार")).toBeInTheDocument();
    expect(screen.getAllByText("Hindi")).toHaveLength(2);
    expect(screen.getByText("Input")).toBeInTheDocument();
    expect(screen.getByText("Output")).toBeInTheDocument();
  });

  it("hides versions when showVersions is false", () => {
    render(<LlmGeneralItemPane payload={versioned} showVersions={false} />);
    expect(screen.getByText("Summarise this")).toBeInTheDocument();
    expect(screen.queryByText("Hindi")).not.toBeInTheDocument();
    expect(screen.queryByText("इसका सार दो")).not.toBeInTheDocument();
  });

  it("falls back to Input and Output titles for object fields without a label", () => {
    render(
      <LlmGeneralItemPane
        payload={{ input: { content: "Q" }, output: { content: "A" } }}
      />,
    );
    expect(screen.getByText("Input")).toBeInTheDocument();
    expect(screen.getByText("Output")).toBeInTheDocument();
    expect(screen.getByText("Q")).toBeInTheDocument();
    expect(screen.getByText("A")).toBeInTheDocument();
  });

  it("treats an object without content as missing", () => {
    render(
      <LlmGeneralItemPane payload={{ input: { label: "x" }, output: {} }} />,
    );
    expect(screen.getByText("Item payload")).toBeInTheDocument();
  });
});

describe("LlmGeneralItemPane name pills", () => {
  it("draws every input name in one colour and every output name in another", () => {
    render(
      <LlmGeneralItemPane
        payload={{
          input: { content: "hi", label: "Caller", versions: { Hindi: "नमस्ते" } },
          output: { content: "ok", label: "AI draft", versions: { Nurse: "fine" } },
        }}
      />,
    );
    for (const name of ["Caller", "Hindi"]) {
      expect(screen.getByText(name).className).toContain("bg-blue-500/10");
    }
    for (const name of ["AI draft", "Nurse"]) {
      expect(screen.getByText(name).className).toContain("bg-purple-500/10");
    }
  });
});
