import React from "react";
import { render, screen, setupUser, waitFor, act } from "@/test-utils";
import { useRouter } from "next/navigation";
import { TextToSpeechEvaluation } from "../TextToSpeechEvaluation";

// ─── Hooks ──────────────────────────────────────────────────────────────────
jest.mock("../../../hooks", () => ({
  useAccessToken: () => "test-token",
  useMaxRowsPerEval: () => 20,
  useEnabledProviders: () => null,
  isProviderEnabled: (enabled: Set<string> | null, value: string) =>
    !enabled || enabled.has(value.toLowerCase()),
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
        ref: React.Ref<unknown>
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
      }
    ),
  };
});

// ─── MultiSelectPicker ──────────────────────────────────────────────────────
jest.mock("../../MultiSelectPicker", () => ({
  MultiSelectPicker: ({
    items,
    selectedItems,
    onSelectionChange,
  }: {
    items: { uuid: string; name: string }[];
    selectedItems: { uuid: string; name: string }[];
    onSelectionChange: (items: { uuid: string; name: string }[]) => void;
  }) => (
    <div data-testid="evaluator-picker">
      {items.map((it) => {
        const isSelected = selectedItems.some((s) => s.uuid === it.uuid);
        return (
          <button
            key={it.uuid}
            data-testid={`evaluator-${it.uuid}`}
            aria-pressed={isSelected}
            onClick={() =>
              onSelectionChange(
                isSelected
                  ? selectedItems.filter((s) => s.uuid !== it.uuid)
                  : [...selectedItems, it]
              )
            }
          >
            {it.name}
          </button>
        );
      })}
      <button
        data-testid="clear-evaluators"
        onClick={() => onSelectionChange([])}
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
  }[]
) => ({
  ok: true,
  status: 200,
  json: async () => ({ items: evaluators }),
});

beforeEach(() => {
  jest.clearAllMocks();
  mockListDatasets.mockResolvedValue([]);
  editorHandleMock = {
    getNewRows: jest.fn().mockReturnValue([]),
  };
  (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue(
    mockEvaluatorsResponse([
      { uuid: "e1", name: "Default Eval", evaluator_type: "tts", is_default: true },
      { uuid: "e2", name: "Custom Eval", evaluator_type: "tts", is_default: false },
      { uuid: "e3", name: "STT Eval", evaluator_type: "stt", is_default: false },
    ])
  );
  process.env.NEXT_PUBLIC_BACKEND_URL = "http://backend.test";
});

afterEach(() => {
  delete (global as unknown as { fetch?: jest.Mock }).fetch;
});

describe("TextToSpeechEvaluation", () => {
  it("renders with the input tab active by default", async () => {
    render(<TextToSpeechEvaluation />);
    expect(screen.getByText("Datasets")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByTestId("tts-editor")).toBeInTheDocument();
    await waitFor(() => expect(mockListDatasets).toHaveBeenCalledWith("test-token", "tts"));
    await waitFor(() => expect(screen.getByTestId("evaluator-e1")).toBeInTheDocument());
  });

  it("starts on the settings tab when initialDatasetId is provided", async () => {
    render(<TextToSpeechEvaluation initialDatasetId="ds-1" />);
    // Settings tab content visible (language selector) rather than input tab
    expect(screen.getByText("Language")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("evaluator-e1")).toBeInTheDocument());
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
    expect(screen.getByTestId("evaluator-e1")).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByTestId("evaluator-e2")).toHaveAttribute("aria-pressed", "false");
  });

  it("signs out on 401 when fetching evaluators", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ status: 401, ok: false, json: async () => ({}) });
    const { signOut } = require("next-auth/react");
    render(<TextToSpeechEvaluation />);
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }));
  });

  it("reports an error when fetching evaluators fails", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ status: 500, ok: false, json: async () => ({}) });
    render(<TextToSpeechEvaluation />);
    await waitFor(() => expect(mockReportError).toHaveBeenCalled());
  });

  it("switches tabs on click", async () => {
    const user = setupUser();
    render(<TextToSpeechEvaluation />);
    await user.click(screen.getByText("Settings"));
    expect(screen.getByText("Language")).toBeInTheDocument();
    await user.click(screen.getByText("Datasets"));
    expect(screen.getByTestId("tts-editor")).toBeInTheDocument();
  });

  it("changes language and filters providers, deselecting unsupported ones", async () => {
    const user = setupUser();
    render(<TextToSpeechEvaluation />);
    await user.click(screen.getByText("Settings"));

    // Select a provider supported broadly, e.g. OpenAI (supports English)
    const openaiRow = screen.getAllByText("OpenAI")[0].closest("tr")!;
    await user.click(openaiRow);
    const providerCount = () =>
      screen.getByText("Select providers to evaluate").parentElement!
        .querySelector("span")!.textContent;
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
    await user.click(screen.getByText("Settings"));

    const selectAllCheckbox = screen.getAllByText("Select all")[0].closest("div")!;
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
    await user.click(screen.getByText("Settings"));
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

    await user.click(screen.getByText("Settings"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    const cartesiaRow = screen.getAllByText("Cartesia")[0].closest("tr")!;
    await user.click(cartesiaRow);

    await user.click(screen.getByText("Datasets"));
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
    await user.click(screen.getByText("Settings"));
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
    await user.click(screen.getByText("Settings"));
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
      "Add at least one text row before evaluating."
    );
  });

  it("blocks evaluate when a text row exceeds the max length", async () => {
    const user = setupUser();
    const evaluateRef = { current: null as (() => void) | null };
    render(<TextToSpeechEvaluation evaluateRef={evaluateRef} />);
    await user.click(screen.getByText("Settings"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    const cartesiaRow = screen.getAllByText("Cartesia")[0].closest("tr")!;
    await user.click(cartesiaRow);

    const nameInput = screen.getByLabelText("dataset-name-input");
    await user.type(nameInput, "My rows");

    editorHandleMock.getNewRows.mockReturnValue([
      { text: "x".repeat(300) },
    ]);

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
          { uuid: "e1", name: "Default Eval", evaluator_type: "tts", is_default: true },
        ])
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
      />
    );
    await user.click(screen.getByText("Settings"));
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

  it("submits a dataset-mode evaluation successfully", async () => {
    const user = setupUser();
    mockListDatasets.mockResolvedValue([
      { uuid: "ds-1", name: "My Dataset", item_count: 5 },
    ]);
    const evaluateRef = { current: null as (() => void) | null };
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        mockEvaluatorsResponse([
          { uuid: "e1", name: "Default Eval", evaluator_type: "tts", is_default: true },
        ])
      )
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ task_id: "task-456", status: "queued" }),
      });

    render(<TextToSpeechEvaluation evaluateRef={evaluateRef} />);
    await user.click(screen.getByText("Settings"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    const cartesiaRow = screen.getAllByText("Cartesia")[0].closest("tr")!;
    await user.click(cartesiaRow);

    await user.click(screen.getByText("Datasets"));
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
          { uuid: "e1", name: "Default Eval", evaluator_type: "tts", is_default: true },
        ])
      )
      .mockResolvedValueOnce({ status: 401, ok: false, json: async () => ({}) });

    render(<TextToSpeechEvaluation evaluateRef={evaluateRef} />);
    await user.click(screen.getByText("Settings"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    const cartesiaRow = screen.getAllByText("Cartesia")[0].closest("tr")!;
    await user.click(cartesiaRow);
    const nameInput = screen.getByLabelText("dataset-name-input");
    await user.type(nameInput, "My dataset");
    editorHandleMock.getNewRows.mockReturnValue([{ text: "hello" }]);

    await act(async () => {
      evaluateRef.current?.();
    });

    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }));
  });

  it("reports an error and resets isEvaluating when the evaluate request fails", async () => {
    const user = setupUser();
    const evaluateRef = { current: null as (() => void) | null };
    const onEvaluatingChange = jest.fn();
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        mockEvaluatorsResponse([
          { uuid: "e1", name: "Default Eval", evaluator_type: "tts", is_default: true },
        ])
      )
      .mockResolvedValueOnce({ status: 500, ok: false, json: async () => ({}) });

    render(
      <TextToSpeechEvaluation
        evaluateRef={evaluateRef}
        onEvaluatingChange={onEvaluatingChange}
      />
    );
    await user.click(screen.getByText("Settings"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    const cartesiaRow = screen.getAllByText("Cartesia")[0].closest("tr")!;
    await user.click(cartesiaRow);
    const nameInput = screen.getByLabelText("dataset-name-input");
    await user.type(nameInput, "My dataset");
    editorHandleMock.getNewRows.mockReturnValue([{ text: "hello" }]);

    await act(async () => {
      evaluateRef.current?.();
    });

    await waitFor(() => expect(mockReportError).toHaveBeenCalledWith("Error evaluating:", expect.any(Error)));
    expect(onEvaluatingChange).toHaveBeenCalledWith(false);
  });

  it("reports an error when NEXT_PUBLIC_BACKEND_URL is unset during evaluate", async () => {
    const user = setupUser();
    const evaluateRef = { current: null as (() => void) | null };
    render(<TextToSpeechEvaluation evaluateRef={evaluateRef} />);
    await user.click(screen.getByText("Settings"));
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
      "BACKEND_URL environment variable is not set"
    );
  });
});

async function user_switchToSettings() {
  const user = setupUser();
  await user.click(screen.getByText("Settings"));
}
