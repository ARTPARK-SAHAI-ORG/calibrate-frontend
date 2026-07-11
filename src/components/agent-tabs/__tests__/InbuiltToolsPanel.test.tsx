import React from "react";
import { render, screen } from "@/test-utils";
import { InbuiltToolsPanel } from "../InbuiltToolsPanel";

describe("InbuiltToolsPanel", () => {
  it("shows 0 active tools when end conversation is disabled", () => {
    render(
      <InbuiltToolsPanel
        endConversationEnabled={false}
        setEndConversationEnabled={jest.fn()}
      />
    );

    expect(screen.getByText("0 active tools")).toBeInTheDocument();
    expect(screen.getByText("End conversation")).toBeInTheDocument();
  });

  it("shows 1 active tool when end conversation is enabled", () => {
    render(
      <InbuiltToolsPanel
        endConversationEnabled={true}
        setEndConversationEnabled={jest.fn()}
      />
    );

    expect(screen.getByText("1 active tool")).toBeInTheDocument();
  });

  it("toggles end conversation via the (hidden) toggle button", () => {
    const setEndConversationEnabled = jest.fn();
    const { container } = render(
      <InbuiltToolsPanel
        endConversationEnabled={false}
        setEndConversationEnabled={setEndConversationEnabled}
      />
    );

    const toggleButton = container.querySelector("button") as HTMLButtonElement;
    // The toggle is rendered with the `hidden` attribute in the source, so it
    // is not clickable via user-event; invoke the click handler directly to
    // exercise the underlying logic instead.
    toggleButton.click();
    expect(setEndConversationEnabled).toHaveBeenCalledWith(true);
  });

  it("toggles end conversation off when currently on", () => {
    const setEndConversationEnabled = jest.fn();
    const { container } = render(
      <InbuiltToolsPanel
        endConversationEnabled={true}
        setEndConversationEnabled={setEndConversationEnabled}
      />
    );

    const toggleButton = container.querySelector("button") as HTMLButtonElement;
    toggleButton.click();
    expect(setEndConversationEnabled).toHaveBeenCalledWith(false);
  });
});
