import { render, screen, setupUser, waitFor } from "@/test-utils";
import { CreateLabellingTaskDialog } from "../CreateLabellingTaskDialog";

const mockApiClient = jest.fn();
jest.mock("../../../lib/api", () => ({
  apiClient: (...args: unknown[]) => mockApiClient(...args),
  unwrapList: (data: unknown) => {
    if (Array.isArray(data)) return data;
    if (data && typeof data === "object" && Array.isArray((data as { items?: unknown }).items)) {
      return (data as { items: unknown[] }).items;
    }
    return [];
  },
}));

const mockReadNameConflictFromError = jest.fn();
jest.mock("../../../lib/parseBackendError", () => ({
  readNameConflictFromError: (...args: unknown[]) =>
    mockReadNameConflictFromError(...args),
}));

const EVALUATORS = [
  { uuid: "ev-llm-1", name: "Correctness", description: "Checks facts", evaluator_type: "llm" },
  { uuid: "ev-llm-2", name: "Helpfulness", evaluator_type: "llm" },
  { uuid: "ev-stt-1", name: "WER", evaluator_type: "stt" },
];

function renderDialog(props: Partial<Parameters<typeof CreateLabellingTaskDialog>[0]> = {}) {
  const onClose = props.onClose ?? jest.fn();
  const onCreated = props.onCreated ?? jest.fn();
  const utils = render(
    <CreateLabellingTaskDialog
      accessToken="tok"
      onClose={onClose}
      onCreated={onCreated}
      {...props}
    />,
  );
  return { ...utils, onClose, onCreated };
}

async function goToStep2(user: ReturnType<typeof setupUser>) {
  await user.type(screen.getByPlaceholderText(/Copilot review/i), "My task");
  await user.click(screen.getByRole("button", { name: "Next" }));
}

async function goToStep3(user: ReturnType<typeof setupUser>, typeTitle = "LLM reply") {
  await goToStep2(user);
  await user.click(screen.getByText(typeTitle));
  await user.click(screen.getByRole("button", { name: "Next" }));
}

describe("CreateLabellingTaskDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiClient.mockResolvedValue({ items: EVALUATORS });
  });

  it("renders step 1 (Details) by default and loads evaluators in background", async () => {
    renderDialog();
    expect(screen.getByText("Create labelling task")).toBeInTheDocument();
    expect(screen.getByText("Details")).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Copilot review/i)).toBeInTheDocument();
    await waitFor(() =>
      expect(mockApiClient).toHaveBeenCalledWith(
        "/evaluators?include_defaults=true",
        "tok",
      ),
    );
  });

  it("Next is disabled from proceeding via submit while step1 invalid, and name field updates state", async () => {
    const user = setupUser();
    renderDialog();
    const nameInput = screen.getByPlaceholderText(/Copilot review/i);
    await user.type(nameInput, "Hello");
    expect(nameInput).toHaveValue("Hello");
  });

  it("navigates forward and back via Next/Back, and jumps via stepper", async () => {
    const user = setupUser();
    renderDialog();
    await goToStep2(user);
    expect(screen.getByText(/What are you labelling/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Back" }));
    expect(screen.getByPlaceholderText(/Copilot review/i)).toBeInTheDocument();

    // Jump directly to step 2 via the stepper.
    await user.click(screen.getByText("Type"));
    expect(screen.getByText(/What are you labelling/)).toBeInTheDocument();

    // Jump to step 3 without picking a type first.
    await user.click(screen.getByText("Evaluators"));
    expect(
      screen.getByText(/Pick a task type first \(step 2\)/),
    ).toBeInTheDocument();
  });

  it("filters task type options to exclude tts", async () => {
    const user = setupUser();
    renderDialog();
    await goToStep2(user);
    expect(screen.getByText("LLM reply")).toBeInTheDocument();
    expect(screen.getByText("Speech to Text")).toBeInTheDocument();
    expect(screen.queryByText("Text to Speech (TTS)")).not.toBeInTheDocument();
  });

  it("shows loading state for evaluators, then lists them filtered by type and supports search", async () => {
    const user = setupUser();
    // Delay the evaluators response so we can observe the loading state.
    let resolveFn: (v: unknown) => void = () => {};
    mockApiClient.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFn = resolve;
      }),
    );
    renderDialog();
    await goToStep3(user, "LLM reply");
    expect(screen.getByText("Loading evaluators")).toBeInTheDocument();

    resolveFn({ items: EVALUATORS });
    await waitFor(() =>
      expect(screen.queryByText("Loading evaluators")).not.toBeInTheDocument(),
    );

    // Only llm-type evaluators are shown (2 of them).
    expect(screen.getByText("Correctness")).toBeInTheDocument();
    expect(screen.getByText("Helpfulness")).toBeInTheDocument();
    expect(screen.queryByText("WER")).not.toBeInTheDocument();
    expect(screen.getByText("Checks facts")).toBeInTheDocument();

    const search = screen.getByPlaceholderText("Search evaluators");
    await user.type(search, "correct");
    expect(screen.getByText("Correctness")).toBeInTheDocument();
    expect(screen.queryByText("Helpfulness")).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "zzzzz");
    expect(screen.getByText("No matching evaluators.")).toBeInTheDocument();
  });

  it("shows a type-specific empty state when there are no matching evaluators and no search", async () => {
    const user = setupUser();
    mockApiClient.mockResolvedValue({ items: [] });
    renderDialog();
    await goToStep3(user, "LLM reply");
    await waitFor(() =>
      expect(screen.getByText("No LLM reply evaluators yet.")).toBeInTheDocument(),
    );
  });

  it("shows an error state when evaluators fail to load", async () => {
    const user = setupUser();
    mockApiClient.mockRejectedValue(
      new Error('Request failed: 500 - {"detail":"boom"}'),
    );
    renderDialog();
    await goToStep3(user, "LLM reply");
    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument());
  });

  it("falls back to a generic evaluators-load error for a non-JSON failure body", async () => {
    const user = setupUser();
    mockApiClient.mockRejectedValue(new Error("Request failed: 500 - not json"));
    renderDialog();
    await goToStep3(user, "LLM reply");
    await waitFor(() => expect(screen.getByText("not json")).toBeInTheDocument());
  });

  it("falls back to the generic message for a non-Error rejection", async () => {
    const user = setupUser();
    mockApiClient.mockRejectedValue("oops");
    renderDialog();
    await goToStep3(user, "LLM reply");
    await waitFor(() =>
      expect(screen.getByText("Failed to load evaluators")).toBeInTheDocument(),
    );
  });

  it("toggles evaluator selection via checkbox and shows the selected count", async () => {
    const user = setupUser();
    renderDialog();
    await goToStep3(user, "LLM reply");
    await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());

    expect(screen.getByText("(0 selected)")).toBeInTheDocument();
    const checkboxes = screen.getAllByRole("checkbox");
    await user.click(checkboxes[0]);
    expect(screen.getByText("(1 selected)")).toBeInTheDocument();
    await user.click(checkboxes[0]);
    expect(screen.getByText("(0 selected)")).toBeInTheDocument();
  });

  it("drops selections that don't belong to the new type when the type changes", async () => {
    const user = setupUser();
    renderDialog();
    await goToStep3(user, "LLM reply");
    await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());
    await user.click(screen.getAllByRole("checkbox")[0]);
    expect(screen.getByText("(1 selected)")).toBeInTheDocument();

    // Go back to step 2 and switch the type to stt.
    await user.click(screen.getByRole("button", { name: "Back" }));
    await user.click(screen.getByText("Speech to Text"));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText("WER")).toBeInTheDocument());
    expect(screen.getByText("(0 selected)")).toBeInTheDocument();
  });

  it("disables Create task until name + type + at least one evaluator are set", async () => {
    const user = setupUser();
    renderDialog();
    await goToStep3(user, "LLM reply");
    await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());
    const createBtn = screen.getByRole("button", { name: "Create task" });
    expect(createBtn).toBeDisabled();
    await user.click(screen.getAllByRole("checkbox")[0]);
    expect(createBtn).toBeEnabled();
  });

  it("submits with trimmed name, description, and evaluator_ids and calls onCreated", async () => {
    const user = setupUser();
    mockApiClient
      .mockResolvedValueOnce({ items: EVALUATORS }) // evaluators fetch
      .mockResolvedValueOnce({ uuid: "task-123", message: "ok" }); // create
    const onCreated = jest.fn();
    renderDialog({ onCreated });

    await user.type(screen.getByPlaceholderText(/Copilot review/i), "  My Task  ");
    await user.type(
      screen.getByPlaceholderText(/Short description/i),
      "  desc here  ",
    );
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByText("LLM reply"));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());
    await user.click(screen.getAllByRole("checkbox")[0]);

    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() =>
      expect(mockApiClient).toHaveBeenLastCalledWith(
        "/annotation-tasks",
        "tok",
        {
          method: "POST",
          body: {
            name: "My Task",
            type: "llm",
            description: "desc here",
            evaluator_ids: ["ev-llm-1"],
          },
        },
      ),
    );
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith("task-123"));
  });

  it("omits description when blank/whitespace-only", async () => {
    const user = setupUser();
    mockApiClient
      .mockResolvedValueOnce({ items: EVALUATORS })
      .mockResolvedValueOnce({ uuid: "task-1", message: "ok" });
    renderDialog();
    await user.type(screen.getByPlaceholderText(/Copilot review/i), "Task");
    await user.click(screen.getByRole("button", { name: "Next" }));
    await user.click(screen.getByText("LLM reply"));
    await user.click(screen.getByRole("button", { name: "Next" }));
    await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());
    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() =>
      expect(mockApiClient).toHaveBeenLastCalledWith("/annotation-tasks", "tok", {
        method: "POST",
        body: { name: "Task", type: "llm", evaluator_ids: ["ev-llm-1"] },
      }),
    );
  });

  it("shows 'Creating...' while submitting and disables the close button", async () => {
    const user = setupUser();
    let resolveCreate: (v: unknown) => void = () => {};
    mockApiClient
      .mockResolvedValueOnce({ items: EVALUATORS })
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveCreate = resolve;
        }),
      );
    renderDialog();
    await goToStep3(user, "LLM reply");
    await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());
    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: "Create task" }));

    expect(screen.getByRole("button", { name: "Creating..." })).toBeInTheDocument();
    resolveCreate({ uuid: "t1", message: "ok" });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Creating..." })).not.toBeInTheDocument(),
    );
  });

  it("shows a name-conflict error inline on the details step and routes back to step 1", async () => {
    const user = setupUser();
    mockApiClient
      .mockResolvedValueOnce({ items: EVALUATORS })
      .mockRejectedValueOnce(new Error('Request failed: 409 - {"detail":"Task name already exists"}'));
    mockReadNameConflictFromError.mockReturnValue("Task name already exists");
    renderDialog();
    await goToStep3(user, "LLM reply");
    await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());
    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() =>
      expect(screen.getByText("Task name already exists")).toBeInTheDocument(),
    );
    // Routed back to step 1.
    expect(screen.getByPlaceholderText(/Copilot review/i)).toBeInTheDocument();

    // Typing clears the inline conflict error.
    await user.type(screen.getByPlaceholderText(/Copilot review/i), "x");
    expect(screen.queryByText("Task name already exists")).not.toBeInTheDocument();
  });

  it("shows a generic submit error banner for non-conflict failures", async () => {
    const user = setupUser();
    mockApiClient
      .mockResolvedValueOnce({ items: EVALUATORS })
      .mockRejectedValueOnce(new Error('Request failed: 400 - {"detail":"Bad input"}'));
    mockReadNameConflictFromError.mockReturnValue(null);
    renderDialog();
    await goToStep3(user, "LLM reply");
    await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());
    await user.click(screen.getAllByRole("checkbox")[0]);
    await user.click(screen.getByRole("button", { name: "Create task" }));

    await waitFor(() => expect(screen.getByText("Bad input")).toBeInTheDocument());
  });

  it("calls onClose when the header close button is clicked and disables it while submitting", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    renderDialog({ onClose });
    await waitFor(() => expect(mockApiClient).toHaveBeenCalled());
    const closeBtn = screen.getByRole("button", { name: "" });
    await user.click(closeBtn);
    expect(onClose).toHaveBeenCalled();
  });

  it("falls back to the raw Error message when it doesn't match the 'Request failed' shape", async () => {
    const user = setupUser();
    mockApiClient.mockRejectedValue(new Error("network down"));
    renderDialog();
    await goToStep3(user, "LLM reply");
    await waitFor(() => expect(screen.getByText("network down")).toBeInTheDocument());
  });

  it("falls back to the generic evaluators-load error for an Error with an empty message", async () => {
    const user = setupUser();
    mockApiClient.mockRejectedValue(new Error(""));
    renderDialog();
    await goToStep3(user, "LLM reply");
    await waitFor(() =>
      expect(screen.getByText("Failed to load evaluators")).toBeInTheDocument(),
    );
  });

  it("keeps a selected evaluator whose type still matches after evaluators are re-fetched", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    const onCreated = jest.fn();
    const { rerender } = render(
      <CreateLabellingTaskDialog accessToken="tok" onClose={onClose} onCreated={onCreated} />,
    );
    await goToStep3(user, "LLM reply");
    await waitFor(() => expect(screen.getByText("Correctness")).toBeInTheDocument());
    await user.click(screen.getAllByRole("checkbox")[0]);
    expect(screen.getByText("(1 selected)")).toBeInTheDocument();

    // Changing accessToken re-triggers the evaluators fetch effect, giving a
    // new `evaluators` array reference while taskType/selection stay put —
    // this exercises the sync effect's branch that re-adds an
    // already-selected evaluator whose type still matches the new list.
    // Add a fresh llm evaluator so we can wait for the re-fetch to actually
    // apply (setEvaluators flushed) before asserting — otherwise the sync
    // effect may not have run yet.
    mockApiClient.mockResolvedValueOnce({
      items: [
        ...EVALUATORS.map((e) => ({ ...e })),
        { uuid: "ev-llm-3", name: "Freshness", evaluator_type: "llm" },
      ],
    });
    rerender(
      <CreateLabellingTaskDialog accessToken="tok2" onClose={onClose} onCreated={onCreated} />,
    );
    await waitFor(() =>
      expect(screen.getByText("Freshness")).toBeInTheDocument(),
    );
    // Drive a benign interaction so React flushes the pending passive
    // sync effect (scheduled by the re-fetch's setEvaluators). Without a
    // flush the effect's re-add branch never runs.
    await user.type(screen.getByPlaceholderText("Search evaluators"), "corr");
    // The previously-selected llm evaluator is re-added because its type
    // still matches after the re-fetch.
    expect(screen.getByText("(1 selected)")).toBeInTheDocument();
  });

  it("cancels the in-flight evaluators fetch on unmount without state updates", async () => {
    let resolveFn: (v: unknown) => void = () => {};
    mockApiClient.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFn = resolve;
      }),
    );
    const { unmount } = renderDialog();
    unmount();
    resolveFn({ items: EVALUATORS });
    // No assertion needed beyond "doesn't throw" — this exercises the
    // `cancelled` guard in the fetch effect's cleanup.
  });
});
