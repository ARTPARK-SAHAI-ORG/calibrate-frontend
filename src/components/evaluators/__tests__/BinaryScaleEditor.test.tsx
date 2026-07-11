import { render, screen, setupUser } from "@/test-utils";
import {
  BinaryScaleEditor,
  defaultBinaryScale,
  type BinaryScaleRow,
} from "../BinaryScaleEditor";
import {
  DEFAULT_BINARY_TRUE_LABEL,
  DEFAULT_BINARY_FALSE_LABEL,
} from "@/lib/binaryLabels";

describe("defaultBinaryScale", () => {
  it("returns a true row and a false row with empty name/description", () => {
    const rows = defaultBinaryScale();
    expect(rows).toEqual([
      { value: true, name: "", description: "" },
      { value: false, name: "", description: "" },
    ]);
  });
});

describe("BinaryScaleEditor", () => {
  function setup(rows: BinaryScaleRow[] = defaultBinaryScale()) {
    const onChange = jest.fn();
    render(<BinaryScaleEditor rows={rows} onChange={onChange} />);
    return { onChange };
  }

  it("renders labels heading and helper text", () => {
    setup();
    expect(screen.getByText("Labels")).toBeInTheDocument();
    expect(
      screen.getByText("Set the labels shown for Yes/No across the task"),
    ).toBeInTheDocument();
  });

  it("renders True and False badges", () => {
    setup();
    expect(screen.getByText("True")).toBeInTheDocument();
    expect(screen.getByText("False")).toBeInTheDocument();
  });

  it("uses default true/false placeholders when name is empty", () => {
    setup();
    const inputs = screen.getAllByRole("textbox").filter((el) => el.tagName === "INPUT");
    expect(inputs[0]).toHaveAttribute("placeholder", DEFAULT_BINARY_TRUE_LABEL);
    expect(inputs[1]).toHaveAttribute("placeholder", DEFAULT_BINARY_FALSE_LABEL);
  });

  it("calls onChange with updated name for the true row", async () => {
    const user = setupUser();
    const { onChange } = setup();
    const inputs = screen.getAllByRole("textbox").filter((el) => el.tagName === "INPUT");
    await user.type(inputs[0], "Y");
    expect(onChange).toHaveBeenCalledWith([
      { value: true, name: "Y", description: "" },
      { value: false, name: "", description: "" },
    ]);
  });

  it("calls onChange with updated name for the false row", async () => {
    const user = setupUser();
    const { onChange } = setup();
    const inputs = screen.getAllByRole("textbox").filter((el) => el.tagName === "INPUT");
    await user.type(inputs[1], "N");
    expect(onChange).toHaveBeenCalledWith([
      { value: true, name: "", description: "" },
      { value: false, name: "N", description: "" },
    ]);
  });

  it("calls onChange with updated description", async () => {
    const user = setupUser();
    const { onChange } = setup();
    const textareas = screen.getAllByPlaceholderText(/Criteria for the response/);
    await user.type(textareas[0], "D");
    expect(onChange).toHaveBeenCalledWith([
      { value: true, name: "", description: "D" },
      { value: false, name: "", description: "" },
    ]);
  });

  it("preserves existing patch fields on other rows when one row changes", () => {
    const rows: BinaryScaleRow[] = [
      { value: true, name: "Yep", description: "yes desc" },
      { value: false, name: "Nope", description: "no desc" },
    ];
    const onChange = jest.fn();
    render(<BinaryScaleEditor rows={rows} onChange={onChange} />);
    const inputs = screen.getAllByRole("textbox").filter((el) => el.tagName === "INPUT");
    expect(inputs[0]).toHaveValue("Yep");
    expect(inputs[1]).toHaveValue("Nope");
  });
});
