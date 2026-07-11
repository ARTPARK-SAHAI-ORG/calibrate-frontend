import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import type { LLMProvider } from "../constants/providers";

const mockUseOpenRouterModels = jest.fn();
jest.mock("../../../hooks/useOpenRouterModels", () => ({
  __esModule: true,
  useOpenRouterModels: () => mockUseOpenRouterModels(),
}));

import { LLMSelectorModal } from "../LLMSelectorModal";

const providers: LLMProvider[] = [
  {
    slug: "openai",
    name: "OpenAI",
    models: [
      { id: "openai/gpt-4o", name: "GPT-4o", inputModalities: ["text"] },
      {
        id: "openai/gpt-4o-audio",
        name: "GPT-4o Audio",
        inputModalities: ["text", "audio"],
      },
    ],
  },
  {
    slug: "anthropic",
    name: "Anthropic",
    models: [
      { id: "anthropic/claude", name: "Claude", inputModalities: ["text"] },
    ],
  },
];

describe("LLMSelectorModal", () => {
  beforeEach(() => {
    mockUseOpenRouterModels.mockReturnValue({
      providers,
      isLoading: false,
      error: null,
      retry: jest.fn(),
    });
  });

  it("renders nothing when closed", () => {
    const { container } = render(
      <LLMSelectorModal
        isOpen={false}
        onClose={jest.fn()}
        selectedLLM={null}
        onSelect={jest.fn()}
      />
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("renders providers and models from the hook by default", () => {
    render(
      <LLMSelectorModal
        isOpen={true}
        onClose={jest.fn()}
        selectedLLM={null}
        onSelect={jest.fn()}
      />
    );

    expect(screen.getByText("OpenAI")).toBeInTheDocument();
    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.getByText("GPT-4o")).toBeInTheDocument();
    expect(screen.getByText("Claude")).toBeInTheDocument();
  });

  it("uses availableProviders prop instead of the hook when provided", () => {
    render(
      <LLMSelectorModal
        isOpen={true}
        onClose={jest.fn()}
        selectedLLM={null}
        onSelect={jest.fn()}
        availableProviders={[
          {
            slug: "google",
            name: "Google",
            models: [{ id: "google/gemini", name: "Gemini" }],
          },
        ]}
      />
    );

    expect(screen.getByText("Google")).toBeInTheDocument();
    expect(screen.getByText("Gemini")).toBeInTheDocument();
    expect(screen.queryByText("OpenAI")).not.toBeInTheDocument();
  });

  it("filters providers by allowedProviderSlugs", () => {
    render(
      <LLMSelectorModal
        isOpen={true}
        onClose={jest.fn()}
        selectedLLM={null}
        onSelect={jest.fn()}
        allowedProviderSlugs={["anthropic"]}
      />
    );

    expect(screen.getByText("Anthropic")).toBeInTheDocument();
    expect(screen.queryByText("OpenAI")).not.toBeInTheDocument();
  });

  it("filters models by requiredInputModality", () => {
    render(
      <LLMSelectorModal
        isOpen={true}
        onClose={jest.fn()}
        selectedLLM={null}
        onSelect={jest.fn()}
        requiredInputModality="audio"
      />
    );

    expect(screen.getByText("GPT-4o Audio")).toBeInTheDocument();
    expect(screen.queryByText("GPT-4o")).not.toBeInTheDocument();
    // Anthropic's only model doesn't support audio, so the whole provider
    // group is filtered out.
    expect(screen.queryByText("Anthropic")).not.toBeInTheDocument();
  });

  it("filters by search query across model and provider name", async () => {
    const user = setupUser();
    render(
      <LLMSelectorModal
        isOpen={true}
        onClose={jest.fn()}
        selectedLLM={null}
        onSelect={jest.fn()}
      />
    );

    await user.type(screen.getByPlaceholderText("Search LLM"), "claude");
    expect(screen.getByText("Claude")).toBeInTheDocument();
    expect(screen.queryByText("GPT-4o")).not.toBeInTheDocument();
  });

  it("shows 'No models found' when search matches nothing", async () => {
    const user = setupUser();
    render(
      <LLMSelectorModal
        isOpen={true}
        onClose={jest.fn()}
        selectedLLM={null}
        onSelect={jest.fn()}
      />
    );

    await user.type(screen.getByPlaceholderText("Search LLM"), "zzzznotamodel");
    expect(screen.getByText("No models found")).toBeInTheDocument();
  });

  it("selects a model, calls onSelect and onClose, and resets search", async () => {
    const user = setupUser();
    const onSelect = jest.fn();
    const onClose = jest.fn();
    render(
      <LLMSelectorModal
        isOpen={true}
        onClose={onClose}
        selectedLLM={null}
        onSelect={onSelect}
      />
    );

    await user.click(screen.getByText("Claude"));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "anthropic/claude" })
    );
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("highlights the selected model", () => {
    render(
      <LLMSelectorModal
        isOpen={true}
        onClose={jest.fn()}
        selectedLLM={{ id: "anthropic/claude", name: "Claude" }}
        onSelect={jest.fn()}
      />
    );

    expect(screen.getByText("Claude").closest("button")).toHaveClass(
      "bg-muted/50"
    );
  });

  it("closes via the back button and via the close (X) button, resetting search", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    render(
      <LLMSelectorModal
        isOpen={true}
        onClose={onClose}
        selectedLLM={null}
        onSelect={jest.fn()}
      />
    );

    const buttons = screen.getAllByRole("button");
    await user.click(buttons[0]); // back button
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows a loading state when isLoading and no providers yet", () => {
    mockUseOpenRouterModels.mockReturnValue({
      providers: [],
      isLoading: true,
      error: null,
      retry: jest.fn(),
    });

    render(
      <LLMSelectorModal
        isOpen={true}
        onClose={jest.fn()}
        selectedLLM={null}
        onSelect={jest.fn()}
      />
    );

    expect(screen.getByText("Loading models")).toBeInTheDocument();
  });

  it("shows an error state with retry when error and no providers", async () => {
    const retry = jest.fn();
    mockUseOpenRouterModels.mockReturnValue({
      providers: [],
      isLoading: false,
      error: "Failed to load models. Please check your connection.",
      retry,
    });

    const user = setupUser();
    render(
      <LLMSelectorModal
        isOpen={true}
        onClose={jest.fn()}
        selectedLLM={null}
        onSelect={jest.fn()}
      />
    );

    expect(
      screen.getByText("Failed to load models. Please check your connection.")
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Retry" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("still renders providers when error is set but providers are non-empty", () => {
    mockUseOpenRouterModels.mockReturnValue({
      providers,
      isLoading: false,
      error: "some transient error",
      retry: jest.fn(),
    });

    render(
      <LLMSelectorModal
        isOpen={true}
        onClose={jest.fn()}
        selectedLLM={null}
        onSelect={jest.fn()}
      />
    );

    expect(screen.getByText("OpenAI")).toBeInTheDocument();
  });
});
