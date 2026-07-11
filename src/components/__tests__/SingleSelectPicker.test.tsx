import { act, render, screen, setupUser, within } from "@/test-utils";
import { SingleSelectPicker } from "../SingleSelectPicker";

type Item = { id: string; name: string };

const items: Item[] = [
  { id: "1", name: "Alpha" },
  { id: "2", name: "Beta" },
  { id: "3", name: "Gamma" },
];

function renderPicker(overrides: Partial<React.ComponentProps<typeof SingleSelectPicker<Item>>> = {}) {
  const onSelect = jest.fn();
  const utils = render(
    <SingleSelectPicker<Item>
      items={items}
      selectedId={null}
      onSelect={onSelect}
      getId={(it) => it.id}
      renderTrigger={(it) => (it ? it.name : "")}
      renderOption={(it, isSelected) => (
        <span>
          {it.name} {isSelected ? "(selected)" : ""}
        </span>
      )}
      {...overrides}
    />,
  );
  return { onSelect, ...utils };
}

describe("SingleSelectPicker", () => {
  it("renders the placeholder when nothing is selected", () => {
    renderPicker({ placeholder: "Pick one" });
    expect(screen.getByText("Pick one")).toBeInTheDocument();
  });

  it("renders the selected item's trigger content", () => {
    renderPicker({ selectedId: "2" });
    expect(screen.getByRole("button", { hidden: true, name: /Beta/ })).toBeInTheDocument();
  });

  it("renders a label when provided", () => {
    renderPicker({ label: "Choose item" });
    expect(screen.getByText("Choose item")).toBeInTheDocument();
  });

  it("opens the dropdown on trigger click and lists options", async () => {
    const user = setupUser();
    renderPicker();
    const trigger = screen.getByRole("button", { expanded: false });
    await user.click(trigger);

    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(3);
  });

  it("selects an option and closes the dropdown", async () => {
    const user = setupUser();
    const { onSelect } = renderPicker();
    await user.click(screen.getByRole("button", { expanded: false }));
    const option = screen.getByRole("option", { name: /Beta/ });
    await user.click(option);

    expect(onSelect).toHaveBeenCalledWith(items[1]);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes when clicking the overlay behind the dropdown", async () => {
    const user = setupUser();
    renderPicker();
    await user.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    const overlay = document.querySelector(".fixed.inset-0.z-\\[99\\]") as HTMLElement;
    await user.click(overlay);

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("closes on Escape from the trigger", async () => {
    const user = setupUser();
    renderPicker();
    const trigger = screen.getByRole("button", { expanded: false });
    await user.click(trigger);
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    trigger.focus();
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("shows the loading state and hides options", async () => {
    const user = setupUser();
    renderPicker({ loading: true, loadingLabel: "Fetching..." });
    await user.click(screen.getByRole("button", { expanded: false }));

    expect(screen.getByText("Fetching...")).toBeInTheDocument();
    expect(screen.queryByRole("option")).not.toBeInTheDocument();
  });

  it("shows the empty state when there are no items", async () => {
    const user = setupUser();
    renderPicker({ items: [], emptyLabel: "Nothing here" });
    await user.click(screen.getByRole("button", { expanded: false }));

    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });

  it("filters items via the search input when matchesSearch is provided", async () => {
    const user = setupUser();
    renderPicker({
      matchesSearch: (it, q) => it.name.toLowerCase().includes(q.toLowerCase()),
    });
    await user.click(screen.getByRole("button", { expanded: false }));

    const search = screen.getByPlaceholderText("Search");
    await user.type(search, "be");

    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(1);
    expect(within(options[0]).getByText(/Beta/)).toBeInTheDocument();
  });

  it("does not render a search input when matchesSearch is absent", async () => {
    const user = setupUser();
    renderPicker();
    await user.click(screen.getByRole("button", { expanded: false }));

    expect(screen.queryByPlaceholderText("Search")).not.toBeInTheDocument();
  });

  it("closes on Escape from the search input without bubbling to the trigger handler", async () => {
    const user = setupUser();
    renderPicker({
      matchesSearch: (it, q) => it.name.toLowerCase().includes(q.toLowerCase()),
    });
    await user.click(screen.getByRole("button", { expanded: false }));
    const search = screen.getByPlaceholderText("Search");
    search.focus();
    await user.keyboard("{Escape}");

    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("clicking the search input itself does not close the dropdown", async () => {
    const user = setupUser();
    renderPicker({
      matchesSearch: (it, q) => it.name.toLowerCase().includes(q.toLowerCase()),
    });
    await user.click(screen.getByRole("button", { expanded: false }));
    const search = screen.getByPlaceholderText("Search");
    await user.click(search);

    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("does not open when disabled", async () => {
    const user = setupUser();
    renderPicker({ disabled: true });
    const trigger = screen.getByRole("button");
    expect(trigger).toBeDisabled();
    await user.click(trigger);
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
  });

  it("does not render the chevron icon when disabled", () => {
    renderPicker({ disabled: true });
    expect(document.querySelector("svg")).not.toBeInTheDocument();
  });

  it("applies the compact size classes", () => {
    renderPicker({ compact: true });
    const trigger = screen.getByRole("button", { expanded: false });
    expect(trigger.className).toContain("h-9");
  });

  it("marks the selected option with aria-selected", async () => {
    const user = setupUser();
    renderPicker({ selectedId: "3" });
    await user.click(screen.getByRole("button", { expanded: false }));

    const options = screen.getAllByRole("option");
    const selectedOption = options.find(
      (o) => o.getAttribute("aria-selected") === "true",
    );
    expect(selectedOption).toBeDefined();
    expect(within(selectedOption as HTMLElement).getByText(/Gamma/)).toBeInTheDocument();
  });

  it("sets aria-label on the trigger when ariaLabel is provided", () => {
    renderPicker({ ariaLabel: "item-picker" });
    expect(screen.getByLabelText("item-picker")).toBeInTheDocument();
  });

  it("repositions the dropdown on window resize while open", async () => {
    const user = setupUser();
    renderPicker();
    await user.click(screen.getByRole("button", { expanded: false }));
    expect(screen.getByRole("listbox")).toBeInTheDocument();

    // Should not throw when resize fires while open.
    act(() => {
      window.dispatchEvent(new Event("resize"));
    });
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("repositions the dropdown on scroll while open", async () => {
    const user = setupUser();
    renderPicker();
    await user.click(screen.getByRole("button", { expanded: false }));

    act(() => {
      window.dispatchEvent(new Event("scroll"));
    });
    expect(screen.getByRole("listbox")).toBeInTheDocument();
  });

  it("opens above the trigger when there isn't enough space below", async () => {
    const user = setupUser();
    renderPicker();
    const trigger = screen.getByRole("button", { expanded: false });

    jest.spyOn(trigger, "getBoundingClientRect").mockReturnValue({
      left: 0,
      top: 700,
      width: 100,
      bottom: 750,
      right: 100,
      height: 50,
      x: 0,
      y: 700,
      toJSON: () => {},
    } as DOMRect);
    Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });

    await user.click(trigger);
    const listbox = screen.getByRole("listbox");
    expect(listbox).toHaveStyle({ bottom: "108px" });
  });
});
