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
  const controls: TraceScoringControls = {
    enabled: false,
    saving: false,
    setEnabled: jest.fn(),
    eligibility: eligible,
    eligibilityError: null,
    saveError: null,
    enableBlocked: false,
    cannotEnable: false,
    ...overrides,
  };
  // The hook works this out from the other two; a test that sets either of
  // them, and not this, still gets the real rule.
  if (overrides.cannotEnable === undefined) {
    controls.cannotEnable =
      !controls.enabled &&
      (controls.eligibility === null || controls.enableBlocked);
  }
  return controls;
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
        onGoToEvaluators={jest.fn()}
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
        onGoToEvaluators={jest.fn()}
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
        onGoToEvaluators={jest.fn()}
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
        onGoToEvaluators={jest.fn()}
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
        onGoToEvaluators={jest.fn()}
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
        onGoToEvaluators={jest.fn()}
      />,
    );
    expect(screen.getByText("Max assistant turns")).toBeInTheDocument();
  });

  function renderScoring(overrides: Partial<TraceScoringControls> = {}) {
    const controls = scoring(overrides);
    const onGoToEvaluators = jest.fn();
    render(
      <SettingsTabContent
        agentSpeaksFirst={false}
        setAgentSpeaksFirst={jest.fn()}
        maxAssistantTurns={5}
        setMaxAssistantTurns={jest.fn()}
        traceScoring={controls}
        onGoToEvaluators={onGoToEvaluators}
      />,
    );
    return {
      controls,
      onGoToEvaluators,
      switchEl: screen.getByRole("switch", {
        name: "Enable continuous monitoring",
      }),
    };
  }

  it("asks before turning continuous monitoring on, then turns it on", async () => {
    const user = setupUser();
    const { controls, switchEl } = renderScoring();
    expect(switchEl).toHaveAttribute("aria-checked", "false");
    expect(switchEl).not.toBeDisabled();
    await user.click(switchEl);

    // Nothing changes until the question is answered.
    expect(controls.setEnabled).not.toHaveBeenCalled();
    expect(
      screen.getByRole("heading", { name: "Turn on continuous monitoring" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "All new traces will be scored using your evaluators. Existing traces won't be scored.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Turn on" }));
    expect(controls.setEnabled).toHaveBeenCalledWith(true);
  });

  it("asks before turning continuous monitoring off, with its own words", async () => {
    const user = setupUser();
    const { controls, switchEl } = renderScoring({ enabled: true });
    expect(switchEl).toHaveAttribute("aria-checked", "true");
    await user.click(switchEl);

    expect(
      screen.getByRole("heading", { name: "Turn off continuous monitoring" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "New traces will not be scored. Traces with existing scores won't be affected.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Turn on" }),
    ).not.toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Turn off" }));
    expect(controls.setEnabled).toHaveBeenCalledWith(false);
  });

  it("changes nothing when the question is cancelled", async () => {
    const user = setupUser();
    const { controls, switchEl } = renderScoring();
    await user.click(switchEl);
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(controls.setEnabled).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("heading", { name: "Turn on continuous monitoring" }),
    ).not.toBeInTheDocument();
  });

  it("says what is scored and opens the Evaluators tab from the description", async () => {
    const user = setupUser();
    const { onGoToEvaluators } = renderScoring();
    expect(
      screen.getByRole("heading", { name: "Monitoring" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Enable continuous monitoring" }),
    ).toBeInTheDocument();

    const validEvaluators = screen.getByText("valid evaluators");
    await user.hover(validEvaluators);
    expect(
      await screen.findByText("Evaluators without any variables"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Evaluators tab" }));
    expect(onGoToEvaluators).toHaveBeenCalledTimes(1);
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
      eligibility: {
        eligible: [],
        ineligible: [
          {
            evaluator_uuid: "ev-2",
            name: "Correctness",
            reason: "declares_variables" as const,
          },
        ],
      },
      enableBlocked: true,
      cannotEnable: true,
    });
    expect(switchEl).toBeDisabled();
    // Not clickable, but still drawn as a switch: dimming it makes it hard to
    // see what it is.
    expect(switchEl.className).not.toContain("opacity-50");
    expect(switchEl.className).not.toContain("disabled:opacity");
    // The reason rides on the control, so the card stays the height of its
    // neighbours instead of carrying an extra line.
    await user.hover(switchEl);
    const inTooltip = (
      await screen.findAllByRole("button", { name: "Evaluators tab" })
    ).find((el) =>
      el.parentElement?.textContent?.includes(
        "Every evaluator added to this agent uses variables",
      ),
    );
    expect(inTooltip).toBeDefined();
  });

  it("shows the save error", () => {
    renderScoring({ saveError: "Could not update automatic scoring." });
    expect(screen.getByText("Could not update automatic scoring.")).toHaveClass(
      "text-red-600",
    );
  });

  it("keeps the scoring switch under a Monitoring heading", () => {
    const { switchEl } = renderScoring({});
    const heading = screen.getByRole("heading", { name: "Monitoring" });
    expect(
      heading.compareDocumentPosition(switchEl) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });
});
