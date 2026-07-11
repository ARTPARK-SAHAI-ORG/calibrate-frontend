import React from "react";
import { render, screen, setupUser, fireEvent } from "@/test-utils";
import { SettingsTabContent } from "../SettingsTabContent";

describe("SettingsTabContent", () => {
  it("toggles agent speaks first", async () => {
    const user = setupUser();
    const setAgentSpeaksFirst = jest.fn();
    const { container } = render(
      <SettingsTabContent
        agentSpeaksFirst={false}
        setAgentSpeaksFirst={setAgentSpeaksFirst}
        maxAssistantTurns={5}
        setMaxAssistantTurns={jest.fn()}
      />
    );

    const toggleButton = container.querySelector("button") as HTMLButtonElement;
    await user.click(toggleButton);
    expect(setAgentSpeaksFirst).toHaveBeenCalledWith(true);
  });

  it("toggles agent speaks first off when currently on", async () => {
    const user = setupUser();
    const setAgentSpeaksFirst = jest.fn();
    const { container } = render(
      <SettingsTabContent
        agentSpeaksFirst={true}
        setAgentSpeaksFirst={setAgentSpeaksFirst}
        maxAssistantTurns={5}
        setMaxAssistantTurns={jest.fn()}
      />
    );

    const toggleButton = container.querySelector("button") as HTMLButtonElement;
    await user.click(toggleButton);
    expect(setAgentSpeaksFirst).toHaveBeenCalledWith(false);
  });

  it("updates max assistant turns for a valid number", () => {
    const setMaxAssistantTurns = jest.fn();
    render(
      <SettingsTabContent
        agentSpeaksFirst={false}
        setAgentSpeaksFirst={jest.fn()}
        maxAssistantTurns={5}
        setMaxAssistantTurns={setMaxAssistantTurns}
      />
    );

    const input = screen.getByDisplayValue("5");
    fireEvent.change(input, { target: { value: "9" } });
    expect(setMaxAssistantTurns).toHaveBeenCalledWith(9);
  });

  it("does not call setMaxAssistantTurns for invalid/empty input", () => {
    const setMaxAssistantTurns = jest.fn();
    render(
      <SettingsTabContent
        agentSpeaksFirst={false}
        setAgentSpeaksFirst={jest.fn()}
        maxAssistantTurns={5}
        setMaxAssistantTurns={setMaxAssistantTurns}
      />
    );

    const input = screen.getByDisplayValue("5");
    fireEvent.change(input, { target: { value: "" } });
    // Empty string -> NaN, should not call the setter.
    expect(setMaxAssistantTurns).not.toHaveBeenCalled();
  });

  it("does not call setMaxAssistantTurns for a value below 1", () => {
    const setMaxAssistantTurns = jest.fn();
    render(
      <SettingsTabContent
        agentSpeaksFirst={false}
        setAgentSpeaksFirst={jest.fn()}
        maxAssistantTurns={5}
        setMaxAssistantTurns={setMaxAssistantTurns}
      />
    );

    const input = screen.getByDisplayValue("5");
    fireEvent.change(input, { target: { value: "0" } });
    expect(setMaxAssistantTurns).not.toHaveBeenCalled();
  });

  it("renders max assistant turns copy", () => {
    render(
      <SettingsTabContent
        agentSpeaksFirst={false}
        setAgentSpeaksFirst={jest.fn()}
        maxAssistantTurns={5}
        setMaxAssistantTurns={jest.fn()}
      />
    );
    expect(screen.getByText("Max assistant turns")).toBeInTheDocument();
  });
});
