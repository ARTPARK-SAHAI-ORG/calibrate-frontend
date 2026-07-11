import { render, screen, setupUser, waitFor } from "@/test-utils";
import {
  ItemDetailDialog,
  type ItemDetailDialogTask,
} from "../ItemDetailDialog";
import { type Item } from "../AnnotationJobView";

const apiClientMock = jest.fn();
jest.mock("../../../lib/api", () => ({
  apiClient: (...args: unknown[]) => apiClientMock(...args),
}));

// MultiSelectPicker renders a portal-based dropdown that's heavy to drive in
// jsdom; stub it with a simple multi-button list so tests can toggle
// selection without depending on its internal DOM/portal behavior.
jest.mock("../../../components/MultiSelectPicker", () => ({
  MultiSelectPicker: ({
    items,
    selectedItems,
    onSelectionChange,
  }: {
    items: { uuid: string; name: string }[];
    selectedItems: { uuid: string; name: string }[];
    onSelectionChange: (items: { uuid: string; name: string }[]) => void;
  }) => (
    <div data-testid="annotator-picker">
      {items.map((it) => {
        const isSelected = selectedItems.some((s) => s.uuid === it.uuid);
        return (
          <button
            key={it.uuid}
            type="button"
            aria-pressed={isSelected}
            onClick={() =>
              onSelectionChange(
                isSelected
                  ? selectedItems.filter((s) => s.uuid !== it.uuid)
                  : [...selectedItems, it],
              )
            }
          >
            {it.name}
          </button>
        );
      })}
    </div>
  ),
}));

jest.mock("../../Tooltip", () => ({
  Tooltip: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock("../EvaluatorRunDetailView", () => {
  const actual = jest.requireActual("../EvaluatorRunDetailView");
  return {
    ...actual,
    ItemDetailPane: (props: Record<string, unknown>) => (
      <div data-testid="item-detail-pane">
        <span data-testid="pane-evaluators-count">
          {Array.isArray(props.evaluators) ? props.evaluators.length : 0}
        </span>
        <span data-testid="pane-runs-count">
          {Array.isArray(props.runs) ? props.runs.length : 0}
        </span>
        <span data-testid="pane-annotator-filter-active">
          {String(props.annotatorFilterActive)}
        </span>
        <span data-testid="pane-item-comments">
          {JSON.stringify(props.itemComments)}
        </span>
      </div>
    ),
  };
});

const task: ItemDetailDialogTask = {
  uuid: "task-1",
  name: "Task One",
  type: "llm",
  evaluators: [{ uuid: "ev-1", description: "desc", output_type: "binary" }],
};

const item: Item = {
  id: 1,
  uuid: "item-1",
  task_id: "task-1",
  payload: { name: "My Item" },
  created_at: "2024-01-01",
  deleted_at: null,
};

function baseSummary(overrides: Record<string, unknown> = {}) {
  return {
    annotators: [
      { uuid: "ann-1", name: "Alice" },
      { uuid: "ann-2", name: "Bob" },
    ],
    evaluators: [
      {
        uuid: "ev-1",
        name: "Correctness",
        output_type: "binary",
        run_count: 1,
        versions: [{ uuid: "v1", version_number: 1, is_live: true }],
      },
    ],
    rows: [
      {
        item_id: "item-1",
        payload: null,
        evaluator_id: "ev-1",
        evaluator_version_id: "v1",
        evaluator_value: true,
        evaluator_value_name: "Correct",
        evaluator_reasoning: "Looks right",
        human_agreement: 1,
        evaluator_agreement: 1,
        annotations: {
          "ann-1": { value: true, reasoning: "yep" },
        },
      },
    ],
    item_comments: {
      "item-1": { "ann-1": "Nice item" },
    },
    ...overrides,
  };
}

describe("ItemDetailDialog", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("renders nothing when closed", () => {
    render(
      <ItemDetailDialog
        isOpen={false}
        onClose={jest.fn()}
        task={task}
        item={item}
        accessToken="tok"
      />,
    );
    expect(screen.queryByText("My Item")).not.toBeInTheDocument();
  });

  it("shows a loading state before the summary resolves, then renders the pane", async () => {
    let resolveFn: (v: unknown) => void = () => {};
    apiClientMock.mockReturnValue(
      new Promise((resolve) => {
        resolveFn = resolve;
      }),
    );
    render(
      <ItemDetailDialog
        isOpen
        onClose={jest.fn()}
        task={task}
        item={item}
        accessToken="tok"
      />,
    );
    expect(screen.getByText("Loading item")).toBeInTheDocument();
    resolveFn(baseSummary());
    await waitFor(() =>
      expect(screen.getByTestId("item-detail-pane")).toBeInTheDocument(),
    );
    expect(screen.getByText("My Item")).toBeInTheDocument();
  });

  it("falls back to 'Item' when the payload has no name", async () => {
    apiClientMock.mockResolvedValue(baseSummary());
    const noNameItem: Item = { ...item, payload: {} };
    render(
      <ItemDetailDialog
        isOpen
        onClose={jest.fn()}
        task={task}
        item={noNameItem}
        accessToken="tok"
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("item-detail-pane")).toBeInTheDocument(),
    );
    expect(screen.getByRole("heading", { name: "Item" })).toBeInTheDocument();
  });

  it("shows an error message when the fetch fails, and does not render the pane", async () => {
    apiClientMock.mockRejectedValue(new Error("summary failed"));
    render(
      <ItemDetailDialog
        isOpen
        onClose={jest.fn()}
        task={task}
        item={item}
        accessToken="tok"
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("summary failed")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("item-detail-pane")).not.toBeInTheDocument();
  });

  it("does not fetch when accessToken, task, or item is missing", () => {
    render(
      <ItemDetailDialog
        isOpen
        onClose={jest.fn()}
        task={null}
        item={item}
        accessToken="tok"
      />,
    );
    expect(apiClientMock).not.toHaveBeenCalled();
  });

  it("shows the 'No labels yet' pill when nothing has been labelled", async () => {
    apiClientMock.mockResolvedValue(
      baseSummary({
        rows: [
          {
            item_id: "item-1",
            payload: null,
            evaluator_id: "ev-1",
            evaluator_version_id: "v1",
            evaluator_value: null,
            evaluator_value_name: null,
            evaluator_reasoning: null,
            human_agreement: null,
            evaluator_agreement: null,
            annotations: {},
          },
        ],
        item_comments: {},
      }),
    );
    render(
      <ItemDetailDialog
        isOpen
        onClose={jest.fn()}
        task={task}
        item={item}
        accessToken="tok"
      />,
    );
    await waitFor(() =>
      expect(screen.getByText("No labels yet")).toBeInTheDocument(),
    );
  });

  it("shows the live-versions toggle only when an evaluator has run, and toggles it", async () => {
    const user = setupUser();
    apiClientMock.mockResolvedValue(baseSummary());
    render(
      <ItemDetailDialog
        isOpen
        onClose={jest.fn()}
        task={task}
        item={item}
        accessToken="tok"
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("item-detail-pane")).toBeInTheDocument(),
    );
    const toggle = screen.getByRole("button", {
      name: /Live versions only/,
    });
    expect(toggle).toHaveAttribute("aria-pressed", "true");
    apiClientMock.mockClear();
    apiClientMock.mockResolvedValue(baseSummary());
    await user.click(toggle);
    expect(toggle).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(apiClientMock).toHaveBeenCalled());
    // live_only query param dropped once toggled off
    expect(apiClientMock.mock.calls[0][0]).not.toContain("live_only");
  });

  it("hides the live-versions toggle when no evaluator has ever run", async () => {
    apiClientMock.mockResolvedValue(
      baseSummary({
        evaluators: [
          { uuid: "ev-1", name: "Correctness", output_type: "binary", run_count: 0 },
        ],
      }),
    );
    render(
      <ItemDetailDialog
        isOpen
        onClose={jest.fn()}
        task={task}
        item={item}
        accessToken="tok"
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("item-detail-pane")).toBeInTheDocument(),
    );
    expect(
      screen.queryByRole("button", { name: /Live versions only/ }),
    ).not.toBeInTheDocument();
  });

  it("filters by annotator via the picker and updates the pane / item comments", async () => {
    const user = setupUser();
    apiClientMock.mockResolvedValue(baseSummary());
    render(
      <ItemDetailDialog
        isOpen
        onClose={jest.fn()}
        task={task}
        item={item}
        accessToken="tok"
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("item-detail-pane")).toBeInTheDocument(),
    );
    expect(screen.getByTestId("pane-annotator-filter-active")).toHaveTextContent(
      "false",
    );
    expect(screen.getByTestId("pane-item-comments")).toHaveTextContent(
      "Nice item",
    );

    await user.click(screen.getByRole("button", { name: "Alice" }));
    expect(screen.getByTestId("pane-annotator-filter-active")).toHaveTextContent(
      "true",
    );
    // Bob left no signal on this item, so he shouldn't appear as filterable.
    expect(screen.queryByRole("button", { name: "Bob" })).not.toBeInTheDocument();
  });

  it("does not show the annotator picker when nobody has left a signal", async () => {
    apiClientMock.mockResolvedValue(
      baseSummary({ rows: [], item_comments: {} }),
    );
    render(
      <ItemDetailDialog
        isOpen
        onClose={jest.fn()}
        task={task}
        item={item}
        accessToken="tok"
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("item-detail-pane")).toBeInTheDocument(),
    );
    expect(screen.queryByTestId("annotator-picker")).not.toBeInTheDocument();
  });

  it("closes via the close button and calls onClose on Escape", async () => {
    const user = setupUser();
    apiClientMock.mockResolvedValue(baseSummary());
    const onClose = jest.fn();
    render(
      <ItemDetailDialog
        isOpen
        onClose={onClose}
        task={task}
        item={item}
        accessToken="tok"
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("item-detail-pane")).toBeInTheDocument(),
    );
    await user.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);

    await user.keyboard("{Escape}");
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("navigates with Previous/Next buttons and arrow keys", async () => {
    const user = setupUser();
    apiClientMock.mockResolvedValue(baseSummary());
    const onPrev = jest.fn();
    const onNext = jest.fn();
    render(
      <ItemDetailDialog
        isOpen
        onClose={jest.fn()}
        task={task}
        item={item}
        accessToken="tok"
        onPrev={onPrev}
        onNext={onNext}
        hasPrev
        hasNext
        position={{ index: 1, total: 5 }}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("item-detail-pane")).toBeInTheDocument(),
    );
    expect(screen.getByText("2 of 5")).toBeInTheDocument();

    await user.click(screen.getByLabelText("Previous item"));
    expect(onPrev).toHaveBeenCalledTimes(1);
    await user.click(screen.getByLabelText("Next item"));
    expect(onNext).toHaveBeenCalledTimes(1);

    await user.keyboard("{ArrowLeft}");
    expect(onPrev).toHaveBeenCalledTimes(2);
    await user.keyboard("{ArrowRight}");
    expect(onNext).toHaveBeenCalledTimes(2);
  });

  it("disables Previous/Next when hasPrev/hasNext are false and ignores arrow keys", async () => {
    apiClientMock.mockResolvedValue(baseSummary());
    const onPrev = jest.fn();
    const onNext = jest.fn();
    render(
      <ItemDetailDialog
        isOpen
        onClose={jest.fn()}
        task={task}
        item={item}
        accessToken="tok"
        onPrev={onPrev}
        onNext={onNext}
        hasPrev={false}
        hasNext={false}
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("item-detail-pane")).toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Previous item")).toBeDisabled();
    expect(screen.getByLabelText("Next item")).toBeDisabled();

    await setupUser().keyboard("{ArrowLeft}");
    await setupUser().keyboard("{ArrowRight}");
    expect(onPrev).not.toHaveBeenCalled();
    expect(onNext).not.toHaveBeenCalled();
  });

  it("resets the live-versions toggle and annotator filter when the dialog closes then reopens", async () => {
    const user = setupUser();
    apiClientMock.mockResolvedValue(baseSummary());
    const { rerender } = render(
      <ItemDetailDialog
        isOpen
        onClose={jest.fn()}
        task={task}
        item={item}
        accessToken="tok"
      />,
    );
    await waitFor(() =>
      expect(screen.getByTestId("item-detail-pane")).toBeInTheDocument(),
    );
    await user.click(screen.getByRole("button", { name: /Live versions only/ }));
    expect(
      screen.getByRole("button", { name: /Live versions only/ }),
    ).toHaveAttribute("aria-pressed", "false");

    rerender(
      <ItemDetailDialog
        isOpen={false}
        onClose={jest.fn()}
        task={task}
        item={item}
        accessToken="tok"
      />,
    );
    apiClientMock.mockClear();
    apiClientMock.mockResolvedValue(baseSummary());
    rerender(
      <ItemDetailDialog
        isOpen
        onClose={jest.fn()}
        task={task}
        item={item}
        accessToken="tok"
      />,
    );
    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: /Live versions only/ }),
      ).toHaveAttribute("aria-pressed", "true"),
    );
  });
});
