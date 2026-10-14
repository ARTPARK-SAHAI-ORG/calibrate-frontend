/**
 * Interaction tests for adding a provider key. `onSave` is a jest.fn(), so
 * nothing reaches the backend.
 */
import { act, render, screen, setupUser, waitFor } from "@/test-utils";
import {
  ProviderKeyDialog,
  providerKeyErrorMessage,
} from "../ProviderKeyDialog";

jest.mock("../../../lib/reportError", () => ({ reportError: jest.fn() }));

const onSave = jest.fn();
const onClose = jest.fn();

const renderDialog = (
  props: Partial<React.ComponentProps<typeof ProviderKeyDialog>> = {},
) =>
  render(
    <ProviderKeyDialog
      isOpen
      onClose={onClose}
      providerName="OpenRouter"
      isFile={false}
      isReplace={false}
      isFirstKey={false}
      onSave={onSave}
      {...props}
    />,
  );

beforeEach(() => {
  onSave.mockReset().mockResolvedValue(undefined);
  onClose.mockReset();
});

describe("ProviderKeyDialog", () => {
  it("saves the typed key and closes once the save answers", async () => {
    const user = setupUser();
    renderDialog();

    await user.type(screen.getByLabelText("Key"), "  sk-or-secret  ");
    await user.click(screen.getByRole("button", { name: "Save the key" }));

    expect(onSave).toHaveBeenCalledWith("sk-or-secret");
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("hides the key as it is typed", () => {
    renderDialog();
    expect(screen.getByLabelText("Key")).toHaveAttribute("type", "password");
  });

  it("stays open with the button disabled while the key is checked", async () => {
    let finish: () => void = () => {};
    onSave.mockReturnValue(new Promise<void>((r) => (finish = r)));
    const user = setupUser();
    renderDialog();

    await user.type(screen.getByLabelText("Key"), "sk-or-secret");
    await user.click(screen.getByRole("button", { name: "Save the key" }));

    const busy = screen.getByRole("button", {
      name: "Checking the key with OpenRouter…",
    });
    expect(busy).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => finish());
    expect(onClose).toHaveBeenCalled();
  });

  it("shows what the provider said when the key is refused", async () => {
    onSave.mockRejectedValue(
      new Error(
        'Request failed: 400 - {"detail":"OpenRouter refused this key."}',
      ),
    );
    const user = setupUser();
    renderDialog();

    await user.type(screen.getByLabelText("Key"), "bad");
    await user.click(screen.getByRole("button", { name: "Save the key" }));

    expect(
      await screen.findByText("OpenRouter refused this key."),
    ).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("asks before the first key and then saves", async () => {
    const user = setupUser();
    renderDialog({ isFirstKey: true });

    await user.type(screen.getByLabelText("Key"), "sk-or-secret");
    await user.click(screen.getByRole("button", { name: "Save the key" }));

    expect(onSave).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "After this, runs use only your keys. Runs that need a provider without a key will fail.",
      ),
    ).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save the key" }));
    expect(onSave).toHaveBeenCalledWith("sk-or-secret");
  });

  it("closes without saving when the first-key question is cancelled", async () => {
    const user = setupUser();
    renderDialog({ isFirstKey: true });

    await user.type(screen.getByLabelText("Key"), "sk-or-secret");
    await user.click(screen.getByRole("button", { name: "Save the key" }));
    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(onClose).toHaveBeenCalled();
    expect(onSave).not.toHaveBeenCalled();
  });

  it("does not ask twice after a refused first key", async () => {
    onSave.mockRejectedValueOnce(
      new Error('Request failed: 400 - {"detail":"Refused."}'),
    );
    const user = setupUser();
    renderDialog({ isFirstKey: true });

    await user.type(screen.getByLabelText("Key"), "bad");
    await user.click(screen.getByRole("button", { name: "Save the key" }));
    await user.click(screen.getByRole("button", { name: "Save the key" }));
    expect(await screen.findByText("Refused.")).toBeInTheDocument();

    await user.clear(screen.getByLabelText("Key"));
    await user.type(screen.getByLabelText("Key"), "good");
    await user.click(screen.getByRole("button", { name: "Save the key" }));
    expect(onSave).toHaveBeenLastCalledWith("good");
  });

  it("sends the whole text of the Google Cloud service account file", async () => {
    const user = setupUser();
    renderDialog({ providerName: "Google Cloud", isFile: true });

    const text = '{"type": "service_account"}\n';
    const file = new File([text], "sa.json", { type: "application/json" });
    // jsdom's File has no text(); every browser this app supports does.
    Object.defineProperty(file, "text", { value: async () => text });
    await user.upload(screen.getByLabelText("Service account file"), file);
    expect(await screen.findByText("sa.json")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save the key" }));
    expect(onSave).toHaveBeenCalledWith(text);
  });

  it("forgets the file when the choice is cleared", async () => {
    const user = setupUser();
    renderDialog({ providerName: "Google Cloud", isFile: true });
    const input = screen.getByLabelText("Service account file");
    const file = new File(["{}"], "sa.json", { type: "application/json" });
    Object.defineProperty(file, "text", { value: async () => "{}" });
    await user.upload(input, file);
    expect(await screen.findByText("sa.json")).toBeInTheDocument();

    Object.defineProperty(input, "files", { value: [], configurable: true });
    await act(async () => {
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(screen.queryByText("sa.json")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save the key" })).toBeDisabled();
  });

  it("says so when the file cannot be read", async () => {
    const user = setupUser();
    renderDialog({ providerName: "Google Cloud", isFile: true });
    const file = new File(["{}"], "sa.json", { type: "application/json" });
    Object.defineProperty(file, "text", {
      value: () => Promise.reject(new Error("NotReadableError")),
    });
    await user.upload(screen.getByLabelText("Service account file"), file);

    expect(
      await screen.findByText(
        "Could not read the file. Choose the service account file again.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save the key" })).toBeDisabled();
  });

  it("keeps the newer file when an older one finishes reading later", async () => {
    const user = setupUser();
    renderDialog({ providerName: "Google Cloud", isFile: true });
    const input = screen.getByLabelText("Service account file");
    let finishOld: (text: string) => void = () => {};
    const oldFile = new File(["{}"], "old.json", { type: "application/json" });
    Object.defineProperty(oldFile, "text", {
      value: () => new Promise<string>((resolve) => (finishOld = resolve)),
    });
    const newFile = new File(["{}"], "new.json", { type: "application/json" });
    Object.defineProperty(newFile, "text", { value: async () => "new" });

    await user.upload(input, oldFile);
    await user.upload(input, newFile);
    await act(async () => finishOld("old"));

    await user.click(screen.getByRole("button", { name: "Save the key" }));
    expect(onSave).toHaveBeenCalledWith("new");
  });

  it("ignores a failed read of a file that was already replaced", async () => {
    const user = setupUser();
    renderDialog({ providerName: "Google Cloud", isFile: true });
    const input = screen.getByLabelText("Service account file");
    let failOld: (err: Error) => void = () => {};
    const oldFile = new File(["{}"], "old.json", { type: "application/json" });
    Object.defineProperty(oldFile, "text", {
      value: () => new Promise<string>((_, reject) => (failOld = reject)),
    });
    const newFile = new File(["{}"], "new.json", { type: "application/json" });
    Object.defineProperty(newFile, "text", { value: async () => "new" });

    await user.upload(input, oldFile);
    await user.upload(input, newFile);
    await act(async () => failOld(new Error("NotReadableError")));

    expect(screen.queryByText(/Could not read the file/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save the key" })).toBeEnabled();
  });

  it("names the action when replacing a key", () => {
    renderDialog({ isReplace: true });
    expect(
      screen.getByRole("heading", { name: "Replace OpenRouter key" }),
    ).toBeInTheDocument();
  });
});

describe("providerKeyErrorMessage", () => {
  it("shows the backend's sentence when the server is not set up", () => {
    expect(
      providerKeyErrorMessage(
        new Error(
          'Request failed: 503 - {"detail":"This server cannot store keys."}',
        ),
      ),
    ).toBe("This server cannot store keys.");
  });

  it("falls back to the generic line for any other server error", () => {
    expect(
      providerKeyErrorMessage(new Error("Request failed: 503 - not json")),
    ).toBe("Something went wrong on our end. Please try again in a moment.");
  });
});
