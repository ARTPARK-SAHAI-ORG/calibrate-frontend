import { fireEvent } from "@testing-library/react";
import { render, screen, setupUser, waitFor } from "@/test-utils";
import { ManageEvaluatorsDialog } from "../ManageEvaluatorsDialog";

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

const EVALUATORS = [
  { uuid: "ev-1", name: "Correctness", description: "Checks facts", evaluator_type: "llm" },
  { uuid: "ev-2", name: "Helpfulness", evaluator_type: "llm" },
  { uuid: "ev-3", name: "Tone", evaluator_type: "llm" },
  { uuid: "ev-4", name: "WER", evaluator_type: "stt" },
];

function renderDialog(
  props: Partial<Parameters<typeof ManageEvaluatorsDialog>[0]> = {},
) {
  const onClose = props.onClose ?? jest.fn();
  const onSaved = props.onSaved ?? jest.fn();
  const utils = render(
    <ManageEvaluatorsDialog
      accessToken="tok"
      taskUuid="task-1"
      currentEvaluatorIds={["ev-1", "ev-2"]}
      onClose={onClose}
      onSaved={onSaved}
      {...props}
    />,
  );
  return { ...utils, onClose, onSaved };
}

// Names appear both in the left catalogue (inside a <label>) and, when
// selected, in the right ordered column (a plain <div>). Scope to the left
// catalogue checkbox for interactions.
function catalogueCheckbox(name: string): HTMLInputElement {
  const label = screen
    .getAllByText(name)
    .map((el) => el.closest("label"))
    .find((el): el is HTMLLabelElement => el !== null);
  if (!label) throw new Error(`No catalogue label found for "${name}"`);
  return label.querySelector("input[type=checkbox]") as HTMLInputElement;
}

async function waitForCatalogueLoaded() {
  await waitFor(() => expect(catalogueCheckbox("Correctness")).toBeInTheDocument());
}

describe("ManageEvaluatorsDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockApiClient.mockResolvedValue({ items: EVALUATORS });
  });

  it("renders with a generic subtitle when no taskType is given, and fetches evaluators", async () => {
    renderDialog();
    expect(screen.getByText("Manage evaluators")).toBeInTheDocument();
    expect(screen.getByText("Choose evaluators to align with humans")).toBeInTheDocument();
    await waitFor(() =>
      expect(mockApiClient).toHaveBeenCalledWith(
        "/evaluators?include_defaults=true",
        "tok",
      ),
    );
  });

  it("renders the task-type pill in the subtitle when taskType is given", async () => {
    renderDialog({ taskType: "llm" });
    expect(screen.getByText("LLM reply")).toBeInTheDocument();
    const subtitle = screen.getByText("LLM reply").closest("div.inline-flex")!;
    expect(subtitle.textContent).toBe("ChooseLLM replyevaluators to align with humans");
  });

  it("initializes selection/order from currentEvaluatorIds and shows the count", async () => {
    renderDialog();
    expect(screen.getByText("2 selected")).toBeInTheDocument();
    await waitForCatalogueLoaded();
    // Both selected evaluators render in the right column too (duplicated
    // with the left catalogue), so each name appears twice.
    expect(screen.getAllByText("Correctness")).toHaveLength(2);
    expect(screen.getAllByText("Helpfulness")).toHaveLength(2);
  });

  it("shows a loading state while evaluators load", async () => {
    let resolveFn: (v: unknown) => void = () => {};
    mockApiClient.mockReturnValueOnce(
      new Promise((resolve) => {
        resolveFn = resolve;
      }),
    );
    renderDialog();
    expect(screen.getByText("Loading evaluators")).toBeInTheDocument();
    resolveFn({ items: EVALUATORS });
    await waitFor(() =>
      expect(screen.queryByText("Loading evaluators")).not.toBeInTheDocument(),
    );
  });

  it("shows an error state when evaluators fail to load", async () => {
    mockApiClient.mockRejectedValue(
      new Error('Request failed: 500 - {"detail":"boom"}'),
    );
    renderDialog();
    await waitFor(() => expect(screen.getByText("boom")).toBeInTheDocument());
  });

  it("falls back to a generic message for a non-Error rejection", async () => {
    mockApiClient.mockRejectedValue("oops");
    renderDialog();
    await waitFor(() =>
      expect(screen.getByText("Failed to load evaluators")).toBeInTheDocument(),
    );
  });

  it("filters the left catalogue by taskType and by search", async () => {
    const user = setupUser();
    renderDialog({ taskType: "llm", currentEvaluatorIds: [] });
    await waitForCatalogueLoaded();
    expect(screen.queryByText("WER")).not.toBeInTheDocument();

    const search = screen.getByPlaceholderText("Search evaluators");
    await user.type(search, "tone");
    expect(screen.getByText("Tone")).toBeInTheDocument();
    expect(screen.queryByText("Correctness")).not.toBeInTheDocument();

    await user.clear(search);
    await user.type(search, "zzz");
    expect(screen.getByText("No matching evaluators.")).toBeInTheDocument();
  });

  it("shows a type-specific empty state and a generic one depending on taskType", async () => {
    mockApiClient.mockResolvedValue({ items: [] });
    const { rerender } = renderDialog({ taskType: "llm" });
    await waitFor(() =>
      expect(screen.getByText("No LLM reply evaluators yet.")).toBeInTheDocument(),
    );
    rerender(
      <ManageEvaluatorsDialog
        accessToken="tok"
        taskUuid="task-1"
        currentEvaluatorIds={[]}
        onClose={jest.fn()}
        onSaved={jest.fn()}
      />,
    );
    await waitFor(() => expect(screen.getByText("No evaluators yet.")).toBeInTheDocument());
  });

  it("toggles an evaluator on: adds it to the right column, updates counts, and enables Save", async () => {
    const user = setupUser();
    renderDialog({ currentEvaluatorIds: ["ev-1"] });
    await waitForCatalogueLoaded();

    await user.click(catalogueCheckbox("Helpfulness"));

    expect(screen.getByText("2 selected")).toBeInTheDocument();
    expect(screen.getByText("+1 to add")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
  });

  it("toggles an evaluator off: removes it, shows 'to remove' count, and blocks save at zero", async () => {
    const user = setupUser();
    renderDialog({ currentEvaluatorIds: ["ev-1"] });
    await waitForCatalogueLoaded();

    await user.click(catalogueCheckbox("Correctness"));

    expect(screen.getByText("0 selected")).toBeInTheDocument();
    expect(screen.getByText("−1 to remove")).toBeInTheDocument();
    expect(
      screen.getByText("A task must have at least one evaluator."),
    ).toBeInTheDocument();
    const saveBtn = screen.getByRole("button", { name: "Save changes" });
    expect(saveBtn).toBeDisabled();
    expect(saveBtn).toHaveAttribute(
      "title",
      "A task must have at least one evaluator",
    );
  });

  it("removes a selected evaluator from the right column via its remove button", async () => {
    const user = setupUser();
    renderDialog({ currentEvaluatorIds: ["ev-1", "ev-2"] });
    await waitForCatalogueLoaded();

    await user.click(screen.getByRole("button", { name: "Remove Correctness" }));
    expect(screen.getByText("1 selected")).toBeInTheDocument();
    expect(screen.getByText("−1 to remove")).toBeInTheDocument();
  });

  it("shows the fallback uuid-slice label when a selected id has no matching evaluator loaded", async () => {
    renderDialog({ currentEvaluatorIds: ["ev-unknown-uuid"] });
    await waitFor(() => expect(screen.getByText("1 selected")).toBeInTheDocument());
    expect(screen.getByText("ev-unkno")).toBeInTheDocument();
  });

  it("falls back to a placeholder aria-label when removing an evaluator with no loaded name", async () => {
    renderDialog({ currentEvaluatorIds: ["ev-unknown-uuid"] });
    await waitFor(() => expect(screen.getByText("1 selected")).toBeInTheDocument());
    expect(
      screen.getByRole("button", { name: "Remove evaluator" }),
    ).toBeInTheDocument();
  });

  it("has no changes / Save disabled when nothing was touched", async () => {
    renderDialog({ currentEvaluatorIds: ["ev-1", "ev-2"] });
    await waitForCatalogueLoaded();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeDisabled();
  });

  it("saves: adds first, then removes, and calls onSaved (no order PUT when adds+removes already produce the desired order)", async () => {
    const user = setupUser();
    mockApiClient.mockImplementation((url: string) => {
      if (url === "/evaluators?include_defaults=true") {
        return Promise.resolve({ items: EVALUATORS });
      }
      return Promise.resolve({ message: "ok" });
    });
    const onSaved = jest.fn();
    renderDialog({ currentEvaluatorIds: ["ev-1"], onSaved });
    await waitForCatalogueLoaded();

    await user.click(catalogueCheckbox("Helpfulness"));
    await user.click(catalogueCheckbox("Correctness"));

    await user.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() =>
      expect(mockApiClient).toHaveBeenCalledWith(
        "/annotation-tasks/task-1/evaluators",
        "tok",
        { method: "POST", body: { evaluator_id: "ev-2" } },
      ),
    );
    await waitFor(() =>
      expect(mockApiClient).toHaveBeenCalledWith(
        "/annotation-tasks/task-1/evaluators/ev-1",
        "tok",
        { method: "DELETE" },
      ),
    );
    expect(mockApiClient).not.toHaveBeenCalledWith(
      "/annotation-tasks/task-1/evaluators/order",
      "tok",
      expect.anything(),
    );
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
  });

  it("reorders via drag and drop and PUTs the new order on save (pure reorder, no add/remove)", async () => {
    const user = setupUser();
    mockApiClient.mockImplementation((url: string) => {
      if (url === "/evaluators?include_defaults=true") {
        return Promise.resolve({ items: EVALUATORS });
      }
      return Promise.resolve({ message: "ok" });
    });
    renderDialog({ currentEvaluatorIds: ["ev-1", "ev-2"] });
    await waitForCatalogueLoaded();

    expect(screen.queryByText("Order Changed")).not.toBeInTheDocument();

    // Right-column cards: find the draggable rows via their "N." index badge.
    const cards = screen.getAllByText(/^\d+\.$/).map((el) => el.closest("div[draggable]")!);
    expect(cards.length).toBe(2);

    const dataTransfer = { effectAllowed: "", dropEffect: "", setData: jest.fn() };

    // Drag card 0 (Correctness) onto card 1 (Helpfulness) to swap order.
    fireEvent.dragStart(cards[0], { dataTransfer });
    fireEvent.dragOver(cards[1], { dataTransfer });
    fireEvent.drop(cards[1], { dataTransfer });
    fireEvent.dragEnd(cards[0]);

    expect(screen.getByText("Order Changed")).toBeInTheDocument();
    const saveBtn = screen.getByRole("button", { name: "Save changes" });
    expect(saveBtn).toBeEnabled();

    await user.click(saveBtn);
    await waitFor(() =>
      expect(mockApiClient).toHaveBeenCalledWith(
        "/annotation-tasks/task-1/evaluators/order",
        "tok",
        { method: "PUT", body: { evaluator_ids: ["ev-2", "ev-1"] } },
      ),
    );
  });

  it("ignores dragOver before any drag has started, clears the drag-over highlight on dragLeave, and resets on dragEnd", async () => {
    renderDialog({ currentEvaluatorIds: ["ev-1", "ev-2"] });
    await waitForCatalogueLoaded();
    const cards = screen.getAllByText(/^\d+\.$/).map((el) => el.closest("div[draggable]")!);
    const dataTransfer = { effectAllowed: "", dropEffect: "", setData: jest.fn() };

    // dragOver with no active drag source is a no-op (dragSourceIdx === null).
    fireEvent.dragOver(cards[1], { dataTransfer });

    fireEvent.dragStart(cards[0], { dataTransfer });
    fireEvent.dragOver(cards[1], { dataTransfer });
    fireEvent.dragLeave(cards[1]);
    fireEvent.dragEnd(cards[0]);
    expect(screen.queryByText("Order Changed")).not.toBeInTheDocument();
  });

  it("ignores a drop onto the same source index (no reorder)", async () => {
    renderDialog({ currentEvaluatorIds: ["ev-1", "ev-2"] });
    await waitForCatalogueLoaded();
    const cards = screen.getAllByText(/^\d+\.$/).map((el) => el.closest("div[draggable]")!);
    const dataTransfer = { effectAllowed: "", dropEffect: "", setData: jest.fn() };
    fireEvent.dragStart(cards[0], { dataTransfer });
    fireEvent.dragOver(cards[0], { dataTransfer });
    fireEvent.drop(cards[0], { dataTransfer });
    expect(screen.queryByText("Order Changed")).not.toBeInTheDocument();
  });

  it("shows a save error banner on failure and keeps the dialog open", async () => {
    const user = setupUser();
    mockApiClient.mockImplementation((url: string) => {
      if (url === "/evaluators?include_defaults=true") {
        return Promise.resolve({ items: EVALUATORS });
      }
      return Promise.reject(new Error('Request failed: 400 - {"detail":"nope"}'));
    });
    renderDialog({ currentEvaluatorIds: ["ev-1"] });
    await waitForCatalogueLoaded();
    await setupUser().click(catalogueCheckbox("Helpfulness"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() => expect(screen.getByText("nope")).toBeInTheDocument());
  });

  it("falls back to a generic save-error message for a non-Error rejection", async () => {
    const user = setupUser();
    mockApiClient.mockImplementation((url: string) => {
      if (url === "/evaluators?include_defaults=true") {
        return Promise.resolve({ items: EVALUATORS });
      }
      return Promise.reject("nope");
    });
    renderDialog({ currentEvaluatorIds: ["ev-1"] });
    await waitForCatalogueLoaded();
    await user.click(catalogueCheckbox("Helpfulness"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    await waitFor(() =>
      expect(screen.getByText("Failed to update evaluators")).toBeInTheDocument(),
    );
  });

  it("closes via the backdrop click and the header X, but ignores both while saving", async () => {
    const user = setupUser();
    let resolveSave: (v: unknown) => void = () => {};
    mockApiClient.mockImplementation((url: string) => {
      if (url === "/evaluators?include_defaults=true") {
        return Promise.resolve({ items: EVALUATORS });
      }
      return new Promise((resolve) => {
        resolveSave = resolve;
      });
    });
    const onClose = jest.fn();
    const { container } = renderDialog({ currentEvaluatorIds: ["ev-1"], onClose });
    await waitForCatalogueLoaded();

    // Clicking inside the panel doesn't close (stopPropagation).
    await user.click(screen.getByText("Manage evaluators"));
    expect(onClose).not.toHaveBeenCalled();

    // Backdrop click closes.
    const backdrop = container.firstChild as HTMLElement;
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(1);

    // Header close (X) button.
    await user.click(screen.getByRole("button", { name: "" }));
    expect(onClose).toHaveBeenCalledTimes(2);

    // While saving, backdrop click is a no-op.
    await user.click(catalogueCheckbox("Helpfulness"));
    await user.click(screen.getByRole("button", { name: "Save changes" }));
    expect(screen.getByRole("button", { name: "Saving..." })).toBeInTheDocument();
    await user.click(backdrop);
    expect(onClose).toHaveBeenCalledTimes(2);
    resolveSave({ message: "ok" });
    await waitFor(() =>
      expect(screen.queryByRole("button", { name: "Saving..." })).not.toBeInTheDocument(),
    );
  });

  it("falls back to the raw Error message when it doesn't match the 'Request failed' shape", async () => {
    mockApiClient.mockRejectedValue(new Error("network down"));
    renderDialog();
    await waitFor(() => expect(screen.getByText("network down")).toBeInTheDocument());
  });

  it("falls back to the raw body when the 'Request failed' body isn't JSON", async () => {
    mockApiClient.mockRejectedValue(new Error("Request failed: 500 - not json"));
    renderDialog();
    await waitFor(() => expect(screen.getByText("not json")).toBeInTheDocument());
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
  });
});
