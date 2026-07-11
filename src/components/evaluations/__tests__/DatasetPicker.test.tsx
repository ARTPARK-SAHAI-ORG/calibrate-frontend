import { render, screen, setupUser } from "@/test-utils";
import { DatasetPicker } from "../DatasetPicker";
import { Dataset } from "@/lib/datasets";

const makeDataset = (overrides: Partial<Dataset> = {}): Dataset =>
  ({
    uuid: "ds-1",
    name: "Dataset One",
    item_count: 5,
    updated_at: "2024-01-15T10:00:00Z",
    ...overrides,
  }) as Dataset;

describe("DatasetPicker", () => {
  it("renders 'No datasets yet' when the list is empty", () => {
    render(<DatasetPicker datasets={[]} selectedId="" onSelect={jest.fn()} />);
    expect(screen.getByText("No datasets yet")).toBeInTheDocument();
  });

  it("renders dataset rows with name, item count and formatted date", () => {
    const datasets = [makeDataset()];
    render(
      <DatasetPicker datasets={datasets} selectedId="" onSelect={jest.fn()} />,
    );
    expect(screen.getByText("Dataset One")).toBeInTheDocument();
    expect(screen.getByText("5")).toBeInTheDocument();
    expect(screen.getByText("Jan 15, 2024")).toBeInTheDocument();
  });

  it("calls onSelect with the uuid when a row with items is clicked", async () => {
    const user = setupUser();
    const onSelect = jest.fn();
    const datasets = [makeDataset()];
    render(
      <DatasetPicker datasets={datasets} selectedId="" onSelect={onSelect} />,
    );
    await user.click(screen.getByText("Dataset One"));
    expect(onSelect).toHaveBeenCalledWith("ds-1");
  });

  it("shows a check icon and highlights the selected row", () => {
    const datasets = [makeDataset()];
    render(
      <DatasetPicker
        datasets={datasets}
        selectedId="ds-1"
        onSelect={jest.fn()}
      />,
    );
    const row = screen.getByRole("button", { name: /Dataset One/ });
    expect(row.className).toContain("bg-foreground/5");
  });

  it("disables and does not call onSelect for datasets with zero items", async () => {
    const user = setupUser();
    const onSelect = jest.fn();
    const datasets = [makeDataset({ item_count: 0 })];
    render(
      <DatasetPicker datasets={datasets} selectedId="" onSelect={onSelect} />,
    );
    const button = screen.getByRole("button", { name: /Dataset One/ });
    expect(button).toBeDisabled();
    await user.click(button);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("treats missing item_count as zero items (disabled)", () => {
    const datasets = [makeDataset({ item_count: undefined })];
    render(
      <DatasetPicker datasets={datasets} selectedId="" onSelect={jest.fn()} />,
    );
    expect(screen.getByRole("button", { name: /Dataset One/ })).toBeDisabled();
  });

  it("filters datasets by search text (case-insensitive)", async () => {
    const user = setupUser();
    const datasets = [
      makeDataset({ uuid: "1", name: "Alpha Set" }),
      makeDataset({ uuid: "2", name: "Beta Set" }),
    ];
    render(
      <DatasetPicker datasets={datasets} selectedId="" onSelect={jest.fn()} />,
    );

    await user.type(screen.getByPlaceholderText("Search datasets"), "alpha");
    expect(screen.getByText("Alpha Set")).toBeInTheDocument();
    expect(screen.queryByText("Beta Set")).not.toBeInTheDocument();
  });

  it("shows 'No datasets match your search' when search yields nothing but datasets exist", async () => {
    const user = setupUser();
    const datasets = [makeDataset({ name: "Alpha Set" })];
    render(
      <DatasetPicker datasets={datasets} selectedId="" onSelect={jest.fn()} />,
    );

    await user.type(
      screen.getByPlaceholderText("Search datasets"),
      "nonexistent",
    );
    expect(
      screen.getByText("No datasets match your search"),
    ).toBeInTheDocument();
  });

  it("does not mark a zero-item dataset selected even if its uuid matches selectedId", () => {
    const datasets = [makeDataset({ item_count: 0 })];
    render(
      <DatasetPicker
        datasets={datasets}
        selectedId="ds-1"
        onSelect={jest.fn()}
      />,
    );
    // No check icon rendered for a disabled row even when selectedId matches.
    const button = screen.getByRole("button", { name: /Dataset One/ });
    expect(button.className).not.toContain("bg-foreground/5");
  });
});
