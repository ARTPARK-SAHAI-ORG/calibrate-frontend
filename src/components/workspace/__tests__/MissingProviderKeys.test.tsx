import { act, renderHook } from "@testing-library/react";
import { fireEvent, render, screen, setupUser } from "@/test-utils";
import {
  NoKeyBadge,
  ProviderKeyInput,
  useMissingProviderKeys,
} from "../MissingProviderKeys";

jest.mock("../../../lib/reportError", () => ({ reportError: jest.fn() }));

const saveProviderKey = jest.fn();
let usesOwnKeys = true;
let enabled: Set<string> | null = new Set(["openai"]);

jest.mock("../../../hooks", () => ({
  useAccessToken: () => "tok",
  useUsesOwnProviderKeys: () => usesOwnKeys,
  useEnabledProviders: () => enabled,
  isProviderEnabled: (set: Set<string> | null, p: string) =>
    set === null || set.has(p.toLowerCase()),
  useProviderKeys: () => ({ saveProviderKey }),
}));
jest.mock("../../../lib/nav", () => ({ useOrgUuid: () => "org-1" }));

beforeEach(() => {
  jest.clearAllMocks();
  usesOwnKeys = true;
  enabled = new Set(["openai"]);
  saveProviderKey.mockResolvedValue({});
});

describe("useMissingProviderKeys", () => {
  it("never reports a missing key on Calibrate's keys", () => {
    usesOwnKeys = false;
    const { result } = renderHook(() => useMissingProviderKeys());
    expect(result.current.isMissingKey("deepgram")).toBe(false);
  });

  it("reports a missing key for a provider the workspace cannot run", () => {
    const { result } = renderHook(() => useMissingProviderKeys());
    expect(result.current.isMissingKey("deepgram")).toBe(true);
    expect(result.current.isMissingKey("openai")).toBe(false);
  });

  it("saves nothing when no provider is missing a key", async () => {
    const { result } = renderHook(() => useMissingProviderKeys());
    let ok = false;
    await act(async () => {
      ok = await result.current.saveMissingKeys(["openai"]);
    });
    expect(ok).toBe(true);
    expect(saveProviderKey).not.toHaveBeenCalled();
  });

  it("asks for a key when the field is empty", async () => {
    const { result } = renderHook(() => useMissingProviderKeys());
    act(() => result.current.setValue("deepgram", "   "));
    let ok = true;
    await act(async () => {
      ok = await result.current.saveMissingKeys(["deepgram"]);
    });
    expect(ok).toBe(false);
    expect(result.current.errors.deepgram).toBe(
      "Paste a key for this provider",
    );
    expect(saveProviderKey).not.toHaveBeenCalled();
  });

  it("saves the trimmed key and clears the field and its error", async () => {
    const { result } = renderHook(() => useMissingProviderKeys());
    await act(async () => {
      await result.current.saveMissingKeys(["deepgram"]);
    });
    expect(result.current.errors.deepgram).toBeDefined();
    act(() => result.current.setValue("deepgram", "  dg-key  "));
    expect(result.current.errors.deepgram).toBeUndefined();
    let ok = false;
    await act(async () => {
      ok = await result.current.saveMissingKeys(["deepgram", "deepgram"]);
    });
    expect(ok).toBe(true);
    expect(saveProviderKey).toHaveBeenCalledTimes(1);
    expect(saveProviderKey).toHaveBeenCalledWith("deepgram", "dg-key");
    expect(result.current.values.deepgram).toBe("");
    expect("deepgram" in result.current.errors).toBe(false);
  });

  it("shows the backend's reason when a key is refused", async () => {
    saveProviderKey.mockRejectedValue(
      new Error(
        'Request failed: 400 - {"detail":"Deepgram did not accept this key"}',
      ),
    );
    const { result } = renderHook(() => useMissingProviderKeys());
    act(() => result.current.setValue("deepgram", "bad"));
    let ok = true;
    await act(async () => {
      ok = await result.current.saveMissingKeys(["deepgram"]);
    });
    expect(ok).toBe(false);
    expect(result.current.errors.deepgram).toBe(
      "Deepgram did not accept this key",
    );
    expect(result.current.values.deepgram).toBe("bad");
    expect(result.current.isSaving).toBe(false);
  });

  it("marks only the provider being saved, and keeps other providers' errors", async () => {
    let finish: () => void = () => {};
    saveProviderKey.mockReturnValue(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    );
    const { result } = renderHook(() => useMissingProviderKeys());
    await act(async () => {
      await result.current.saveMissingKeys(["sarvam"]);
    });
    expect(result.current.errors.sarvam).toBe("Paste a key for this provider");

    act(() => result.current.setValue("deepgram", "dg"));
    let pending: Promise<boolean> = Promise.resolve(false);
    act(() => {
      pending = result.current.saveMissingKeys(["deepgram"]);
    });
    expect(result.current.isSaving).toBe(true);
    expect(result.current.isSavingKey("deepgram")).toBe(true);
    expect(result.current.isSavingKey("sarvam")).toBe(false);

    await act(async () => {
      finish();
      await pending;
    });
    expect(result.current.isSavingKey("deepgram")).toBe(false);
    expect(result.current.errors.sarvam).toBe("Paste a key for this provider");
  });
});

function renderInput(
  props: Partial<React.ComponentProps<typeof ProviderKeyInput>> = {},
) {
  const onChange = jest.fn();
  const onSave = jest.fn();
  render(
    <ProviderKeyInput
      provider="deepgram"
      name="Deepgram"
      value=""
      onChange={onChange}
      onSave={onSave}
      saving={false}
      {...props}
    />,
  );
  return { onChange, onSave };
}

describe("ProviderKeyInput", () => {
  it("disables Save while the field is empty", () => {
    renderInput();
    expect(screen.getByLabelText("Deepgram API key")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Save the Deepgram key" }),
    ).toBeDisabled();
  });

  it("passes typed text to onChange", () => {
    const { onChange } = renderInput();
    fireEvent.change(screen.getByLabelText("Deepgram API key"), {
      target: { value: "k" },
    });
    expect(onChange).toHaveBeenCalledWith("k");
  });

  it("saves on the Save button and on Enter", async () => {
    const user = setupUser();
    const { onSave } = renderInput({ value: "k" });
    await user.click(
      screen.getByRole("button", { name: "Save the Deepgram key" }),
    );
    fireEvent.keyDown(screen.getByLabelText("Deepgram API key"), {
      key: "Enter",
    });
    expect(onSave).toHaveBeenCalledTimes(2);
  });

  it("does not save on Enter while the field is blank", () => {
    const { onSave } = renderInput({ value: "  " });
    fireEvent.keyDown(screen.getByLabelText("Deepgram API key"), {
      key: "Enter",
    });
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows Verifying while the key is being checked", () => {
    renderInput({ value: "k", saving: true });
    const button = screen.getByRole("button", { name: "Verifying" });
    expect(button).toHaveTextContent("Verifying");
    expect(button).toBeDisabled();
    expect(screen.getByLabelText("Deepgram API key")).toBeDisabled();
  });

  it("shows the error as an alert tied to the field", () => {
    renderInput({ error: "Deepgram did not accept this key" });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Deepgram did not accept this key",
    );
    const field = screen.getByLabelText("Deepgram API key");
    expect(field).toHaveAttribute("aria-invalid", "true");
    expect(field.getAttribute("aria-describedby")).toBe(
      screen.getByRole("alert").id,
    );
  });

  it("uses a text box for Google Cloud", () => {
    renderInput({ provider: "google", name: "Google Cloud" });
    expect(screen.getByLabelText("Google Cloud API key").tagName).toBe(
      "TEXTAREA",
    );
  });
});

describe("NoKeyBadge", () => {
  it("says an API key is needed", () => {
    render(<NoKeyBadge />);
    expect(screen.getByText("API key needed")).toBeInTheDocument();
  });
});
