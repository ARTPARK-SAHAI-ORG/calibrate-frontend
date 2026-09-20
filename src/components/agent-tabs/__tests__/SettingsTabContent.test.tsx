import React from "react";
import { render, screen, setupUser, fireEvent } from "@/test-utils";
import { SettingsTabContent } from "../SettingsTabContent";
import type { TraceScoringControls } from "@/hooks/useAgentTraceScoring";

const eligible = {
  eligible: [
    { evaluator_uuid: "ev-1", evaluator_version_id: "v1", name: "Tone" },
  ],
  ineligible: [],
};

function scoring(
  overrides: Partial<TraceScoringControls> = {},
): TraceScoringControls {
  return {
    enabled: false,
    saving: false,
    setEnabled: jest.fn(),
    eligibility: eligible,
    eligibilityError: null,
    saveError: null,
    enableBlocked: false,
    ...overrides,
  };
}

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
        traceScoring={scoring()}
      />,
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
        traceScoring={scoring()}
      />,
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
        traceScoring={scoring()}
      />,
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
        traceScoring={scoring()}
      />,
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
        traceScoring={scoring()}
      />,
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
        traceScoring={scoring()}
      />,
    );
    expect(screen.getByText("Max assistant turns")).toBeInTheDocument();
  });

  function renderScoring(overrides: Partial<TraceScoringControls> = {}) {
    const controls = scoring(overrides);
    render(
      <SettingsTabContent
        agentSpeaksFirst={false}
        setAgentSpeaksFirst={jest.fn()}
        maxAssistantTurns={5}
        setMaxAssistantTurns={jest.fn()}
        traceScoring={controls}
      />,
    );
    return {
      controls,
      switchEl: screen.getByRole("switch", {
        name: "Score new traces automatically",
      }),
    };
  }

  it("shows automatic trace scoring off and turns it on", async () => {
    const user = setupUser();
    const { controls, switchEl } = renderScoring();
    expect(switchEl).toHaveAttribute("aria-checked", "false");
    expect(switchEl).not.toBeDisabled();
    expect(
      screen.getByText(
        "New traces this agent receives are scored with its evaluators.",
      ),
    ).toBeInTheDocument();
    await user.click(switchEl);
    expect(controls.setEnabled).toHaveBeenCalledWith(true);
  });

  it("shows automatic trace scoring on and turns it off", async () => {
    const user = setupUser();
    const { controls, switchEl } = renderScoring({ enabled: true });
    expect(switchEl).toHaveAttribute("aria-checked", "true");
    await user.click(switchEl);
    expect(controls.setEnabled).toHaveBeenCalledWith(false);
  });

  it("cannot be turned on before eligibility is known", () => {
    expect(renderScoring({ eligibility: null }).switchEl).toBeDisabled();
  });

  it("can still be turned off while eligibility is unknown", () => {
    expect(
      renderScoring({ enabled: true, eligibility: null }).switchEl,
    ).not.toBeDisabled();
  });

  it("is disabled while saving", () => {
    expect(
      renderScoring({ enabled: true, saving: true }).switchEl,
    ).toBeDisabled();
  });

  it("is disabled and says why on hover when no evaluator can score", async () => {
    const user = setupUser();
    const { switchEl } = renderScoring({
      eligibility: { eligible: [], ineligible: [] },
      enableBlocked: true,
    });
    expect(switchEl).toBeDisabled();
    // The reason rides on the control, so the card stays the height of its
    // neighbours instead of carrying an extra line.
    await user.hover(switchEl);
    expect(
      await screen.findByText(
        "None of this agent's evaluators can score traces. Choose evaluators on the Evaluators tab.",
      ),
    ).toBeInTheDocument();
  });

  it("shows the save error", () => {
    renderScoring({ saveError: "Could not update automatic scoring." });
    expect(screen.getByText("Could not update automatic scoring.")).toHaveClass(
      "text-red-600",
    );
  });

  it("keeps the scoring switch under a Traces heading", () => {
    renderScoring({});
    const heading = screen.getByRole("heading", { name: "Traces" });
    expect(heading).toBeInTheDocument();
    expect(
      heading.compareDocumentPosition(
        screen.getByRole("switch", { name: "Score new traces automatically" }),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
