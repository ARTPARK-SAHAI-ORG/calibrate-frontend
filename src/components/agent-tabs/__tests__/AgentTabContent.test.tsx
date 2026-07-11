import React from "react";
import { render, screen, setupUser } from "@/test-utils";

jest.mock("../../../hooks/useOpenRouterModels", () => ({
  __esModule: true,
  useOpenRouterModels: () => ({
    providers: [
      {
        slug: "openai",
        name: "OpenAI",
        models: [{ id: "openai/gpt-4o", name: "GPT-4o" }],
      },
    ],
    isLoading: false,
    error: null,
    retry: jest.fn(),
  }),
}));

import { AgentTabContent } from "../AgentTabContent";

function renderComponent(overrides: Partial<React.ComponentProps<typeof AgentTabContent>> = {}) {
  const props: React.ComponentProps<typeof AgentTabContent> = {
    systemPrompt: "You are a helpful agent.",
    setSystemPrompt: jest.fn(),
    sttProvider: "deepgram",
    setSttProvider: jest.fn(),
    ttsProvider: "cartesia",
    setTtsProvider: jest.fn(),
    selectedLLM: null,
    setSelectedLLM: jest.fn(),
    ...overrides,
  };
  return { ...render(<AgentTabContent {...props} />), props };
}

describe("AgentTabContent", () => {
  it("renders the system prompt textarea with its value", () => {
    renderComponent();
    expect(
      screen.getByDisplayValue("You are a helpful agent.")
    ).toBeInTheDocument();
  });

  it("calls setSystemPrompt when the textarea changes", async () => {
    const user = setupUser();
    const setSystemPrompt = jest.fn();
    renderComponent({ setSystemPrompt });

    const textarea = screen.getByDisplayValue("You are a helpful agent.");
    await user.type(textarea, "!");
    expect(setSystemPrompt).toHaveBeenCalled();
  });

  it("calls setSttProvider when the STT select changes", async () => {
    const user = setupUser();
    const setSttProvider = jest.fn();
    renderComponent({ setSttProvider });

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[0], "openai");
    expect(setSttProvider).toHaveBeenCalledWith("openai");
  });

  it("calls setTtsProvider when the TTS select changes", async () => {
    const user = setupUser();
    const setTtsProvider = jest.fn();
    renderComponent({ setTtsProvider });

    const selects = screen.getAllByRole("combobox");
    await user.selectOptions(selects[1], "openai");
    expect(setTtsProvider).toHaveBeenCalledWith("openai");
  });

  it("shows placeholder text when no LLM is selected", () => {
    renderComponent({ selectedLLM: null });
    expect(screen.getByText("Select LLM model")).toBeInTheDocument();
  });

  it("shows the selected LLM's name when one is selected", () => {
    renderComponent({ selectedLLM: { id: "openai/gpt-4o", name: "GPT-4o" } });
    expect(screen.getByText("GPT-4o")).toBeInTheDocument();
  });

  it("opens the LLM selector modal and selects a model", async () => {
    const user = setupUser();
    const setSelectedLLM = jest.fn();
    renderComponent({ setSelectedLLM });

    await user.click(screen.getByText("Select LLM model"));
    expect(screen.getByText("Select LLM")).toBeInTheDocument();

    await user.click(screen.getByText("GPT-4o"));
    expect(setSelectedLLM).toHaveBeenCalledWith(
      expect.objectContaining({ id: "openai/gpt-4o" })
    );
  });

  it("closes the LLM selector modal", async () => {
    const user = setupUser();
    renderComponent();

    await user.click(screen.getByText("Select LLM model"));
    expect(screen.getByText("Select LLM")).toBeInTheDocument();

    // Close (X) button is the second button in the modal header.
    const closeButtons = screen.getAllByRole("button");
    const xButton = closeButtons.find((btn) =>
      btn.className.includes("w-8 h-8")
    );
    await user.click(closeButtons[closeButtons.length - 1]);

    expect(screen.queryByText("Select LLM")).not.toBeInTheDocument();
  });

  it("shows a tooltip explaining the system prompt on hover", () => {
    renderComponent();
    expect(
      screen.getByText(/used to determine the persona of the agent/i)
    ).toBeInTheDocument();
  });
});
