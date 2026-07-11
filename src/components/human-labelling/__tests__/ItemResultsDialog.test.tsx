import { render, screen, setupUser } from "@/test-utils";
import {
  ItemResultsDialog,
  type ItemResultsEvaluator,
} from "../ItemResultsDialog";

const evaluators: ItemResultsEvaluator[] = [
  { uuid: "e1", name: "Correctness" },
  { uuid: "e2", name: "Tone" },
];

describe("ItemResultsDialog", () => {
  it("renders nothing when closed", () => {
    render(
      <ItemResultsDialog
        isOpen={false}
        onClose={jest.fn()}
        itemName="Item 1"
        evaluators={evaluators}
      />,
    );
    expect(screen.queryByText("Results")).not.toBeInTheDocument();
  });

  it("shows the item name and evaluator tabs, defaulting to the first evaluator", () => {
    render(
      <ItemResultsDialog
        isOpen
        onClose={jest.fn()}
        itemName="Item 1"
        evaluators={evaluators}
      />,
    );
    expect(screen.getByText("Results")).toBeInTheDocument();
    expect(screen.getByText("Item 1")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Correctness" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Results for Correctness"),
    ).toBeInTheDocument();
  });

  it("switches the active tab when clicking another evaluator", async () => {
    const user = setupUser();
    render(
      <ItemResultsDialog
        isOpen
        onClose={jest.fn()}
        itemName="Item 1"
        evaluators={evaluators}
      />,
    );
    await user.click(screen.getByRole("button", { name: "Tone" }));
    expect(screen.getByText("Results for Tone")).toBeInTheDocument();
  });

  it("calls onClose when clicking the close button", async () => {
    const user = setupUser();
    const onClose = jest.fn();
    render(
      <ItemResultsDialog
        isOpen
        onClose={onClose}
        itemName="Item 1"
        evaluators={evaluators}
      />,
    );
    await user.click(screen.getByLabelText("Close"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("shows an empty state when there are no evaluators", () => {
    render(
      <ItemResultsDialog
        isOpen
        onClose={jest.fn()}
        itemName="Item 1"
        evaluators={[]}
      />,
    );
    expect(
      screen.getByText("No evaluators are linked to this task."),
    ).toBeInTheDocument();
  });

  it("resets the active evaluator to the first one each time it reopens", () => {
    const { rerender } = render(
      <ItemResultsDialog
        isOpen={false}
        onClose={jest.fn()}
        itemName="Item 1"
        evaluators={evaluators}
      />,
    );
    rerender(
      <ItemResultsDialog
        isOpen
        onClose={jest.fn()}
        itemName="Item 1"
        evaluators={evaluators}
      />,
    );
    expect(screen.getByText("Results for Correctness")).toBeInTheDocument();
  });
});
