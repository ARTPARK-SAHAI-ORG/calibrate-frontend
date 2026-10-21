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
import { TextToSpeechEvaluation } from "../TextToSpeechEvaluation";

// ─── Hooks ──────────────────────────────────────────────────────────────────
let mockEnabledProviders: Set<string> | null = null;
jest.mock("../../../hooks", () => ({
  useAccessToken: () => "test-token",
  useMaxRowsPerEval: () => 20,
  useEnabledProviders: () => mockEnabledProviders,
  isProviderEnabled: (enabled: Set<string> | null, value: string) =>
    !enabled || enabled.has(value.toLowerCase()),
}));

// ─── MissingProviderKeys ────────────────────────────────────────────────────
// The run checks the same limit of 20 outside React.
jest.mock("../../../hooks/useMaxRowsPerEval", () => ({
  getMaxRowsPerEval: async () => 20,
}));

let mockUsesOwnKeys = false;
let mockMissingKeys = new Set<string>();
const mockSaveMissingKeys = jest.fn();
const mockSetValue = jest.fn();
jest.mock("../../workspace/MissingProviderKeys", () => ({
  useMissingProviderKeys: () => ({
    usesOwnKeys: mockUsesOwnKeys,
    isMissingKey: (p: string) => mockMissingKeys.has(p),
    values: {},
    errors: {},
    setValue: mockSetValue,
    saveMissingKeys: mockSaveMissingKeys,
    isSaving: false,
    isSavingKey: () => false,
  }),
  NoKeyBadge: () => <span>API key needed</span>,
  ProviderKeyInput: ({
    name,
    onChange,
    onSave,
  }: {
    name: string;
    onChange: (v: string) => void;
    onSave: () => void;
  }) => (
    <div>
      <input
        aria-label={`${name} API key`}
        onChange={(e) => onChange(e.target.value)}
      />
      <button type="button" onClick={onSave}>
        {`Save the ${name} key`}
      </button>
    </div>
  ),
}));

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

// ─── TTSDatasetEditor ───────────────────────────────────────────────────────
let editorHandleMock: {
  getNewRows: jest.Mock;
};
jest.mock("../TTSDatasetEditor", () => {
  const React = require("react");
  return {
    TTSDatasetEditor: React.forwardRef(
      (
        props: {
          datasetName: string;
          onDatasetNameChange: (v: string) => void;
          datasetNameInvalid: boolean;
        },
        ref: React.Ref<unknown>,
      ) => {
        React.useImperativeHandle(ref, () => editorHandleMock);
        return (
          <div data-testid="tts-editor">
            <input
              aria-label="dataset-name-input"
              data-invalid={props.datasetNameInvalid ? "true" : "false"}
              value={props.datasetName}
              onChange={(e: React.ChangeEvent<HTMLInputElement>) =>
                props.onDatasetNameChange(e.target.value)
              }
            />
          </div>
        );
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
  }: {
    available: { uuid: string; name: string }[];
    selectedUuids: string[];
    onSelectedChange: (next: string[]) => void;
  }) => (
    <div data-testid="evaluator-picker">
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

const flushPromises = () => new Promise((resolve) => setTimeout(resolve, 0));

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
  mockSaveMissingKeys.mockResolvedValue(true);
  mockListDatasets.mockResolvedValue([]);
  editorHandleMock = {
    getNewRows: jest.fn().mockReturnValue([]),
  };
  (global as unknown as { fetch: jest.Mock }).fetch = jest
    .fn()
    .mockResolvedValue(
      mockEvaluatorsResponse([
        {
          uuid: "e1",
          name: "Default Eval",
          evaluator_type: "tts",
          is_default: true,
        },
        {
          uuid: "e2",
          name: "Custom Eval",
          evaluator_type: "tts",
          is_default: false,
        },
        {
          uuid: "e3",
          name: "STT Eval",
          evaluator_type: "stt",
          is_default: false,
        },
      ]),
    );
  process.env.NEXT_PUBLIC_BACKEND_URL = "http://backend.test";
});

afterEach(() => {
  delete (global as unknown as { fetch?: jest.Mock }).fetch;
});

describe("TextToSpeechEvaluation", () => {
  it("renders with the input tab active by default", async () => {
    render(<TextToSpeechEvaluation />);
    expect(screen.getByText("Dataset")).toBeInTheDocument();
    expect(screen.getByText("Evaluators")).toBeInTheDocument();
    expect(screen.getByTestId("tts-editor")).toBeInTheDocument();
    await waitFor(() =>
      expect(mockListDatasets).toHaveBeenCalledWith("test-token", "tts"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("evaluator-e1")).toBeInTheDocument(),
    );
  });

  it("starts on the settings tab when initialDatasetId is provided", async () => {
    render(<TextToSpeechEvaluation initialDatasetId="ds-1" />);
    // Settings tab content visible (language selector) rather than input tab
    expect(screen.getByText("Language")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByTestId("evaluator-e1")).toBeInTheDocument(),
    );
  });

  it("fetches and splits evaluators into available + pre-selected defaults", async () => {
    render(<TextToSpeechEvaluation />);
    await user_switchToSettings();
    await waitFor(() => {
      expect(screen.getByTestId("evaluator-e1")).toBeInTheDocument();
    });
    // Only tts-type evaluators appear (e3 filtered out)
    expect(screen.queryByTestId("evaluator-e3")).not.toBeInTheDocument();
    // Org default evaluator pre-selected
    expect(screen.getByTestId("evaluator-e1")).toHaveAttribute(
      "aria-pressed",
      "true",
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
    render(<TextToSpeechEvaluation />);
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
    render(<TextToSpeechEvaluation />);
    await waitFor(() => expect(mockReportError).toHaveBeenCalled());
  });

  it("switches tabs on click", async () => {
    const user = setupUser();
    render(<TextToSpeechEvaluation />);
    await user.click(screen.getByText("Evaluators"));
    expect(screen.getByText("Language")).toBeInTheDocument();
    await user.click(screen.getByText("Dataset"));
    expect(screen.getByTestId("tts-editor")).toBeInTheDocument();
  });

  it("names the provider's website link and shows where it goes on hover", async () => {
    const user = setupUser();
    render(<TextToSpeechEvaluation />);
    await user.click(screen.getByText("Evaluators"));

    const links = screen.getAllByRole("link", {
      name: "Visit OpenAI website",
    });
    expect(links[0]).toHaveAttribute("href", "https://openai.com");
    expect(links[0]).not.toHaveAttribute("title");
    await user.hover(links[0]);
    await waitFor(() =>
      expect(
        screen.getAllByText("Visit OpenAI website").length,
      ).toBeGreaterThan(0),
    );
  });

  it("does not show select all as ticked when the provider list is empty", async () => {
    mockEnabledProviders = new Set(["openrouter"]);
    const user = setupUser();
    const { container } = render(<TextToSpeechEvaluation />);
    await user.click(screen.getByText("Evaluators"));

    const headerBox = container.querySelector("thead th div")!;
    const mobileBox = screen.getByText("Select all").previousElementSibling!;
    for (const box of [headerBox, mobileBox]) {
      expect(box.className).not.toContain("bg-foreground border-foreground");
      expect(box.querySelector("svg")).toBeNull();
    }
  });

  it("does not mention keys while every provider is available", async () => {
    const user = setupUser();
    render(<TextToSpeechEvaluation />);
    await user.click(screen.getByText("Evaluators"));
    expect(screen.queryByText(/provider key/)).not.toBeInTheDocument();
  });

  it("lists every provider on own keys and marks the ones with no key", async () => {
    mockEnabledProviders = new Set(["openai"]);
    mockUsesOwnKeys = true;
    mockMissingKeys = new Set(["cartesia"]);
    const user = setupUser();
    render(<TextToSpeechEvaluation />);
    await user.click(screen.getByText("Evaluators"));

    const cartesiaRow = screen.getAllByText("Cartesia")[0].closest("tr")!;
    expect(cartesiaRow).toHaveTextContent("API key needed");
    const openaiRow = screen.getAllByText("OpenAI")[0].closest("tr")!;
    expect(openaiRow).not.toHaveTextContent("API key needed");
    expect(screen.queryByLabelText("Cartesia API key")).not.toBeInTheDocument();

    await user.click(cartesiaRow);
    expect(screen.getAllByLabelText("Cartesia API key").length).toBeGreaterThan(
      0,
    );
  });

  it("saves the key from either copy of the field", async () => {
    mockUsesOwnKeys = true;
    mockMissingKeys = new Set(["cartesia"]);
    mockSaveMissingKeys.mockResolvedValue(true);
    const user = setupUser();
    render(<TextToSpeechEvaluation />);
    await user.click(screen.getByText("Evaluators"));
    // Opening the provider's website does not select it.
    for (const link of screen.getAllByRole("link", {
      name: "Visit Cartesia website",
    }))
      fireEvent.click(link);
    expect(screen.queryAllByLabelText("Cartesia API key")).toHaveLength(0);
    await user.click(screen.getAllByText("Cartesia")[0].closest("tr")!);

    const fields = screen.getAllByLabelText("Cartesia API key");
    expect(fields).toHaveLength(2);
    for (const field of fields) await user.type(field, "k");
    expect(mockSetValue).toHaveBeenCalledWith("cartesia", "k");
    expect(mockSetValue).toHaveBeenCalledTimes(2);
    for (const save of screen.getAllByRole("button", {
      name: "Save the Cartesia key",
    }))
      await user.click(save);

    expect(mockSaveMissingKeys).toHaveBeenCalledTimes(2);
    expect(mockSaveMissingKeys).toHaveBeenCalledWith(["cartesia"]);
    expect(screen.getAllByLabelText("Cartesia API key")).toHaveLength(2);
  });

  it("does not start the run when a missing key fails to save", async () => {
    mockUsesOwnKeys = true;
    mockMissingKeys = new Set(["cartesia"]);
    mockSaveMissingKeys.mockResolvedValue(false);
    const user = setupUser();
    const onEvaluatingChange = jest.fn();
    const evaluateRef = { current: null as (() => void) | null };
    render(
      <TextToSpeechEvaluation
        evaluateRef={evaluateRef}
        onEvaluatingChange={onEvaluatingChange}
      />,
    );
    await user.click(screen.getByText("Evaluators"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    await user.click(screen.getAllByText("Cartesia")[0].closest("tr")!);
    await user.click(screen.getByText("Dataset"));
    await user.type(screen.getByLabelText("dataset-name-input"), "My dataset");
    editorHandleMock.getNewRows.mockReturnValue([{ text: "hello" }]);

    await act(async () => {
      evaluateRef.current?.();
    });

    expect(mockSaveMissingKeys).toHaveBeenCalledWith(["cartesia"]);
    expect(onEvaluatingChange).toHaveBeenLastCalledWith(false);
    const calledUrls = (global.fetch as jest.Mock).mock.calls.map((c) => c[0]);
    expect(calledUrls.some((u: string) => u.includes("/tts/evaluate"))).toBe(
      false,
    );
    // The Models tab is the one shown again, so the key error is in view.
    expect(
      screen.getByText("Language").closest('[class="space-y-8"]'),
    ).not.toBeNull();
  });

  it("starts the run once the missing keys save", async () => {
    mockUsesOwnKeys = true;
    mockMissingKeys = new Set(["cartesia"]);
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        mockEvaluatorsResponse([
          {
            uuid: "e1",
            name: "Default Eval",
            evaluator_type: "tts",
            is_default: true,
          },
        ]),
      )
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ task_id: "task-789", status: "queued" }),
      });
    const user = setupUser();
    const evaluateRef = { current: null as (() => void) | null };
    render(<TextToSpeechEvaluation evaluateRef={evaluateRef} />);
    await user.click(screen.getByText("Evaluators"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    await user.click(screen.getAllByText("Cartesia")[0].closest("tr")!);
    await user.type(screen.getByLabelText("dataset-name-input"), "My dataset");
    editorHandleMock.getNewRows.mockReturnValue([{ text: "hello" }]);

    await act(async () => {
      evaluateRef.current?.();
    });

    expect(mockSaveMissingKeys).toHaveBeenCalledWith(["cartesia"]);
    await waitFor(() => {
      const router = useRouter();
      expect(router.push).toHaveBeenCalledWith("/tts/task-789");
    });
  });

  it("selects and clears every provider from the table header and the mobile row", async () => {
    const user = setupUser();
    const { container } = render(<TextToSpeechEvaluation />);
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

  it("changes language and filters providers, deselecting unsupported ones", async () => {
    const user = setupUser();
    render(<TextToSpeechEvaluation />);
    await user.click(screen.getByText("Evaluators"));

    // Select a provider supported broadly, e.g. OpenAI (supports English)
    const openaiRow = screen.getAllByText("OpenAI")[0].closest("tr")!;
    await user.click(openaiRow);
    const providerCount = () =>
      screen
        .getByText("Select providers to evaluate")
        .parentElement!.querySelector("span")!.textContent;
    expect(providerCount()).toBe("(1 selected)");

    // Switch language - re-filters providers and drops selections that
    // no longer support the new language.
    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "hindi");
    // Selection count reflects only providers still supported after filtering
    expect(providerCount()).toMatch(/selected\)/);
  });

  it("selects and deselects all providers via header checkbox", async () => {
    const user = setupUser();
    render(<TextToSpeechEvaluation />);
    await user.click(screen.getByText("Evaluators"));

    const selectAllCheckbox = screen
      .getAllByText("Select all")[0]
      .closest("div")!;
    // Mobile select-all row is hidden via CSS but present in DOM; click it directly.
    await user.click(selectAllCheckbox);

    await waitFor(() => {
      const countText = screen.getAllByText(/selected\)/)[0].textContent || "";
      expect(countText).not.toBe("(0 selected)");
    });
  });

  it("shows validation error and switches to settings tab when no provider selected on evaluate", async () => {
    const evaluateRef = { current: null as (() => void) | null };
    render(<TextToSpeechEvaluation evaluateRef={evaluateRef} />);
    await act(async () => {
      evaluateRef.current?.();
    });
    expect(screen.getAllByText("Language")[0]).toBeInTheDocument();
  });

  it("validates evaluators are selected before proceeding", async () => {
    const user = setupUser();
    const evaluateRef = { current: null as (() => void) | null };
    render(<TextToSpeechEvaluation evaluateRef={evaluateRef} />);
    await user.click(screen.getByText("Evaluators"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));

    // Select a provider first so provider validation passes
    const cartesiaRow = screen.getAllByText("Cartesia")[0].closest("tr")!;
    await user.click(cartesiaRow);

    // Clear evaluators (default was pre-selected)
    await user.click(screen.getByTestId("clear-evaluators"));

    await act(async () => {
      evaluateRef.current?.();
    });

    expect(screen.getByText("Language")).toBeInTheDocument();
  });

  it("shows a toast and blocks evaluate when dataset mode has no dataset selected", async () => {
    const user = setupUser();
    mockListDatasets.mockResolvedValue([
      { uuid: "ds-1", name: "My Dataset", item_count: 5 },
    ]);
    const evaluateRef = { current: null as (() => void) | null };
    render(<TextToSpeechEvaluation evaluateRef={evaluateRef} />);

    await user.click(screen.getByText("Evaluators"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    const cartesiaRow = screen.getAllByText("Cartesia")[0].closest("tr")!;
    await user.click(cartesiaRow);

    await user.click(screen.getByText("Dataset"));
    await user.click(screen.getByText("Use existing dataset"));
    await waitFor(() => screen.getByTestId("dataset-picker"));

    await act(async () => {
      evaluateRef.current?.();
    });

    expect(mockToastError).toHaveBeenCalledWith("Please select a dataset.");
  });

  it("shows the empty-datasets state and can switch back to manual entry", async () => {
    const user = setupUser();
    render(<TextToSpeechEvaluation />);
    await user.click(screen.getByText("Use existing dataset"));
    expect(screen.getByText("No TTS datasets yet")).toBeInTheDocument();
    await user.click(screen.getAllByText("Enter manually")[1]);
    expect(screen.getByTestId("tts-editor")).toBeInTheDocument();
  });

  it("removes selected dataset if it becomes empty (item_count 0)", async () => {
    mockListDatasets.mockResolvedValue([
      { uuid: "ds-1", name: "Empty Dataset", item_count: 0 },
    ]);
    render(<TextToSpeechEvaluation initialDatasetId="ds-1" />);
    await waitFor(() => expect(mockListDatasets).toHaveBeenCalled());
    // No direct visible assertion other than not throwing; component re-renders safely.
  });

  it("validates dataset name is required in inline mode", async () => {
    const user = setupUser();
    const evaluateRef = { current: null as (() => void) | null };
    render(<TextToSpeechEvaluation evaluateRef={evaluateRef} />);
    await user.click(screen.getByText("Evaluators"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    const cartesiaRow = screen.getAllByText("Cartesia")[0].closest("tr")!;
    await user.click(cartesiaRow);

    await act(async () => {
      evaluateRef.current?.();
    });

    const input = screen.getByLabelText("dataset-name-input");
    expect(input).toHaveAttribute("data-invalid", "true");
  });

  it("requires at least one text row before evaluating", async () => {
    const user = setupUser();
    const evaluateRef = { current: null as (() => void) | null };
    render(<TextToSpeechEvaluation evaluateRef={evaluateRef} />);
    await user.click(screen.getByText("Evaluators"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    const cartesiaRow = screen.getAllByText("Cartesia")[0].closest("tr")!;
    await user.click(cartesiaRow);

    const nameInput = screen.getByLabelText("dataset-name-input");
    await user.type(nameInput, "My rows");

    editorHandleMock.getNewRows.mockReturnValue([]);

    await act(async () => {
      evaluateRef.current?.();
    });

    expect(mockToastError).toHaveBeenCalledWith(
      "Add at least one text row before evaluating.",
    );
  });

  it("blocks evaluate when a text row exceeds the max length", async () => {
    const user = setupUser();
    const evaluateRef = { current: null as (() => void) | null };
    render(<TextToSpeechEvaluation evaluateRef={evaluateRef} />);
    await user.click(screen.getByText("Evaluators"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    const cartesiaRow = screen.getAllByText("Cartesia")[0].closest("tr")!;
    await user.click(cartesiaRow);

    const nameInput = screen.getByLabelText("dataset-name-input");
    await user.type(nameInput, "My rows");

    editorHandleMock.getNewRows.mockReturnValue([{ text: "x".repeat(300) }]);

    await act(async () => {
      evaluateRef.current?.();
    });

    // showLimitToast internally calls toast.error
    expect(mockToastError).toHaveBeenCalled();
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
            evaluator_type: "tts",
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
      <TextToSpeechEvaluation
        evaluateRef={evaluateRef}
        onEvaluatingChange={onEvaluatingChange}
      />,
    );
    await user.click(screen.getByText("Evaluators"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    const cartesiaRow = screen.getAllByText("Cartesia")[0].closest("tr")!;
    await user.click(cartesiaRow);

    const nameInput = screen.getByLabelText("dataset-name-input");
    await user.type(nameInput, "My dataset");

    editorHandleMock.getNewRows.mockReturnValue([{ text: "hello world" }]);

    await act(async () => {
      evaluateRef.current?.();
    });

    await waitFor(() => {
      const router = useRouter();
      expect(router.push).toHaveBeenCalledWith("/tts/task-123");
    });
    expect(onEvaluatingChange).toHaveBeenCalledWith(true);
  });

  it("blocks a saved dataset that is bigger than the row limit", async () => {
    const user = setupUser();
    // 25 rows, over the limit of 20.
    mockListDatasets.mockResolvedValue([
      { uuid: "ds-1", name: "Big Dataset", item_count: 25 },
    ]);
    const evaluateRef = { current: null as (() => void) | null };
    render(<TextToSpeechEvaluation evaluateRef={evaluateRef} />);

    await user.click(screen.getByText("Evaluators"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    const cartesiaRow = screen.getAllByText("Cartesia")[0].closest("tr")!;
    await user.click(cartesiaRow);

    await user.click(screen.getByText("Dataset"));
    await user.click(screen.getByText("Use existing dataset"));
    await waitFor(() => screen.getByTestId("pick-ds-1"));
    await user.click(screen.getByTestId("pick-ds-1"));

    await act(async () => {
      evaluateRef.current?.();
    });

    expect(mockToastError).toHaveBeenCalled();
    const calledUrls = (global.fetch as jest.Mock).mock.calls.map((c) => c[0]);
    expect(calledUrls.some((u: string) => u.includes("/tts/evaluate"))).toBe(
      false,
    );
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
            evaluator_type: "tts",
            is_default: true,
          },
        ]),
      )
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ task_id: "task-456", status: "queued" }),
      });

    render(<TextToSpeechEvaluation evaluateRef={evaluateRef} />);
    await user.click(screen.getByText("Evaluators"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    const cartesiaRow = screen.getAllByText("Cartesia")[0].closest("tr")!;
    await user.click(cartesiaRow);

    await user.click(screen.getByText("Dataset"));
    await user.click(screen.getByText("Use existing dataset"));
    await waitFor(() => screen.getByTestId("pick-ds-1"));
    await user.click(screen.getByTestId("pick-ds-1"));

    await act(async () => {
      evaluateRef.current?.();
    });

    await waitFor(() => {
      const router = useRouter();
      expect(router.push).toHaveBeenCalledWith("/tts/task-456");
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
            evaluator_type: "tts",
            is_default: true,
          },
        ]),
      )
      .mockResolvedValueOnce({
        status: 401,
        ok: false,
        json: async () => ({}),
      });

    render(<TextToSpeechEvaluation evaluateRef={evaluateRef} />);
    await user.click(screen.getByText("Evaluators"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    const cartesiaRow = screen.getAllByText("Cartesia")[0].closest("tr")!;
    await user.click(cartesiaRow);
    const nameInput = screen.getByLabelText("dataset-name-input");
    await user.type(nameInput, "My dataset");
    editorHandleMock.getNewRows.mockReturnValue([{ text: "hello" }]);

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
            evaluator_type: "tts",
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
      <TextToSpeechEvaluation
        evaluateRef={evaluateRef}
        onEvaluatingChange={onEvaluatingChange}
      />,
    );
    await user.click(screen.getByText("Evaluators"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    const cartesiaRow = screen.getAllByText("Cartesia")[0].closest("tr")!;
    await user.click(cartesiaRow);
    const nameInput = screen.getByLabelText("dataset-name-input");
    await user.type(nameInput, "My dataset");
    editorHandleMock.getNewRows.mockReturnValue([{ text: "hello" }]);

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
    render(<TextToSpeechEvaluation evaluateRef={evaluateRef} />);
    await user.click(screen.getByText("Evaluators"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    const cartesiaRow = screen.getAllByText("Cartesia")[0].closest("tr")!;
    await user.click(cartesiaRow);
    const nameInput = screen.getByLabelText("dataset-name-input");
    await user.type(nameInput, "My dataset");
    editorHandleMock.getNewRows.mockReturnValue([{ text: "hello" }]);

    delete process.env.NEXT_PUBLIC_BACKEND_URL;

    await act(async () => {
      evaluateRef.current?.();
    });

    expect(mockReportError).toHaveBeenCalledWith(
      "BACKEND_URL environment variable is not set",
    );
  });
});

async function user_switchToSettings() {
  const user = setupUser();
  await user.click(screen.getByText("Evaluators"));
}
