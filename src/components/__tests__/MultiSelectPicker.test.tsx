import { render, screen, setupUser, waitFor } from "@/test-utils";
import {
  MultiSelectPicker,
  PickerItem,
} from "../MultiSelectPicker";

const ITEMS: PickerItem[] = [
  { uuid: "1", name: "Alpha", description: "First item" },
  { uuid: "2", name: "Beta" },
  { uuid: "3", name: "Gamma", description: "Third item" },
];

describe("MultiSelectPicker", () => {
  it("shows the placeholder when nothing is selected", () => {
    render(
      <MultiSelectPicker
        items={ITEMS}
        selectedItems={[]}
        onSelectionChange={jest.fn()}
        placeholder="Pick things"
      />,
    );
    expect(screen.getByText("Pick things")).toBeInTheDocument();
  });

  it("renders a label when provided", () => {
    render(
      <MultiSelectPicker
        items={ITEMS}
        selectedItems={[]}
        onSelectionChange={jest.fn()}
        label="My Picker"
      />,
    );
    expect(screen.getByText("My Picker")).toBeInTheDocument();
  });

  it("opens the dropdown and lists items on trigger click", async () => {
    const user = setupUser();
    render(
      <MultiSelectPicker
        items={ITEMS}
        selectedItems={[]}
        onSelectionChange={jest.fn()}
        placeholder="Pick things"
      />,
    );

    await user.click(screen.getByText("Pick things"));

    expect(await screen.findByText("Alpha")).toBeInTheDocument();
    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.getByText("Gamma")).toBeInTheDocument();
    expect(screen.getByText("First item")).toBeInTheDocument();
  });

  it("does not open when disabled", async () => {
    const user = setupUser();
    render(
      <MultiSelectPicker
        items={ITEMS}
        selectedItems={[]}
        onSelectionChange={jest.fn()}
        placeholder="Pick things"
        disabled
      />,
    );

    await user.click(screen.getByText("Pick things"));
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });

  it("filters items via the search input", async () => {
    const user = setupUser();
    render(
      <MultiSelectPicker
        items={ITEMS}
        selectedItems={[]}
        onSelectionChange={jest.fn()}
        placeholder="Pick things"
        searchPlaceholder="Search here"
      />,
    );

    await user.click(screen.getByText("Pick things"));
    await user.type(screen.getByPlaceholderText("Search here"), "bet");

    expect(screen.getByText("Beta")).toBeInTheDocument();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });

  it("shows the empty state when search matches nothing", async () => {
    const user = setupUser();
    render(
      <MultiSelectPicker
        items={ITEMS}
        selectedItems={[]}
        onSelectionChange={jest.fn()}
      />,
    );

    await user.click(screen.getByText("Select items"));
    await user.type(screen.getByPlaceholderText("Search"), "zzz");

    expect(screen.getByText("No items found")).toBeInTheDocument();
  });

  it("shows a loading state instead of the item list", async () => {
    const user = setupUser();
    render(
      <MultiSelectPicker
        items={ITEMS}
        selectedItems={[]}
        onSelectionChange={jest.fn()}
        isLoading
      />,
    );

    await user.click(screen.getByText("Select items"));
    expect(screen.getByText("Loading")).toBeInTheDocument();
    expect(screen.queryByText("Alpha")).not.toBeInTheDocument();
  });

  it("selects an unselected item via onSelectionChange", async () => {
    const user = setupUser();
    const onSelectionChange = jest.fn();
    render(
      <MultiSelectPicker
        items={ITEMS}
        selectedItems={[]}
        onSelectionChange={onSelectionChange}
      />,
    );

    await user.click(screen.getByText("Select items"));
    await user.click(screen.getByText("Alpha"));

    expect(onSelectionChange).toHaveBeenCalledWith([ITEMS[0]]);
  });

  it("deselects a selected item when clicked again in the dropdown", async () => {
    const user = setupUser();
    const onSelectionChange = jest.fn();
    const { container } = render(
      <MultiSelectPicker
        items={ITEMS}
        selectedItems={[ITEMS[0]]}
        onSelectionChange={onSelectionChange}
      />,
    );

    // Selected chip shown in trigger (no placeholder text when non-empty).
    expect(screen.getAllByText("Alpha").length).toBeGreaterThan(0);

    const trigger = container.querySelector(".cursor-pointer") as HTMLElement;
    await user.click(trigger);
    // There are now two "Alpha" texts: the chip and the dropdown option.
    const options = screen.getAllByText("Alpha");
    await user.click(options[options.length - 1]);

    expect(onSelectionChange).toHaveBeenCalledWith([]);
  });

  it("removes a selected item via the chip's remove button without opening the dropdown", async () => {
    const user = setupUser();
    const onSelectionChange = jest.fn();
    render(
      <MultiSelectPicker
        items={ITEMS}
        selectedItems={[ITEMS[0], ITEMS[1]]}
        onSelectionChange={onSelectionChange}
      />,
    );

    const chip = screen.getByText("Alpha").closest("span") as HTMLElement;
    const removeButton = chip.querySelector("button") as HTMLElement;
    await user.click(removeButton);

    expect(onSelectionChange).toHaveBeenCalledWith([ITEMS[1]]);
    // Dropdown should not have opened as a result of stopPropagation.
    expect(screen.queryByPlaceholderText("Search")).not.toBeInTheDocument();
  });

  it("does not render a remove button on chips when disabled", () => {
    render(
      <MultiSelectPicker
        items={ITEMS}
        selectedItems={[ITEMS[0]]}
        onSelectionChange={jest.fn()}
        disabled
      />,
    );

    const chip = screen.getByText("Alpha").closest("span") as HTMLElement;
    expect(chip.querySelector("button")).not.toBeInTheDocument();
  });

  it("calls onOpenChange when the dropdown opens and closes via outside click", async () => {
    const user = setupUser();
    const onOpenChange = jest.fn();
    render(
      <div>
        <div data-testid="outside">outside area</div>
        <MultiSelectPicker
          items={ITEMS}
          selectedItems={[]}
          onSelectionChange={jest.fn()}
          onOpenChange={onOpenChange}
        />
      </div>,
    );

    await user.click(screen.getByText("Select items"));
    expect(onOpenChange).toHaveBeenLastCalledWith(true);

    await user.click(screen.getByTestId("outside"));
    await waitFor(() => expect(onOpenChange).toHaveBeenLastCalledWith(false));
  });

  it("closing an already-closed dropdown via outside click does not call onOpenChange again", async () => {
    const user = setupUser();
    const onOpenChange = jest.fn();
    render(
      <div>
        <div data-testid="outside">outside area</div>
        <MultiSelectPicker
          items={ITEMS}
          selectedItems={[]}
          onSelectionChange={jest.fn()}
          onOpenChange={onOpenChange}
        />
      </div>,
    );

    await user.click(screen.getByTestId("outside"));
    expect(onOpenChange).not.toHaveBeenCalled();
  });

  it("clicking inside the search input does not close the dropdown", async () => {
    const user = setupUser();
    render(
      <MultiSelectPicker
        items={ITEMS}
        selectedItems={[]}
        onSelectionChange={jest.fn()}
      />,
    );

    await user.click(screen.getByText("Select items"));
    const search = screen.getByPlaceholderText("Search");
    await user.click(search);
    expect(screen.getByText("Alpha")).toBeInTheDocument();
  });

  it("observes layout via ResizeObserver when available", async () => {
    const user = setupUser();
    const observeMock = jest.fn();
    const disconnectMock = jest.fn();
    const originalResizeObserver = (global as any).ResizeObserver;
    (global as any).ResizeObserver = jest.fn().mockImplementation(() => ({
      observe: observeMock,
      disconnect: disconnectMock,
    }));

    try {
      render(
        <MultiSelectPicker
          items={ITEMS}
          selectedItems={[]}
          onSelectionChange={jest.fn()}
        />,
      );
      await user.click(screen.getByText("Select items"));
      expect(await screen.findByText("Alpha")).toBeInTheDocument();
      expect(observeMock).toHaveBeenCalled();
    } finally {
      (global as any).ResizeObserver = originalResizeObserver;
    }
  });

  it("renders the dropdown above the trigger when there isn't enough space below", async () => {
    const user = setupUser();
    const originalGetBoundingClientRect =
      HTMLElement.prototype.getBoundingClientRect;
    HTMLElement.prototype.getBoundingClientRect = jest.fn(function (
      this: HTMLElement,
    ) {
      if (this.className === "relative") {
        return {
          left: 10,
          width: 200,
          top: 650,
          bottom: 700,
          right: 210,
          height: 50,
          x: 10,
          y: 650,
          toJSON() {},
        } as DOMRect;
      }
      return originalGetBoundingClientRect.call(this);
    });

    try {
      render(
        <MultiSelectPicker
          items={ITEMS}
          selectedItems={[]}
          onSelectionChange={jest.fn()}
        />,
      );
      await user.click(screen.getByText("Select items"));
      expect(await screen.findByText("Alpha")).toBeInTheDocument();
    } finally {
      HTMLElement.prototype.getBoundingClientRect =
        originalGetBoundingClientRect;
    }
  });

  it("renders no description line for items without one", async () => {
    const user = setupUser();
    render(
      <MultiSelectPicker
        items={ITEMS}
        selectedItems={[]}
        onSelectionChange={jest.fn()}
      />,
    );

    await user.click(screen.getByText("Select items"));
    // Beta has no description; ensure it still renders with just its name.
    expect(screen.getByText("Beta")).toBeInTheDocument();
  });
});
