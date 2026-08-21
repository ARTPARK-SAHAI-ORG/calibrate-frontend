import { render, screen, setupUser, waitFor } from "@/test-utils";
import { RunEvaluatorsPanel } from "../RunEvaluatorsPanel";
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
});
