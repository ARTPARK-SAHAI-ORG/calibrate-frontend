import React from "react";
import { fireEvent } from "@testing-library/react";
import { render, screen, setupUser } from "@/test-utils";
import { TaskItemsTable, type TaskItemsTableProps } from "../TaskItemsTable";

type Item = { uuid: string; id: number; name: string };
const items: Item[] = [
  { uuid: "u1", id: 1, name: "First item" },
  { uuid: "u2", id: 2, name: "Second item" },
];

function setup(over: Partial<TaskItemsTableProps<Item>> = {}) {
  const props: TaskItemsTableProps<Item> = {
    items,
    evaluators: [
      { uuid: "ev-a", name: "Correctness" },
      { uuid: "ev-b", name: "Tone" },
    ],
    scores: new Map([
      [
        "u1",
        new Map([
          [
            "ev-a",
            {
              evaluator: { text: "Evaluator: Correct", tone: "pass" as const },
              humans: { text: "Humans: 50% Correct", tone: "mid" as const },
            },
          ],
        ]),
      ],
    ]),
    isSelected: (item) => item.uuid === "u2",
    allSelected: false,
    someSelected: true,
    onToggleAll: jest.fn(),
    onToggleRow: jest.fn(),
    onSelectRange: jest.fn(),
    onOpen: jest.fn(),
    sortDirection: "desc",
    onToggleSort: jest.fn(),
    itemLabel: (item) => item.id,
    renderName: (item) => <span>{item.name}</span>,
    renderLabelledBy: (item) => <span>labellers {item.id}</span>,
    renderUpdatedAt: (item) => <span>updated {item.id}</span>,
    renderActions: (item) => <button type="button">Act on {item.id}</button>,
    ...over,
  };
  render(<TaskItemsTable {...props} />);
  return props;
}

describe("TaskItemsTable", () => {
  it("draws the columns, one per evaluator, and each row's cells", () => {
    setup();
    for (const heading of ["Name", "Labelled by", "Updated at", "Correctness", "Tone", "Actions"]) {
      expect(screen.getByText(heading)).toBeInTheDocument();
    }
    expect(screen.getByText("First item")).toBeInTheDocument();
    expect(screen.getByText("labellers 2")).toBeInTheDocument();
    expect(screen.getByText("updated 1")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Act on 2" })).toBeInTheDocument();
    expect(screen.getByText("Evaluator: Correct")).toHaveClass("bg-green-100");
    expect(screen.getByText("Humans: 50% Correct")).toHaveClass("bg-yellow-100");
    // Three cells have no score: u1/Tone, u2/Correctness, u2/Tone.
    expect(screen.getAllByText("Evaluator: Not run")).toHaveLength(3);
    expect(screen.getAllByText("Humans: Not labelled yet")).toHaveLength(3);
  });

  it("marks select-all as partly ticked and reports each row's tick", () => {
    setup();
    const all = screen.getByRole("checkbox", { name: "Select all" }) as HTMLInputElement;
    expect(all.indeterminate).toBe(true);
    expect(screen.getByRole("checkbox", { name: "Select item 1" })).not.toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Select item 2" })).toBeChecked();
  });

  it("calls back for select-all, row ticks, opening and sorting", async () => {
    const user = setupUser();
    const props = setup();
    await user.click(screen.getByRole("checkbox", { name: "Select all" }));
    expect(props.onToggleAll).toHaveBeenCalled();

    await user.click(screen.getByRole("checkbox", { name: "Select item 1" }));
    expect(props.onToggleRow).toHaveBeenCalledWith(items[0]);
    expect(props.onOpen).not.toHaveBeenCalled();

    await user.click(screen.getByText("Second item"));
    expect(props.onOpen).toHaveBeenCalledWith(items[1]);

    await user.click(screen.getByRole("button", { name: "Sort by updated at" }));
    expect(props.onToggleSort).toHaveBeenCalled();
  });

  it("selects a range on shift+click, on the row or its checkbox", () => {
    const props = setup();
    fireEvent.click(screen.getByText("First item"), { shiftKey: true });
    expect(props.onSelectRange).toHaveBeenCalledWith(items[0]);
    expect(props.onOpen).not.toHaveBeenCalled();

    const box = screen.getByRole("checkbox", { name: "Select item 2" });
    fireEvent.mouseDown(box, { shiftKey: true });
    fireEvent.click(box);
    expect(props.onSelectRange).toHaveBeenCalledWith(items[1]);
    expect(props.onToggleRow).not.toHaveBeenCalled();
  });
});
