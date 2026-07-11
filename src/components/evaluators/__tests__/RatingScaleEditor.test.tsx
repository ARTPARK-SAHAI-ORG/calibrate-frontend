import { render, screen, setupUser, fireEvent } from "@/test-utils";
import { RatingScaleEditor, type RatingScaleRow } from "../RatingScaleEditor";

function baseRows(): RatingScaleRow[] {
  return [
    { value: 1, name: "", description: "" },
    { value: 2, name: "", description: "" },
    { value: 3, name: "", description: "" },
  ];
}

describe("RatingScaleEditor", () => {
  function setup(overrides?: Partial<React.ComponentProps<typeof RatingScaleEditor<RatingScaleRow>>>) {
    const onChange = jest.fn();
    const props = {
      rows: baseRows(),
      onChange,
      validationAttempted: false,
      description: "Describe the scale",
      descriptionPlaceholder: "Criteria placeholder",
      ...overrides,
    };
    render(<RatingScaleEditor {...props} />);
    return { onChange, props };
  }

  it("renders the description text and required marker", () => {
    setup();
    expect(screen.getByText("Rating scale")).toBeInTheDocument();
    expect(screen.getByText("*")).toBeInTheDocument();
    expect(screen.getByText("Describe the scale")).toBeInTheDocument();
  });

  it("renders a number input, name input, and remove button per row", () => {
    setup();
    const numberInputs = screen.getAllByDisplayValue(/^[123]$/);
    expect(numberInputs).toHaveLength(3);
  });

  it("uses Bad/Average/Good placeholders for the first three rows, Label beyond", () => {
    const rows: RatingScaleRow[] = [
      { value: 1, name: "", description: "" },
      { value: 2, name: "", description: "" },
      { value: 3, name: "", description: "" },
      { value: 4, name: "", description: "" },
    ];
    setup({ rows });
    expect(screen.getByPlaceholderText("Bad")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Average")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Good")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Label")).toBeInTheDocument();
  });

  it("updates the row value when the number input changes", () => {
    const { onChange } = setup();
    const numberInputs = screen.getAllByDisplayValue(/^[123]$/);
    fireEvent.change(numberInputs[0], { target: { value: "5" } });
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall[0].value).toBe(5);
  });

  it("falls back to 0 when value input is cleared (NaN branch)", () => {
    const { onChange } = setup();
    const numberInputs = screen.getAllByDisplayValue(/^[123]$/);
    fireEvent.change(numberInputs[0], { target: { value: "" } });
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall[0].value).toBe(0);
  });

  it("updates the row name when the text input changes", () => {
    const { onChange } = setup();
    const nameInputs = screen.getAllByPlaceholderText(/Bad|Average|Good/);
    fireEvent.change(nameInputs[0], { target: { value: "Poor" } });
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall[0].name).toBe("Poor");
  });

  it("updates the row description when textarea changes", () => {
    const { onChange } = setup();
    const textareas = screen.getAllByPlaceholderText("Criteria placeholder");
    fireEvent.change(textareas[0], { target: { value: "Rubric" } });
    const lastCall = onChange.mock.calls[onChange.mock.calls.length - 1][0];
    expect(lastCall[0].description).toBe("Rubric");
  });

  it("shows red border on name input when validationAttempted and name is blank", () => {
    setup({ validationAttempted: true });
    const nameInputs = screen.getAllByPlaceholderText(/Bad|Average|Good/);
    expect(nameInputs[0].className).toContain("border-red-500");
  });

  it("does not show red border when validationAttempted is false", () => {
    setup({ validationAttempted: false });
    const nameInputs = screen.getAllByPlaceholderText(/Bad|Average|Good/);
    expect(nameInputs[0].className).not.toContain("border-red-500");
  });

  it("does not show red border when name has content even if validationAttempted", () => {
    const rows: RatingScaleRow[] = [
      { value: 1, name: "Bad", description: "" },
      { value: 2, name: "", description: "" },
    ];
    setup({ rows, validationAttempted: true });
    const nameInputs = screen.getAllByPlaceholderText(/Bad|Average|Good|Label/);
    expect(nameInputs[0].className).not.toContain("border-red-500");
  });

  it("disables remove button and shows tooltip when only two rows remain", () => {
    const rows: RatingScaleRow[] = [
      { value: 1, name: "", description: "" },
      { value: 2, name: "", description: "" },
    ];
    setup({ rows });
    const removeButtons = screen.getAllByTitle("At least two rows are required");
    expect(removeButtons).toHaveLength(2);
    removeButtons.forEach((btn) => expect(btn).toBeDisabled());
  });

  it("does not remove a row when disabled remove button is clicked (no-op guard)", async () => {
    const user = setupUser();
    const rows: RatingScaleRow[] = [
      { value: 1, name: "", description: "" },
      { value: 2, name: "", description: "" },
    ];
    const { onChange } = setup({ rows });
    const removeButtons = screen.getAllByTitle("At least two rows are required");
    await user.click(removeButtons[0]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it("enables remove button with 'Remove row' title when more than two rows", () => {
    setup();
    const removeButtons = screen.getAllByTitle("Remove row");
    expect(removeButtons).toHaveLength(3);
    removeButtons.forEach((btn) => expect(btn).not.toBeDisabled());
  });

  it("removes the correct row when remove button is clicked", async () => {
    const user = setupUser();
    const { onChange } = setup();
    const removeButtons = screen.getAllByTitle("Remove row");
    await user.click(removeButtons[1]);
    expect(onChange).toHaveBeenCalledWith([
      { value: 1, name: "", description: "" },
      { value: 3, name: "", description: "" },
    ]);
  });

  it("adds a new row with value = max + 1 when Add row is clicked", async () => {
    const user = setupUser();
    const { onChange } = setup();
    await user.click(screen.getByText("Add row"));
    expect(onChange).toHaveBeenCalledWith([
      ...baseRows(),
      { value: 4, name: "", description: "" },
    ]);
  });

  it("computes max using Number(value) fallback for string values", async () => {
    const user = setupUser();
    const rows: RatingScaleRow[] = [
      { value: "2", name: "", description: "" },
      { value: "5", name: "", description: "" },
    ];
    const onChange = jest.fn();
    render(
      <RatingScaleEditor
        rows={rows}
        onChange={onChange}
        validationAttempted={false}
        description="d"
        descriptionPlaceholder="p"
      />,
    );
    await user.click(screen.getByText("Add row"));
    expect(onChange).toHaveBeenCalledWith([
      ...rows,
      { value: 6, name: "", description: "" },
    ]);
  });

  it("treats non-numeric string value as 0 when computing max", async () => {
    const user = setupUser();
    const rows: RatingScaleRow[] = [{ value: "abc", name: "", description: "" }];
    const onChange = jest.fn();
    render(
      <RatingScaleEditor
        rows={rows}
        onChange={onChange}
        validationAttempted={false}
        description="d"
        descriptionPlaceholder="p"
      />,
    );
    await user.click(screen.getByText("Add row"));
    expect(onChange).toHaveBeenCalledWith([
      ...rows,
      { value: 1, name: "", description: "" },
    ]);
  });

  it("renders string-valued row's number input via Number() coercion display", () => {
    const rows: RatingScaleRow[] = [{ value: "7", name: "", description: "" }];
    render(
      <RatingScaleEditor
        rows={rows}
        onChange={jest.fn()}
        validationAttempted={false}
        description="d"
        descriptionPlaceholder="p"
      />,
    );
    expect(screen.getByDisplayValue("7")).toBeInTheDocument();
  });
});
