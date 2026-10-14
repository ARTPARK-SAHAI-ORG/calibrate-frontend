/**
 * The provider keys page. The hook is replaced, so nothing reaches the
 * backend.
 */
import { render, screen, setupUser, waitFor } from "@/test-utils";
import { toast } from "sonner";
import { ProviderKeysSection } from "../ProviderKeysSection";

jest.mock("sonner", () => ({ toast: { error: jest.fn() } }));
jest.mock("../../../lib/reportError", () => ({ reportError: jest.fn() }));

const saveProviderKey = jest.fn();
const removeProviderKey = jest.fn();
const refetch = jest.fn();
let hookState: {
  keys: { provider: string; masked_value: string; updated_at: string }[];
  usesOwnKeys: boolean;
  isLoading: boolean;
  error: string | null;
};

jest.mock("../../../hooks", () => ({
  useAccessToken: () => "tok",
  useProviderKeys: () => ({
    ...hookState,
    refetch,
    saveProviderKey,
    removeProviderKey,
  }),
}));

const openrouter = {
  provider: "openrouter",
  masked_value: "sk-or-****1234",
  updated_at: "2024-01-01T00:00:00Z",
};
const openai = { ...openrouter, provider: "openai", masked_value: "sk-****9" };

beforeEach(() => {
  jest.clearAllMocks();
  hookState = { keys: [], usesOwnKeys: false, isLoading: false, error: null };
  saveProviderKey.mockResolvedValue(openrouter);
  removeProviderKey.mockResolvedValue(undefined);
});

const WEBSITES: [string, string][] = [
  ["OpenRouter", "https://openrouter.ai"],
  ["OpenAI", "https://openai.com"],
  ["Deepgram", "https://deepgram.com"],
  ["ElevenLabs", "https://elevenlabs.io"],
  ["Sarvam", "https://sarvam.ai"],
  ["Cartesia", "https://cartesia.ai"],
  ["Gemini", "https://ai.google.dev"],
  ["Google Cloud", "https://cloud.google.com/speech-to-text"],
  ["Smallest AI", "https://smallest.ai"],
];

const saveButton = (name: string) =>
  screen.getByRole("button", { name: `Save the ${name} key` });

describe("ProviderKeysSection", () => {
  it("shows both sections, every provider, and a link to each website", () => {
    render(<ProviderKeysSection orgUuid="org-1" />);
    expect(
      screen.getByRole("heading", { name: "Language models" }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Voice evaluation" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Speech-to-text, text-to-speech and voice simulations"),
    ).toBeInTheDocument();
    for (const [name, href] of WEBSITES) {
      expect(screen.getByText(name, { selector: "label" })).toBeInTheDocument();
      expect(
        screen.getByRole("link", { name: `Visit ${name} website` }),
      ).toHaveAttribute("href", href);
    }
  });

  it("asks for JSON for Google Cloud and an API key for the others", () => {
    render(<ProviderKeysSection orgUuid="org-1" />);
    const json = screen.getByPlaceholderText("Paste your service account JSON");
    expect(json.tagName).toBe("TEXTAREA");
    const key = screen.getByPlaceholderText("Paste your OpenAI API key");
    expect(key).toHaveAttribute("type", "password");
  });

  it("enables Save only once something is typed", async () => {
    const user = setupUser();
    render(<ProviderKeysSection orgUuid="org-1" />);
    expect(saveButton("OpenRouter")).toBeDisabled();
    await user.type(
      screen.getByPlaceholderText("Paste your OpenRouter API key"),
      "x",
    );
    expect(saveButton("OpenRouter")).toBeEnabled();
  });

  it("asks before the first key, then saves the trimmed value", async () => {
    const user = setupUser();
    render(<ProviderKeysSection orgUuid="org-1" />);
    await user.type(
      screen.getByPlaceholderText("Paste your OpenRouter API key"),
      "  sk-or-secret  ",
    );
    await user.click(saveButton("OpenRouter"));

    expect(
      screen.getByRole("heading", { name: "Save the OpenRouter key" }),
    ).toBeInTheDocument();
    expect(saveProviderKey).not.toHaveBeenCalled();
    await user.click(screen.getByRole("button", { name: "Save the key" }));

    expect(saveProviderKey).toHaveBeenCalledWith("openrouter", "sk-or-secret");
  });

  it("saves nothing when the first-key question is cancelled", async () => {
    const user = setupUser();
    render(<ProviderKeysSection orgUuid="org-1" />);
    await user.type(
      screen.getByPlaceholderText("Paste your OpenRouter API key"),
      "sk-or",
    );
    await user.click(saveButton("OpenRouter"));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(
      screen.queryByRole("heading", { name: "Save the OpenRouter key" }),
    ).not.toBeInTheDocument();
    expect(saveProviderKey).not.toHaveBeenCalled();
  });

  it("saves straight away once the workspace uses its own keys", async () => {
    hookState = { ...hookState, keys: [openrouter], usesOwnKeys: true };
    const user = setupUser();
    render(<ProviderKeysSection orgUuid="org-1" />);
    await user.type(
      screen.getByPlaceholderText("Paste your OpenAI API key"),
      "sk-openai",
    );
    await user.click(saveButton("OpenAI"));

    expect(
      screen.queryByRole("heading", { name: "Save the OpenAI key" }),
    ).not.toBeInTheDocument();
    expect(saveProviderKey).toHaveBeenCalledWith("openai", "sk-openai");
  });

  it("saves on Enter in a key field but not in the JSON field", async () => {
    hookState = { ...hookState, keys: [openrouter], usesOwnKeys: true };
    const user = setupUser();
    render(<ProviderKeysSection orgUuid="org-1" />);

    await user.type(
      screen.getByPlaceholderText("Paste your service account JSON"),
      "{{}{enter}",
    );
    expect(saveProviderKey).not.toHaveBeenCalled();

    await user.type(
      screen.getByPlaceholderText("Paste your Deepgram API key"),
      "dg-key{enter}",
    );
    expect(saveProviderKey).toHaveBeenCalledWith("deepgram", "dg-key");
  });

  it("shows Verifying while saving and clears the field after", async () => {
    hookState = { ...hookState, keys: [openrouter], usesOwnKeys: true };
    let resolve: (v: unknown) => void = () => {};
    saveProviderKey.mockReturnValue(new Promise((r) => (resolve = r)));
    const user = setupUser();
    render(<ProviderKeysSection orgUuid="org-1" />);
    const input = screen.getByPlaceholderText("Paste your OpenAI API key");
    await user.type(input, "sk-openai");
    await user.click(saveButton("OpenAI"));

    const verifying = screen.getByRole("button", { name: "Verifying" });
    expect(verifying).toHaveTextContent("Verifying");
    expect(verifying).toBeDisabled();

    resolve(openai);
    await waitFor(() => expect(input).toHaveValue(""));
    expect(saveButton("OpenAI")).toHaveTextContent("Save");
  });

  it.each([
    [
      "the backend's reason on a 400",
      new Error('Request failed: 400 - {"detail":"The key was rejected."}'),
      "The key was rejected.",
    ],
    [
      "the 503 sentence as is",
      new Error(
        'Request failed: 503 - {"detail":"This server cannot store keys."}',
      ),
      "This server cannot store keys.",
    ],
    ["a fallback line for an unknown failure", "boom", "Failed to save the key"],
  ])("shows %s under the field when saving fails", async (_, err, text) => {
    hookState = { ...hookState, keys: [openrouter], usesOwnKeys: true };
    saveProviderKey.mockRejectedValue(err);
    const user = setupUser();
    render(<ProviderKeysSection orgUuid="org-1" />);
    const input = screen.getByPlaceholderText("Paste your OpenAI API key");
    await user.type(input, "bad");
    await user.click(saveButton("OpenAI"));

    expect(await screen.findByText(text)).toBeInTheDocument();
    expect(input).toHaveValue("bad");

    await user.type(input, "x");
    expect(screen.queryByText(text)).not.toBeInTheDocument();
  });

  it("falls back to the generic server line for a 503 that is not JSON", async () => {
    hookState = { ...hookState, keys: [openrouter], usesOwnKeys: true };
    saveProviderKey.mockRejectedValue(new Error("Request failed: 503 - oops"));
    const user = setupUser();
    render(<ProviderKeysSection orgUuid="org-1" />);
    await user.type(
      screen.getByPlaceholderText("Paste your OpenAI API key"),
      "k",
    );
    await user.click(saveButton("OpenAI"));
    expect(
      await screen.findByText(/Something went wrong on our end/),
    ).toBeInTheDocument();
  });

  it("shows a saved key masked, with a button to remove it", () => {
    hookState = { ...hookState, keys: [openrouter], usesOwnKeys: true };
    render(<ProviderKeysSection orgUuid="org-1" />);
    expect(screen.getByText("sk-or-****1234")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Remove the OpenRouter key" }),
    ).toBeInTheDocument();
    expect(
      screen.queryByPlaceholderText("Paste your OpenRouter API key"),
    ).not.toBeInTheDocument();
  });

  it("warns that removing the last key falls back to the default keys", async () => {
    hookState = { ...hookState, keys: [openrouter], usesOwnKeys: true };
    const user = setupUser();
    render(<ProviderKeysSection orgUuid="org-1" />);
    await user.click(
      screen.getByRole("button", { name: "Remove the OpenRouter key" }),
    );

    expect(
      screen.getByRole("heading", { name: "Remove the OpenRouter key" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "This will make the evaluation runs rely on Calibrate's default API keys and rate limits",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(removeProviderKey).toHaveBeenCalledWith("openrouter");
    await waitFor(() =>
      expect(
        screen.queryByRole("heading", { name: "Remove the OpenRouter key" }),
      ).not.toBeInTheDocument(),
    );
  });

  it("says which runs fail when a key that is not the last is removed", async () => {
    hookState = { ...hookState, keys: [openrouter, openai], usesOwnKeys: true };
    const user = setupUser();
    render(<ProviderKeysSection orgUuid="org-1" />);
    await user.click(
      screen.getByRole("button", { name: "Remove the OpenAI key" }),
    );
    expect(
      screen.getByText("Runs that need OpenAI will fail until you add a key for OpenAI again"),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(
      screen.queryByRole("heading", { name: "Remove the OpenAI key" }),
    ).not.toBeInTheDocument();
    expect(removeProviderKey).not.toHaveBeenCalled();
  });

  it("shows why a key could not be removed and reloads the keys", async () => {
    hookState = { ...hookState, keys: [openrouter], usesOwnKeys: true };
    removeProviderKey.mockRejectedValue(
      new Error('Request failed: 409 - {"detail":"Runs are still going."}'),
    );
    const user = setupUser();
    render(<ProviderKeysSection orgUuid="org-1" />);
    await user.click(
      screen.getByRole("button", { name: "Remove the OpenRouter key" }),
    );
    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Runs are still going."),
    );
    expect(refetch).toHaveBeenCalled();
  });

  it("shows the loading state before the keys arrive", () => {
    hookState = { ...hookState, isLoading: true };
    const { container } = render(<ProviderKeysSection orgUuid="org-1" />);
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Language models" }),
    ).not.toBeInTheDocument();
  });

  it("shows a load failure", () => {
    hookState = { ...hookState, error: "Failed to load provider keys" };
    render(<ProviderKeysSection orgUuid="org-1" />);
    expect(screen.getByText("Failed to load provider keys")).toBeInTheDocument();
    expect(
      screen.queryByRole("heading", { name: "Language models" }),
    ).not.toBeInTheDocument();
  });
});
