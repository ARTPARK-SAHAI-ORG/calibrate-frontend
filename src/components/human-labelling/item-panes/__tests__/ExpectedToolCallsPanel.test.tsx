import React from "react";
import { render, screen } from "@/test-utils";
import { ExpectedToolCallsPanel } from "../ExpectedToolCallsPanel";

describe("ExpectedToolCallsPanel", () => {
  it("always shows the heading", () => {
    render(<ExpectedToolCallsPanel payload={{}} />);
    expect(screen.getByText("Expected Tool Calls")).toBeInTheDocument();
  });

  it("renders each expected call", () => {
    render(
      <ExpectedToolCallsPanel
        payload={{
          expected_tool_calls: [
            { function: { name: "book_flight", arguments: "{}" } },
            { function: { name: "confirm_seat", arguments: "{}" } },
          ],
        }}
      />,
    );
    expect(screen.getByText("book_flight")).toBeInTheDocument();
    expect(screen.getByText("confirm_seat")).toBeInTheDocument();
  });

  it("says so when there is no expected spec (e.g. a trace)", () => {
    render(<ExpectedToolCallsPanel payload={{ expected_tool_calls: [] }} />);
    expect(
      screen.getByText("No expected tool calls specified"),
    ).toBeInTheDocument();
  });

  it("says so when expected_tool_calls is missing entirely", () => {
    render(<ExpectedToolCallsPanel payload={{ name: "item" }} />);
    expect(
      screen.getByText("No expected tool calls specified"),
    ).toBeInTheDocument();
  });
});
