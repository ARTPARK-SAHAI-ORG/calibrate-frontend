import { render, screen, setupUser, waitFor } from "@/test-utils";
import { RunEvaluatorsPanel } from "../RunEvaluatorsPanel";
import { fetchEvaluatorDetail } from "@/lib/evaluatorApi";
import type { EvaluatorData } from "@/lib/evaluatorApi";

jest.mock("../../agent-tabs/AddEvaluatorsDialog", () => ({
  AddEvaluatorsDialog: ({
    isOpen,
    onAdd,
  }: {
    isOpen: boolean;
    onAdd: (uuids: string[]) => void;
  }) =>
    isOpen ? (
      <button data-testid="add-dialog" onClick={() => onAdd(["ev-2"])}>
        Add ev-2
      </button>
    ) : null,
}));

jest.mock("../../evaluators/CreateEvaluatorFlow", () => ({
  CreateEvaluatorFlow: ({ open }: { open: boolean }) =>
    open ? <div data-testid="create-flow" /> : null,
}));

jest.mock("../../../hooks", () => ({
  ...jest.requireActual("../../../hooks"),
  useAccessToken: () => "tok",
}));

jest.mock("../../../lib/evaluatorApi", () => ({
  ...jest.requireActual("../../../lib/evaluatorApi"),
  fetchEvaluatorDetail: jest.fn(),
}));

jest.mock("../../../lib/reportError", () => ({ reportError: jest.fn() }));

// jsdom has no ResizeObserver; the preview's prompt card measures its own overflow.
class MockResizeObserver {
  observe() {}
  disconnect() {}
}

beforeAll(() => {
  (
    global as unknown as { ResizeObserver: typeof MockResizeObserver }
  ).ResizeObserver = MockResizeObserver;
});

const mockFetchDetail = fetchEvaluatorDetail as jest.Mock;

const evaluator = (uuid: string, name: string): EvaluatorData => ({
  uuid,
  name,
  description: "",
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  evaluator_type: "stt",
});

function renderPanel(
  props: Partial<React.ComponentProps<typeof RunEvaluatorsPanel>> = {},
) {
  const onSelectedChange = jest.fn();
  const utils = render(
    <RunEvaluatorsPanel
      evaluatorType="stt"
      available={[evaluator("ev-1", "Semantic match")]}
      isLoading={false}
      selectedUuids={["ev-1"]}
      onSelectedChange={onSelectedChange}
      onRefresh={jest.fn()}
      description="These evaluators score the transcripts each model produces"
      {...props}
    />,
  );
  return { ...utils, onSelectedChange };
}

beforeEach(() => {
  jest.clearAllMocks();
  mockFetchDetail.mockResolvedValue({
    uuid: "ev-1",
    name: "Semantic match",
    description: "",
    output_type: "rating",
    evaluator_type: "stt",
    live_version_index: 0,
    versions: [
      {
        uuid: "v1",
        version_number: 1,
        judge_model: "google/gemini-2.5-flash",
        system_prompt: "Judge whether the transcript matches.",
        output_config: null,
        variables: null,
      },
    ],
  });
});

describe("RunEvaluatorsPanel", () => {
  it("shows a card for each chosen evaluator", () => {
    renderPanel();
    expect(screen.getByText("Semantic match")).toBeInTheDocument();
  });

  it("drops a chosen evaluator the library no longer has", async () => {
    const { onSelectedChange } = renderPanel({
      selectedUuids: ["ev-1", "ev-gone"],
    });
    // Cards and what the run is sent must be the same list.
    await waitFor(() =>
      expect(onSelectedChange).toHaveBeenCalledWith(["ev-1"]),
    );
  });

  it("keeps the choice while the library is still loading", async () => {
    const { onSelectedChange } = renderPanel({
      isLoading: true,
      available: [],
      selectedUuids: ["ev-1"],
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onSelectedChange).not.toHaveBeenCalled();
  });

  it("keeps the choice when the library could not be read", async () => {
    const { onSelectedChange } = renderPanel({
      available: [],
      selectedUuids: ["ev-1"],
    });
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onSelectedChange).not.toHaveBeenCalled();
  });

  it("does not drop a newly created evaluator before the library re-reads", async () => {
    const { rerender, onSelectedChange } = renderPanel();
    // The create flow adds the new uuid before the fresh library arrives.
    rerender(
      <RunEvaluatorsPanel
        evaluatorType="stt"
        available={[evaluator("ev-1", "Semantic match")]}
        isLoading={false}
        selectedUuids={["ev-1", "ev-new"]}
        onSelectedChange={onSelectedChange}
        onRefresh={jest.fn()}
        description="d"
      />,
    );
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(onSelectedChange).not.toHaveBeenCalled();
  });

  it("removes an evaluator from the run", async () => {
    const user = setupUser();
    const { onSelectedChange } = renderPanel();
    await user.click(screen.getByRole("button", { name: "Remove" }));
    expect(onSelectedChange).toHaveBeenCalledWith([]);
  });

  it("shows no actions when read only", () => {
    renderPanel({ readOnly: true });
    expect(
      screen.queryByRole("button", { name: "Remove" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Add evaluators" }),
    ).not.toBeInTheDocument();
  });

  it("opens how the evaluator judges when its View button is clicked", async () => {
    const user = setupUser();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "View" }));

    expect(
      screen.getByRole("heading", { name: "Semantic match", level: 2 }),
    ).toBeInTheDocument();
    expect(
      await screen.findByText("Judge whether the transcript matches."),
    ).toBeInTheDocument();
    expect(mockFetchDetail).toHaveBeenCalledWith("ev-1", "tok");
  });

  it("opens the same preview when the card itself is clicked", async () => {
    const user = setupUser();
    renderPanel();
    await user.click(
      screen.getByRole("button", { name: "Open Semantic match" }),
    );

    expect(
      await screen.findByText("Judge whether the transcript matches."),
    ).toBeInTheDocument();
  });

  it("closes the preview", async () => {
    const user = setupUser();
    renderPanel();
    await user.click(screen.getByRole("button", { name: "View" }));
    await screen.findByText("Judge whether the transcript matches.");

    await user.click(screen.getByRole("button", { name: "Close preview" }));
    expect(
      screen.queryByText("Judge whether the transcript matches."),
    ).not.toBeInTheDocument();
  });
});
