/**
 * The provider keys table. The hook is replaced, so nothing reaches the
 * backend.
 */
import { render, screen, setupUser, waitFor, within } from "@/test-utils";
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

beforeEach(() => {
  jest.clearAllMocks();
  hookState = { keys: [], usesOwnKeys: false, isLoading: false, error: null };
  saveProviderKey.mockResolvedValue(openrouter);
  removeProviderKey.mockResolvedValue(undefined);
});

// The desktop table and the phone cards are both in the page; the table is
// the first match.
const desktopRow = (name: string) =>
  screen.getAllByText(name)[0].parentElement as HTMLElement;

describe("ProviderKeysSection", () => {
  it("lists every provider, saying which have no key", () => {
    render(<ProviderKeysSection orgUuid="org-1" />);
    for (const name of [
      "OpenRouter",
      "OpenAI",
      "Deepgram",
      "ElevenLabs",
      "Sarvam",
      "Cartesia",
      "Smallest",
      "Groq",
      "Gemini",
      "Google Cloud",
    ]) {
      expect(within(desktopRow(name)).getByText("Not added")).toBeInTheDocument();
    }
  });

  it("explains what adding a key does", () => {
    render(<ProviderKeysSection orgUuid="org-1" />);
    expect(
      screen.getByText(/Once you add any key, every run in this workspace uses only your keys/),
    ).toBeInTheDocument();
  });

  it("shows a saved key masked, with replace and remove", () => {
    hookState = { ...hookState, keys: [openrouter], usesOwnKeys: true };
    render(<ProviderKeysSection orgUuid="org-1" />);
    const row = desktopRow("OpenRouter");
    expect(within(row).getByText("sk-or-****1234")).toBeInTheDocument();
    expect(within(row).getByText("Replace key")).toBeInTheDocument();
    expect(within(row).getByText("Remove key")).toBeInTheDocument();
  });

  it("asks before the first key and saves it for that provider", async () => {
    const user = setupUser();
    render(<ProviderKeysSection orgUuid="org-1" />);

    await user.click(
      screen.getAllByRole("button", { name: "Add the OpenRouter key" })[0],
    );
    await user.type(screen.getByLabelText("Key"), "sk-or-secret");
    await user.click(screen.getByRole("button", { name: "Save the key" }));
    expect(
      screen.getByText(/After this, runs use only your keys/),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Save the key" }));

    expect(saveProviderKey).toHaveBeenCalledWith("openrouter", "sk-or-secret");
  });

  it("removes a key after confirming", async () => {
    hookState = { ...hookState, keys: [openrouter], usesOwnKeys: true };
    const user = setupUser();
    render(<ProviderKeysSection orgUuid="org-1" />);

    await user.click(
      screen.getAllByRole("button", { name: "Remove the OpenRouter key" })[0],
    );
    expect(screen.getByText(/It is the last key/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Remove" }));

    expect(removeProviderKey).toHaveBeenCalledWith("openrouter");
  });

  it("shows why a key could not be removed", async () => {
    hookState = { ...hookState, keys: [openrouter], usesOwnKeys: true };
    removeProviderKey.mockRejectedValue(
      new Error('Request failed: 409 - {"detail":"Runs are still going."}'),
    );
    const user = setupUser();
    render(<ProviderKeysSection orgUuid="org-1" />);

    await user.click(
      screen.getAllByRole("button", { name: "Remove the OpenRouter key" })[0],
    );
    await user.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(toast.error).toHaveBeenCalledWith("Runs are still going."),
    );
    expect(refetch).toHaveBeenCalled();
  });

  it("says which runs fail when a key that is not the last is removed", async () => {
    const openai = { ...openrouter, provider: "openai", masked_value: "sk-****" };
    hookState = { ...hookState, keys: [openrouter, openai], usesOwnKeys: true };
    const user = setupUser();
    render(<ProviderKeysSection orgUuid="org-1" />);

    await user.click(
      screen.getAllByRole("button", { name: "Remove the OpenAI key" })[0],
    );
    expect(
      screen.getByText(
        "Remove the OpenAI key? Runs that need OpenAI will fail until you add a key again.",
      ),
    ).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByText(/Remove the OpenAI key\?/)).not.toBeInTheDocument();
    expect(removeProviderKey).not.toHaveBeenCalled();
  });

  it("shows the loading state before the keys arrive", () => {
    hookState = { ...hookState, isLoading: true };
    render(<ProviderKeysSection orgUuid="org-1" />);
    expect(screen.queryByText("Not added")).not.toBeInTheDocument();
  });

  it("shows a load failure", () => {
    hookState = { ...hookState, error: "Failed to load provider keys" };
    render(<ProviderKeysSection orgUuid="org-1" />);
    expect(screen.getByText("Failed to load provider keys")).toBeInTheDocument();
  });
});
