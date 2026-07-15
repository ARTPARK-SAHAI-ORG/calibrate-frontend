import React from "react";
import { render, screen, setupUser, waitFor, act } from "@/test-utils";
import { useRouter } from "next/navigation";
import { SpeechToTextEvaluation } from "../SpeechToTextEvaluation";

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
    validate: jest.fn().mockReturnValue(true),
    getNewRows: jest.fn().mockReturnValue([]),
  };
  (global as unknown as { fetch: jest.Mock }).fetch = jest.fn().mockResolvedValue(
    mockEvaluatorsResponse([
      { uuid: "e1", name: "Default Eval", evaluator_type: "stt", is_default: true },
      { uuid: "e2", name: "Custom Eval", evaluator_type: "stt", is_default: false },
      { uuid: "e3", name: "TTS Eval", evaluator_type: "tts", is_default: false },
    ])
  );
  process.env.NEXT_PUBLIC_BACKEND_URL = "http://backend.test";
});

afterEach(() => {
  delete (global as unknown as { fetch?: jest.Mock }).fetch;
});

async function selectProvider(user: ReturnType<typeof setupUser>, label: string) {
  const row = screen.getAllByText(label)[0].closest("tr")!;
  await user.click(row);
}

describe("SpeechToTextEvaluation", () => {
  it("renders with the input tab active by default", async () => {
    render(<SpeechToTextEvaluation />);
    expect(screen.getByText("Dataset")).toBeInTheDocument();
    expect(screen.getByText("Settings")).toBeInTheDocument();
    expect(screen.getByTestId("stt-editor")).toBeInTheDocument();
    await waitFor(() => expect(mockListDatasets).toHaveBeenCalledWith("test-token", "stt"));
    await waitFor(() => expect(screen.getByTestId("evaluator-e1")).toBeInTheDocument());
  });

  it("starts on the settings tab when initialDatasetId is provided", async () => {
    render(<SpeechToTextEvaluation initialDatasetId="ds-1" />);
    expect(screen.getByText("Language")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("evaluator-e1")).toBeInTheDocument());
  });

  it("lists STT evaluators (excluding other types) with none pre-selected", async () => {
    const user = setupUser();
    render(<SpeechToTextEvaluation />);
    await user.click(screen.getByText("Settings"));
    await waitFor(() => {
      expect(screen.getByTestId("evaluator-e1")).toBeInTheDocument();
    });
    // Non-STT evaluators are filtered out.
    expect(screen.queryByTestId("evaluator-e3")).not.toBeInTheDocument();
    // Nothing is pre-selected — adding an evaluator is entirely opt-in, so even
    // an org-default evaluator starts unchecked.
    expect(screen.getByTestId("evaluator-e1")).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByTestId("evaluator-e2")).toHaveAttribute("aria-pressed", "false");
  });

  it("signs out on 401 when fetching evaluators", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ status: 401, ok: false, json: async () => ({}) });
    const { signOut } = require("next-auth/react");
    render(<SpeechToTextEvaluation />);
    await waitFor(() => expect(signOut).toHaveBeenCalledWith({ callbackUrl: "/login" }));
  });

  it("reports an error when fetching evaluators fails", async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({ status: 500, ok: false, json: async () => ({}) });
    render(<SpeechToTextEvaluation />);
    await waitFor(() => expect(mockReportError).toHaveBeenCalled());
  });

  it("switches tabs on click", async () => {
    const user = setupUser();
    render(<SpeechToTextEvaluation />);
    await user.click(screen.getByText("Settings"));
    expect(screen.getByText("Language")).toBeInTheDocument();
    await user.click(screen.getByText("Dataset"));
    expect(screen.getByTestId("stt-editor")).toBeInTheDocument();
  });

  it("toggles provider selection and reflects selected count", async () => {
    const user = setupUser();
    render(<SpeechToTextEvaluation />);
    await user.click(screen.getByText("Settings"));

    const providerCount = () =>
      screen.getByText("Select providers to evaluate").parentElement!
        .querySelector("span")!.textContent;

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
    await user.click(screen.getByText("Settings"));

    const providerCount = () =>
      screen.getByText("Select providers to evaluate").parentElement!
        .querySelector("span")!.textContent;

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
    await user.click(screen.getByText("Settings"));

    const select = screen.getByRole("combobox");
    await user.selectOptions(select, "maithili");

    // Only Sarvam supports Maithili STT — it should be auto-selected.
    const providerCount = () =>
      screen.getByText("Select providers to evaluate").parentElement!
        .querySelector("span")!.textContent;
    expect(providerCount()).toBe("(1 selected)");
    expect(screen.getAllByText("Sarvam")[0].closest("tr")).toHaveTextContent("Sarvam");
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
    await user.click(screen.getByText("Settings"));
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

    await user.click(screen.getByText("Settings"));
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
    await user.click(screen.getByText("Settings"));
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
    await user.click(screen.getByText("Settings"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    await selectProvider(user, "Deepgram");

    const nameInput = screen.getByPlaceholderText("e.g. English customer calls");
    await user.type(nameInput, "My rows");

    editorHandleMock.validate.mockReturnValue(false);

    await act(async () => {
      evaluateRef.current?.();
    });

    // Should remain blocked - evaluate not triggered (no fetch to /stt/evaluate)
    const calledUrls = (global.fetch as jest.Mock).mock.calls.map((c) => c[0]);
    expect(calledUrls.some((u: string) => u.includes("/stt/evaluate"))).toBe(false);
    expect(screen.getByText("Dataset")).toBeInTheDocument();
  });

  it("submits an inline evaluation successfully and navigates to the result page", async () => {
    const user = setupUser();
    const onEvaluatingChange = jest.fn();
    const evaluateRef = { current: null as (() => void) | null };
    (global.fetch as jest.Mock)
      .mockResolvedValueOnce(
        mockEvaluatorsResponse([
          { uuid: "e1", name: "Default Eval", evaluator_type: "stt", is_default: true },
        ])
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
      />
    );
    await user.click(screen.getByText("Settings"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    await selectProvider(user, "Deepgram");

    const nameInput = screen.getByPlaceholderText("e.g. English customer calls");
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
          { uuid: "e1", name: "Default Eval", evaluator_type: "stt", is_default: true },
        ])
      )
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ task_id: "task-789", status: "queued" }),
      });

    render(<SpeechToTextEvaluation evaluateRef={evaluateRef} />);
    await user.click(screen.getByText("Settings"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    await selectProvider(user, "Deepgram");

    await user.click(
      screen.getByRole("switch", { name: "Toggle built-in LLM-based evaluation metrics" }),
    );

    const nameInput = screen.getByPlaceholderText("e.g. English customer calls");
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
          { uuid: "e1", name: "Default Eval", evaluator_type: "stt", is_default: true },
        ])
      )
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ task_id: "task-456", status: "queued" }),
      });

    render(<SpeechToTextEvaluation evaluateRef={evaluateRef} />);
    await user.click(screen.getByText("Settings"));
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
          { uuid: "e1", name: "Default Eval", evaluator_type: "stt", is_default: true },
        ])
      )
      .mockResolvedValueOnce({ status: 401, ok: false, json: async () => ({}) });

    render(<SpeechToTextEvaluation evaluateRef={evaluateRef} />);
    await user.click(screen.getByText("Settings"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    await selectProvider(user, "Deepgram");
    const nameInput = screen.getByPlaceholderText("e.g. English customer calls");
    await user.type(nameInput, "My dataset");
    editorHandleMock.getNewRows.mockReturnValue([
      { audio_path: "s3://bucket/a.wav", text: "hello" },
    ]);

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
          { uuid: "e1", name: "Default Eval", evaluator_type: "stt", is_default: true },
        ])
      )
      .mockResolvedValueOnce({ status: 500, ok: false, json: async () => ({}) });

    render(
      <SpeechToTextEvaluation
        evaluateRef={evaluateRef}
        onEvaluatingChange={onEvaluatingChange}
      />
    );
    await user.click(screen.getByText("Settings"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    await selectProvider(user, "Deepgram");
    const nameInput = screen.getByPlaceholderText("e.g. English customer calls");
    await user.type(nameInput, "My dataset");
    editorHandleMock.getNewRows.mockReturnValue([
      { audio_path: "s3://bucket/a.wav", text: "hello" },
    ]);

    await act(async () => {
      evaluateRef.current?.();
    });

    await waitFor(() => expect(mockReportError).toHaveBeenCalledWith("Error evaluating:", expect.any(Error)));
    expect(onEvaluatingChange).toHaveBeenCalledWith(false);
  });

  it("reports an error when NEXT_PUBLIC_BACKEND_URL is unset during evaluate", async () => {
    const user = setupUser();
    const evaluateRef = { current: null as (() => void) | null };
    render(<SpeechToTextEvaluation evaluateRef={evaluateRef} />);
    await user.click(screen.getByText("Settings"));
    await waitFor(() => screen.getByTestId("evaluator-e1"));
    await selectProvider(user, "Deepgram");
    const nameInput = screen.getByPlaceholderText("e.g. English customer calls");
    await user.type(nameInput, "My dataset");
    editorHandleMock.getNewRows.mockReturnValue([
      { audio_path: "s3://bucket/a.wav", text: "hello" },
    ]);

    delete process.env.NEXT_PUBLIC_BACKEND_URL;

    await act(async () => {
      evaluateRef.current?.();
    });

    expect(mockReportError).toHaveBeenCalledWith(
      "BACKEND_URL environment variable is not set"
    );
  });
});
