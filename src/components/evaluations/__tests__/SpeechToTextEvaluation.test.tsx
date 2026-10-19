import React from "react";
import {
  render,
  screen,
  setupUser,
  waitFor,
  act,
  fireEvent,
} from "@/test-utils";
import { useRouter } from "next/navigation";
import { SpeechToTextEvaluation } from "../SpeechToTextEvaluation";

// ─── Hooks ──────────────────────────────────────────────────────────────────
let mockEnabledProviders: Set<string> | null = null;
jest.mock("../../../hooks", () => ({
  useAccessToken: () => "test-token",
  useMaxRowsPerEval: () => 20,
  useEnabledProviders: () => mockEnabledProviders,
  isProviderEnabled: (enabled: Set<string> | null, value: string) =>
    !enabled || enabled.has(value.toLowerCase()),
  // Pulled in by the create-evaluator flow behind the Evaluators tab.
  useOpenRouterModels: () => ({ providers: [], isLoading: false }),
  findModelInProviders: () => null,
}));

// The run checks the same limit of 20 outside React.
jest.mock("../../../hooks/useMaxRowsPerEval", () => ({
  getMaxRowsPerEval: async () => 20,
}));

// ─── Missing provider keys ─────────────────────────────────────────────────
let mockUsesOwnKeys = false;
let mockMissingKeys = new Set<string>();
let mockKeyErrors: Record<string, string | undefined> = {};
const mockSaveMissingKeys = jest.fn();
jest.mock("../../workspace/MissingProviderKeys", () => {
  const { useState } = jest.requireActual<typeof import("react")>("react");
  return {
    useMissingProviderKeys: () => {
      const [values, setValues] = useState<Record<string, string>>({});
      return {
        usesOwnKeys: mockUsesOwnKeys,
        isMissingKey: (p: string) => mockMissingKeys.has(p),
        values,
        errors: mockKeyErrors,
        setValue: (p: string, v: string) =>
          setValues((prev) => ({ ...prev, [p]: v })),
        saveMissingKeys: (...args: unknown[]) => mockSaveMissingKeys(...args),
        isSaving: false,
        isSavingKey: () => false,
      };
    },
    NoKeyBadge: () => <span>API key needed</span>,
    ProviderKeyInput: ({
      name,
      value,
      error,
      onChange,
      onSave,
    }: {
      name: string;
      value: string;
      error?: string;
      onChange: (v: string) => void;
      onSave: () => void;
    }) => (
      <div>
        <input
          aria-label={`${name} API key`}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button type="button" onClick={onSave}>
          {`Save the ${name} key`}
        </button>
        {error && <p role="alert">{error}</p>}
      </div>
    ),
  };
});

// ─── reportError ────────────────────────────────────────────────────────────
const mockReportError = jest.fn();
jest.mock("../../../lib/reportError", () => ({
  reportError: (...args: unknown[]) => mockReportError(...args),
}));

// ─── datasets ───────────────────────────────────────────────────────────────
const mockListDatasets = jest.fn();
jest.mock("../../../lib/datasets", () => ({
  listDatasets: (...args: unknown[]) => mockListDatasets(...args),
}));

// ─── sonner ─────────────────────────────────────────────────────────────────
const mockToastError = jest.fn();
jest.mock("sonner", () => ({
  toast: { error: (...args: unknown[]) => mockToastError(...args) },
}));

// ─── DatasetPicker ──────────────────────────────────────────────────────────
jest.mock("../DatasetPicker", () => ({
  DatasetPicker: ({
    datasets,
    selectedId,
    onSelect,
  }: {
    datasets: { uuid: string; name: string }[];
    selectedId: string;
    onSelect: (id: string) => void;
  }) => (
    <div data-testid="dataset-picker">
      {datasets.map((d) => (
        <button
          key={d.uuid}
          data-testid={`pick-${d.uuid}`}
          aria-pressed={selectedId === d.uuid}
          onClick={() => onSelect(d.uuid)}
        >
          {d.name}
        </button>
      ))}
    </div>
  ),
}));

// ─── STTDatasetEditor ───────────────────────────────────────────────────────
let editorHandleMock: {
  validate: jest.Mock;
  getNewRows: jest.Mock;
};
jest.mock("../STTDatasetEditor", () => {
  const React = require("react");
  return {
    STTDatasetEditor: React.forwardRef(
      (_props: { accessToken: string | null }, ref: React.Ref<unknown>) => {
        React.useImperativeHandle(ref, () => editorHandleMock);
        return <div data-testid="stt-editor" />;
      },
    ),
  };
});

// ─── RunEvaluatorsPanel ─────────────────────────────────────────────────────
// The real panel brings the add dialog and the create flow with it; this file
// is about the page, so it drives the selection directly.
jest.mock("../RunEvaluatorsPanel", () => ({
  RunEvaluatorsPanel: ({
    available,
    selectedUuids,
    onSelectedChange,
    beforeList,
  }: {
    available: { uuid: string; name: string }[];
    selectedUuids: string[];
    onSelectedChange: (next: string[]) => void;
    beforeList?: React.ReactNode;
  }) => (
    <div data-testid="evaluator-picker">
      {beforeList}
      {available.map((it) => {
        const isSelected = selectedUuids.includes(it.uuid);
        return (
          <button
            key={it.uuid}
            data-testid={`evaluator-${it.uuid}`}
            aria-pressed={isSelected}
            onClick={() =>
              onSelectedChange(
                isSelected
                  ? selectedUuids.filter((uuid) => uuid !== it.uuid)
                  : [...selectedUuids, it.uuid],
              )
            }
          >
            {it.name}
          </button>
        );
      })}
      <button
        data-testid="clear-evaluators"
        onClick={() => onSelectedChange([])}
      >
        Clear
      </button>
    </div>
  ),
}));

const mockEvaluatorsResponse = (
  evaluators: {
    uuid: string;
    name: string;
    evaluator_type: string;
    is_default?: boolean;
  }[],
) => ({
  ok: true,
  status: 200,
  json: async () => ({ items: evaluators }),
});

beforeEach(() => {
  jest.clearAllMocks();
  mockEnabledProviders = null;
  mockUsesOwnKeys = false;
  mockMissingKeys = new Set();
  mockKeyErrors = {};
  mockSaveMissingKeys.mockResolvedValue(true);
  mockListDatasets.mockResolvedValue([]);
  editorHandleMock = {
    validate: jest.fn().mockReturnValue(true),
    getNewRows: jest.fn().mockReturnValue([]),
  };
  (global as unknown as { fetch: jest.Mock }).fetch = jest
    .fn()
    .mockResolvedValue(
      mockEvaluatorsResponse([
        {
          uuid: "e1",
          name: "Default Eval",
          evaluator_type: "stt",
          is_default: true,
        },
        {
          uuid: "e2",
          name: "Custom Eval",
          evaluator_type: "stt",
          is_default: false,
        },
        {
          uuid: "e3",
          name: "TTS Eval",
          evaluator_type: "tts",
          is_default: false,
        },
      ]),
    );
  process.env.NEXT_PUBLIC_BACKEND_URL = "http://backend.test";
});

afterEach(() => {
  delete (global as unknown as { fetch?: jest.Mock }).fetch;
});

async function selectProvider(
  user: ReturnType<typeof setupUser>,
  label: string,
) {
  const row = screen.getAllByText(label)[0].closest("tr")!;
  await user.click(row);
}

describe("SpeechToTextEvaluation", () => {
  it("renders with the input tab active by default", async () => {
    render(<SpeechToTextEvaluation />);
    expect(screen.getByText("Dataset")).toBeInTheDocument();
    expect(screen.getByText("Evaluators")).toBeInTheDocument();
    expect(screen.getByTestId("stt-editor")).toBeInTheDocument();
    await waitFor(() =>
      expect(mockListDatasets).toHaveBeenCalledWith("test-token", "stt"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("evaluator-e1")).toBeInTheDocument(),
    );
  });

  it("starts on the settings tab when initialDatasetId is provided", async () => {
    render(<SpeechToTextEvaluation initialDatasetId="ds-1" />);
    expect(screen.getByText("Language")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("evaluator-e1")).toBeInTheDocument(),
    );
  });

  it("does not show select all as ticked when no provider is listed", async () => {
    mockEnabledProviders = new Set(["openrouter"]);
    const user = setupUser();
    const { container } = render(<SpeechToTextEvaluation />);
    await user.click(screen.getByText("Evaluators"));

    const headerBox = container.querySelector("thead th div")!;
    const mobileBox = screen.getByText("Select all").previousElementSibling!;
    for (const box of [headerBox, mobileBox]) {
      expect(box.className).not.toContain("bg-foreground border-foreground");
      expect(box.querySelector("svg")).toBeNull();
    }
  });

  it("selects and clears every provider from the table header and the mobile row", async () => {
    const user = setupUser();
    const { container } = render(<SpeechToTextEvaluation />);
    await user.click(screen.getByText("Evaluators"));
    const providerCount = () =>
      screen
        .getByText("Select providers to evaluate")
        .parentElement!.querySelector("span")!.textContent;
    const headerBox = container.querySelector("thead th div")!;
    const mobileRow = screen.getByText("Select all").parentElement!;

    for (const control of [headerBox, mobileRow]) {
      await user.click(control);
      await waitFor(() => expect(providerCount()).not.toBe("(0 selected)"));
      await user.click(control);
      await waitFor(() => expect(providerCount()).toBe("(0 selected)"));
    }
  });

  it("lists STT evaluators (excluding other types) with none pre-selected", async () => {
    const user = setupUser();
    render(<SpeechToTextEvaluation />);
    await user.click(screen.getByText("Evaluators"));
    await waitFor(() => {
      expect(screen.getByTestId("evaluator-e1")).toBeInTheDocument();
    });
    // Non-STT evaluators are filtered out.
    expect(screen.queryByTestId("evaluator-e3")).not.toBeInTheDocument();
    // Nothing is pre-selected — adding an evaluator is entirely opt-in, so even
    // an org-default evaluator starts unchecked.
    expect(screen.getByTestId("evaluator-e1")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByTestId("evaluator-e2")).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("signs out on 401 when fetching evaluators", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      status: 401,
      ok: false,
      json: async () => ({}),
    });
    const { signOut } = require("next-auth/react");
    render(<SpeechToTextEvaluation />);
    await waitFor(() =>
      expect(signOut).toHaveBeenCalledWith({
        callbackUrl: "/login?callbackUrl=%2F",
      }),
    );
  });

  it("reports an error when fetching evaluators fails", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      status: 500,
      ok: false,
      json: async () => ({}),
    });
    render(<SpeechToTextEvaluation />);
    await waitFor(() => expect(mockReportError).toHaveBeenCalled());
  });

  it("switches tabs on click", async () => {
    const user = setupUser();
    render(<SpeechToTextEvaluation />);
    await user.click(screen.getByText("Evaluators"));
    expect(screen.getByText("Language")).toBeInTheDocument();
    await user.click(screen.getByText("Dataset"));
    expect(screen.getByTestId("stt-editor")).toBeInTheDocument();
  });

  it("names the provider's website link and shows where it goes on hover", async () => {
    const user = setupUser();
    render(<SpeechToTextEvaluation />);
    await user.click(screen.getByText("Evaluators"));

    const links = screen.getAllByRole("link", {
      name: "Visit Deepgram website",
    });
    expect(links[0]).toHaveAttribute("href", "https://deepgram.com");
    expect(links[0]).not.toHaveAttribute("title");
    await user.hover(links[0]);
    await waitFor(() =>
      expect(
        screen.getAllByText("Visit Deepgram website").length,
      ).toBeGreaterThan(0),
    );
  });

  it("toggles provider selection and reflects selected count", async () => {
    const user = setupUser();
    render(<SpeechToTextEvaluation />);
    await user.click(screen.getByText("Evaluators"));

    const providerCount = () =>
      screen
        .getByText("Select providers to evaluate")
        .parentElement!.querySelector("span")!.textContent;

    expect(providerCount()).toBe("(0 selected)");
    await selectProvider(user, "Deepgram");
    expect(providerCount()).toBe("(1 selected)");
    // Toggle off
    await selectProvider(user, "Deepgram");
    expect(providerCount()).toBe("(0 selected)");
  });

  it("selects and deselects all providers via header checkbox", async () => {
    const user = setupUser();
    render(<SpeechToTextEvaluation />);
    await user.click(screen.getByText("Evaluators"));

    const providerCount = () =>
      screen
        .getByText("Select providers to evaluate")
        .parentElement!.querySelector("span")!.textContent;

    const selectAllRow = screen.getAllByText("Select all")[0].closest("div")!;
    await user.click(selectAllRow);
    await waitFor(() => expect(providerCount()).not.toBe("(0 selected)"));

    // Click again to deselect all
    await user.click(selectAllRow);
    await waitFor(() => expect(providerCount()).toBe("(0 selected)"));
  });

  it("auto-selects the single supported provider when switching to a narrowly-supported language", async () => {
    const user = setupUser();
    render(<SpeechToTextEvaluation />);
    await user.click(screen.getByText("Evaluators"));

    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "maithili");

    // Only Sarvam supports Maithili STT — it should be auto-selected.
    const providerCount = () =>
      screen
        .getByText("Select providers to evaluate")
        .parentElement!.querySelector("span")!.textContent;
    expect(providerCount()).toBe("(1 selected)");
    expect(screen.getAllByText("Sarvam")[0].closest("tr")).toHaveTextContent(
      "Sarvam",
    );
  });

  it("shows validation error and switches to settings tab when no provider selected on evaluate", async () => {
    const evaluateRef = { current: null as (() => void) | null };
    render(<SpeechToTextEvaluation evaluateRef={evaluateRef} />);
    await act(async () => {
      evaluateRef.current?.();
    });
    expect(screen.getByText("Language")).toBeInTheDocument();
  });

  it("allows evaluate to proceed with no evaluators selected (evaluators are optional)", async () => {
    const user = setupUser();
    const evaluateRef = { current: null as (() => void) | null };
    render(<SpeechToTextEvaluation evaluateRef={evaluateRef} />);
    await user.click(screen.getByText("Evaluators"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));

    await selectProvider(user, "Deepgram");
    await user.click(screen.getByTestId("clear-evaluators"));

    await act(async () => {
      evaluateRef.current?.();
    });

    // Evaluators no longer gate the flow — it advances past them to the
    // dataset-name validation (inline mode), turning the name field red.
    const input = screen.getByPlaceholderText("e.g. English customer calls");
    expect(input.className).toMatch(/border-red-500/);
  });

  it("shows a toast and blocks evaluate when dataset mode has no dataset selected", async () => {
    const user = setupUser();
    mockListDatasets.mockResolvedValue([
      { uuid: "ds-1", name: "My Dataset", item_count: 5 },
    ]);
    const evaluateRef = { current: null as (() => void) | null };
    render(<SpeechToTextEvaluation evaluateRef={evaluateRef} />);

    await user.click(screen.getByText("Evaluators"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    await selectProvider(user, "Deepgram");

    await user.click(screen.getByText("Dataset"));
    await user.click(screen.getByText("Use existing dataset"));
    await waitFor(() => screen.getByTestId("dataset-picker"));

    await act(async () => {
      evaluateRef.current?.();
    });

    expect(mockToastError).toHaveBeenCalledWith("Please select a dataset.");
  });

  it("blocks a saved dataset that is bigger than the row limit", async () => {
    const user = setupUser();
    // 25 rows, over the limit of 20.
    mockListDatasets.mockResolvedValue([
      { uuid: "ds-1", name: "Big Dataset", item_count: 25 },
    ]);
    const evaluateRef = { current: null as (() => void) | null };
    render(<SpeechToTextEvaluation evaluateRef={evaluateRef} />);

    await user.click(screen.getByText("Evaluators"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    await selectProvider(user, "Deepgram");

    await user.click(screen.getByText("Dataset"));
    await user.click(screen.getByText("Use existing dataset"));
    await waitFor(() => screen.getByTestId("dataset-picker"));
    await user.click(screen.getByTestId("pick-ds-1"));

    await act(async () => {
      evaluateRef.current?.();
    });

    expect(mockToastError).toHaveBeenCalled();
    const calledUrls = (global.fetch as jest.Mock).mock.calls.map((c) => c[0]);
    expect(calledUrls.some((u: string) => u.includes("/stt/evaluate"))).toBe(
      false,
    );
  });

  it("runs a saved dataset that fits inside the row limit", async () => {
    const user = setupUser();
    mockListDatasets.mockResolvedValue([
      { uuid: "ds-1", name: "Small Dataset", item_count: 5 },
    ]);
    const evaluateRef = { current: null as (() => void) | null };
    render(<SpeechToTextEvaluation evaluateRef={evaluateRef} />);

    await user.click(screen.getByText("Evaluators"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    await selectProvider(user, "Deepgram");

    await user.click(screen.getByText("Dataset"));
    await user.click(screen.getByText("Use existing dataset"));
    await waitFor(() => screen.getByTestId("dataset-picker"));
    await user.click(screen.getByTestId("pick-ds-1"));

    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ task_id: "task-ok", status: "queued" }),
    });

    await act(async () => {
      evaluateRef.current?.();
    });

    await waitFor(() => {
      const calledUrls = (global.fetch as jest.Mock).mock.calls.map(
        (c) => c[0],
      );
      expect(calledUrls.some((u: string) => u.includes("/stt/evaluate"))).toBe(
        true,
      );
    });
  });

  describe("on the workspace's own keys", () => {
    beforeEach(() => {
      mockUsesOwnKeys = true;
      // The workspace only has a key for OpenAI.
      mockEnabledProviders = new Set(["openai"]);
      mockMissingKeys = new Set(["deepgram"]);
    });

    async function pickSavedDataset(user: ReturnType<typeof setupUser>) {
      await user.click(screen.getByText("Dataset"));
      await user.click(screen.getByText("Use existing dataset"));
      await waitFor(() => screen.getByTestId("dataset-picker"));
      await user.click(screen.getByTestId("pick-ds-1"));
    }

    it("lists a provider with no key and marks it", async () => {
      const user = setupUser();
      render(<SpeechToTextEvaluation />);
      await user.click(screen.getByText("Evaluators"));
      const deepgramRow = screen.getAllByText("Deepgram")[0].closest("tr")!;
      expect(deepgramRow).toHaveTextContent("API key needed");
      const openaiRow = screen.getAllByText("OpenAI")[0].closest("tr")!;
      expect(openaiRow).not.toHaveTextContent("API key needed");
    });

    it("shows the key field once a provider with no key is selected", async () => {
      const user = setupUser();
      render(<SpeechToTextEvaluation />);
      await user.click(screen.getByText("Evaluators"));
      expect(screen.queryAllByLabelText("Deepgram API key")).toHaveLength(0);

      await selectProvider(user, "Deepgram");

      expect(
        screen.getAllByLabelText("Deepgram API key").length,
      ).toBeGreaterThan(0);
    });

    it("saves the key from either copy of the field without unselecting the provider", async () => {
      mockSaveMissingKeys.mockResolvedValue(true);
      const user = setupUser();
      render(<SpeechToTextEvaluation />);
      await user.click(screen.getByText("Evaluators"));
      // Opening the provider's website does not select it.
      for (const link of screen.getAllByRole("link", {
        name: "Visit Deepgram website",
      }))
        fireEvent.click(link);
      expect(screen.queryAllByLabelText("Deepgram API key")).toHaveLength(0);
      await selectProvider(user, "Deepgram");

      const fields = screen.getAllByLabelText("Deepgram API key");
      const saves = screen.getAllByRole("button", {
        name: "Save the Deepgram key",
      });
      expect(fields).toHaveLength(2);
      for (const field of fields) await user.type(field, "k");
      for (const save of saves) await user.click(save);

      expect(mockSaveMissingKeys).toHaveBeenCalledTimes(2);
      expect(mockSaveMissingKeys).toHaveBeenNthCalledWith(1, ["deepgram"]);
      expect(mockSaveMissingKeys).toHaveBeenNthCalledWith(2, ["deepgram"]);
      expect(screen.getAllByLabelText("Deepgram API key")).toHaveLength(2);
    });

    it("does not start the run when the key could not be saved", async () => {
      mockListDatasets.mockResolvedValue([
        { uuid: "ds-1", name: "Small Dataset", item_count: 5 },
      ]);
      mockSaveMissingKeys.mockImplementation(async () => {
        mockKeyErrors = { deepgram: "Paste a key for this provider" };
        return false;
      });
      const user = setupUser();
      const evaluateRef = { current: null as (() => void) | null };
      render(<SpeechToTextEvaluation evaluateRef={evaluateRef} />);
      await user.click(screen.getByText("Evaluators"));
      await selectProvider(user, "Deepgram");
      await pickSavedDataset(user);

      await act(async () => {
        evaluateRef.current?.();
      });

      expect(mockSaveMissingKeys).toHaveBeenCalledWith(["deepgram"]);
      // Back on the providers tab, where the key field shows the reason.
      expect(screen.getByText("Language")).toBeInTheDocument();
      expect(
        screen.getAllByText("Paste a key for this provider").length,
      ).toBeGreaterThan(0);
      const calledUrls = (global.fetch as jest.Mock).mock.calls.map(
        (c) => c[0],
      );
      expect(calledUrls.some((u: string) => u.includes("/stt/evaluate"))).toBe(
        false,
      );
    });

    it("starts the run once the key is saved", async () => {
      mockListDatasets.mockResolvedValue([
        { uuid: "ds-1", name: "Small Dataset", item_count: 5 },
      ]);
      const user = setupUser();
      const evaluateRef = { current: null as (() => void) | null };
      render(<SpeechToTextEvaluation evaluateRef={evaluateRef} />);
      await user.click(screen.getByText("Evaluators"));
      await selectProvider(user, "Deepgram");
      await user.type(
        screen.getAllByLabelText("Deepgram API key")[0],
        "dg-key",
      );
      await pickSavedDataset(user);

      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ task_id: "task-ok", status: "queued" }),
      });

      await act(async () => {
        evaluateRef.current?.();
      });

      expect(mockSaveMissingKeys).toHaveBeenCalledWith(["deepgram"]);
      await waitFor(() => {
        const calledUrls = (global.fetch as jest.Mock).mock.calls.map(
          (c) => c[0],
        );
        expect(
          calledUrls.some((u: string) => u.includes("/stt/evaluate")),
        ).toBe(true);
      });
    });
  });

  it("shows the empty-datasets state and can switch back to manual upload", async () => {
    const user = setupUser();
    render(<SpeechToTextEvaluation />);
    await user.click(screen.getByText("Use existing dataset"));
    expect(screen.getByText("No STT datasets yet")).toBeInTheDocument();
    await user.click(screen.getByText("Upload a dataset"));
    expect(screen.getByTestId("stt-editor")).toBeInTheDocument();
  });

  it("removes selected dataset if it becomes empty (item_count 0)", async () => {
    mockListDatasets.mockResolvedValue([
      { uuid: "ds-1", name: "Empty Dataset", item_count: 0 },
    ]);
    render(<SpeechToTextEvaluation initialDatasetId="ds-1" />);
    await waitFor(() => expect(mockListDatasets).toHaveBeenCalled());
  });

  it("validates dataset name is required in inline mode", async () => {
    const user = setupUser();
    const evaluateRef = { current: null as (() => void) | null };
    render(<SpeechToTextEvaluation evaluateRef={evaluateRef} />);
    await user.click(screen.getByText("Evaluators"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    await selectProvider(user, "Deepgram");

    await act(async () => {
      evaluateRef.current?.();
    });

    const input = screen.getByPlaceholderText("e.g. English customer calls");
    expect(input.className).toMatch(/border-red-500/);
  });

  it("blocks evaluate when the dataset editor reports invalid rows", async () => {
    const user = setupUser();
    const evaluateRef = { current: null as (() => void) | null };
    render(<SpeechToTextEvaluation evaluateRef={evaluateRef} />);
    await user.click(screen.getByText("Evaluators"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    await selectProvider(user, "Deepgram");

    const nameInput = screen.getByPlaceholderText(
      "e.g. English customer calls",
    );
    await user.type(nameInput, "My rows");

    editorHandleMock.validate.mockReturnValue(false);

    await act(async () => {
      evaluateRef.current?.();
    });

    // Should remain blocked - evaluate not triggered (no fetch to /stt/evaluate)
    const calledUrls = (global.fetch as jest.Mock).mock.calls.map((c) => c[0]);
    expect(calledUrls.some((u: string) => u.includes("/stt/evaluate"))).toBe(
      false,
    );
    expect(screen.getByText("Dataset")).toBeInTheDocument();
  });

  it("submits an inline evaluation successfully and navigates to the result page", async () => {
    const user = setupUser();
    const onEvaluatingChange = jest.fn();
    const evaluateRef = { current: null as (() => void) | null };
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        mockEvaluatorsResponse([
          {
            uuid: "e1",
            name: "Default Eval",
            evaluator_type: "stt",
            is_default: true,
          },
        ]),
      )
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ task_id: "task-123", status: "queued" }),
      });

    render(
      <SpeechToTextEvaluation
        evaluateRef={evaluateRef}
        onEvaluatingChange={onEvaluatingChange}
      />,
    );
    await user.click(screen.getByText("Evaluators"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    await selectProvider(user, "Deepgram");

    const nameInput = screen.getByPlaceholderText(
      "e.g. English customer calls",
    );
    await user.type(nameInput, "My dataset");

    editorHandleMock.getNewRows.mockReturnValue([
      { audio_path: "s3://bucket/a.wav", text: "hello world" },
    ]);

    await act(async () => {
      evaluateRef.current?.();
    });

    await waitFor(() => {
      const router = useRouter();
      expect(router.push).toHaveBeenCalledWith("/stt/task-123");
    });
    expect(onEvaluatingChange).toHaveBeenCalledWith(true);

    // Sarvam LLM judges default to on — the evaluate body carries the flag.
    const evalCall = (global.fetch as jest.Mock).mock.calls.find(([url]) =>
      String(url).endsWith("/stt/evaluate"),
    );
    expect(evalCall).toBeDefined();
    expect(JSON.parse(evalCall![1].body)).toMatchObject({
      sarvam_judges: true,
    });
  });

  it("sends sarvam_judges=false when the toggle is turned off", async () => {
    const user = setupUser();
    const evaluateRef = { current: null as (() => void) | null };
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        mockEvaluatorsResponse([
          {
            uuid: "e1",
            name: "Default Eval",
            evaluator_type: "stt",
            is_default: true,
          },
        ]),
      )
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ task_id: "task-789", status: "queued" }),
      });

    render(<SpeechToTextEvaluation evaluateRef={evaluateRef} />);
    await user.click(screen.getByText("Evaluators"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    await selectProvider(user, "Deepgram");

    await user.click(
      screen.getByRole("switch", {
        name: "Toggle built-in LLM-based evaluation metrics",
      }),
    );

    const nameInput = screen.getByPlaceholderText(
      "e.g. English customer calls",
    );
    await user.type(nameInput, "My dataset");
    editorHandleMock.getNewRows.mockReturnValue([
      { audio_path: "s3://bucket/a.wav", text: "hello world" },
    ]);

    await act(async () => {
      evaluateRef.current?.();
    });

    await waitFor(() => {
      const router = useRouter();
      expect(router.push).toHaveBeenCalledWith("/stt/task-789");
    });
    const evalCall = (global.fetch as jest.Mock).mock.calls.find(([url]) =>
      String(url).endsWith("/stt/evaluate"),
    );
    expect(JSON.parse(evalCall![1].body)).toMatchObject({
      sarvam_judges: false,
    });
  });

  it("submits a dataset-mode evaluation successfully", async () => {
    const user = setupUser();
    mockListDatasets.mockResolvedValue([
      { uuid: "ds-1", name: "My Dataset", item_count: 5 },
    ]);
    const evaluateRef = { current: null as (() => void) | null };
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        mockEvaluatorsResponse([
          {
            uuid: "e1",
            name: "Default Eval",
            evaluator_type: "stt",
            is_default: true,
          },
        ]),
      )
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ task_id: "task-456", status: "queued" }),
      });

    render(<SpeechToTextEvaluation evaluateRef={evaluateRef} />);
    await user.click(screen.getByText("Evaluators"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    await selectProvider(user, "Deepgram");

    await user.click(screen.getByText("Dataset"));
    await user.click(screen.getByText("Use existing dataset"));
    await waitFor(() => screen.getByTestId("pick-ds-1"));
    await user.click(screen.getByTestId("pick-ds-1"));

    await act(async () => {
      evaluateRef.current?.();
    });

    await waitFor(() => {
      const router = useRouter();
      expect(router.push).toHaveBeenCalledWith("/stt/task-456");
    });
  });

  it("signs out on 401 during evaluate submission", async () => {
    const user = setupUser();
    const evaluateRef = { current: null as (() => void) | null };
    const { signOut } = require("next-auth/react");
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        mockEvaluatorsResponse([
          {
            uuid: "e1",
            name: "Default Eval",
            evaluator_type: "stt",
            is_default: true,
          },
        ]),
      )
      .mockResolvedValueOnce({
        status: 401,
        ok: false,
        json: async () => ({}),
      });

    render(<SpeechToTextEvaluation evaluateRef={evaluateRef} />);
    await user.click(screen.getByText("Evaluators"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    await selectProvider(user, "Deepgram");
    const nameInput = screen.getByPlaceholderText(
      "e.g. English customer calls",
    );
    await user.type(nameInput, "My dataset");
    editorHandleMock.getNewRows.mockReturnValue([
      { audio_path: "s3://bucket/a.wav", text: "hello" },
    ]);

    await act(async () => {
      evaluateRef.current?.();
    });

    await waitFor(() =>
      expect(signOut).toHaveBeenCalledWith({
        callbackUrl: "/login?callbackUrl=%2F",
      }),
    );
  });

  it("reports an error and resets isEvaluating when the evaluate request fails", async () => {
    const user = setupUser();
    const evaluateRef = { current: null as (() => void) | null };
    const onEvaluatingChange = jest.fn();
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        mockEvaluatorsResponse([
          {
            uuid: "e1",
            name: "Default Eval",
            evaluator_type: "stt",
            is_default: true,
          },
        ]),
      )
      .mockResolvedValueOnce({
        status: 500,
        ok: false,
        json: async () => ({}),
      });

    render(
      <SpeechToTextEvaluation
        evaluateRef={evaluateRef}
        onEvaluatingChange={onEvaluatingChange}
      />,
    );
    await user.click(screen.getByText("Evaluators"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    await selectProvider(user, "Deepgram");
    const nameInput = screen.getByPlaceholderText(
      "e.g. English customer calls",
    );
    await user.type(nameInput, "My dataset");
    editorHandleMock.getNewRows.mockReturnValue([
      { audio_path: "s3://bucket/a.wav", text: "hello" },
    ]);

    await act(async () => {
      evaluateRef.current?.();
    });

    await waitFor(() =>
      expect(mockReportError).toHaveBeenCalledWith(
        "Error evaluating:",
        expect.any(Error),
      ),
    );
    expect(onEvaluatingChange).toHaveBeenCalledWith(false);
  });

  it("reports an error when NEXT_PUBLIC_BACKEND_URL is unset during evaluate", async () => {
    const user = setupUser();
    const evaluateRef = { current: null as (() => void) | null };
    render(<SpeechToTextEvaluation evaluateRef={evaluateRef} />);
    await user.click(screen.getByText("Evaluators"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    await selectProvider(user, "Deepgram");
    const nameInput = screen.getByPlaceholderText(
      "e.g. English customer calls",
    );
    await user.type(nameInput, "My dataset");
    editorHandleMock.getNewRows.mockReturnValue([
      { audio_path: "s3://bucket/a.wav", text: "hello" },
    ]);

    delete process.env.NEXT_PUBLIC_BACKEND_URL;

    await act(async () => {
      evaluateRef.current?.();
    });

    expect(mockReportError).toHaveBeenCalledWith(
      "BACKEND_URL environment variable is not set",
    );
  });
});
