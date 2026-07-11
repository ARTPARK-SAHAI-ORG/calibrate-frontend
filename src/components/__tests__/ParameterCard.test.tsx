import { render, screen, setupUser } from "@/test-utils";
import { ParameterCard, Parameter } from "../ParameterCard";

// jsdom doesn't implement crypto.randomUUID; ParameterCard calls it when
// rendering an array's default item schema.
if (!global.crypto.randomUUID) {
  // @ts-expect-error - test-only polyfill
  global.crypto.randomUUID = () => "test-uuid";
}

function makeParam(overrides: Partial<Parameter> = {}): Parameter {
  return {
    id: "p1",
    dataType: "string",
    name: "field_one",
    description: "A field",
    required: false,
    ...overrides,
  };
}

function baseProps() {
  return {
    onUpdate: jest.fn(),
    onRemove: jest.fn(),
    onAddProperty: jest.fn(),
    onSetItems: jest.fn(),
    validationAttempted: false,
  };
}

describe("ParameterCard", () => {
  it("renders name, description, and data type for a top-level param", () => {
    render(
      <ParameterCard param={makeParam()} path={[]} {...baseProps()} />,
    );
    expect(screen.getByDisplayValue("field_one")).toBeInTheDocument();
    expect(screen.getByDisplayValue("A field")).toBeInTheDocument();
    expect(screen.getByRole("combobox")).toHaveValue("string");
  });

  it("updates the data type via the select", async () => {
    const user = setupUser();
    const props = baseProps();
    render(<ParameterCard param={makeParam()} path={["root"]} {...props} />);

    await user.selectOptions(screen.getByRole("combobox"), "boolean");
    expect(props.onUpdate).toHaveBeenCalledWith(["root", "p1"], {
      dataType: "boolean",
    });
  });

  it("updates the name field", async () => {
    const user = setupUser();
    const props = baseProps();
    render(<ParameterCard param={makeParam()} path={[]} {...props} />);

    const nameInput = screen.getByDisplayValue("field_one");
    await user.type(nameInput, "x");
    expect(props.onUpdate).toHaveBeenCalled();
  });

  it("updates the description field", async () => {
    const user = setupUser();
    const props = baseProps();
    render(<ParameterCard param={makeParam()} path={[]} {...props} />);

    const descInput = screen.getByDisplayValue("A field");
    await user.type(descInput, "!");
    expect(props.onUpdate).toHaveBeenCalled();
  });

  it("toggles required on checkbox click", async () => {
    const user = setupUser();
    const props = baseProps();
    render(
      <ParameterCard param={makeParam({ required: false })} path={["r"]} {...props} />,
    );

    await user.click(screen.getByText("Required").previousSibling as HTMLElement);
    expect(props.onUpdate).toHaveBeenCalledWith(["r", "p1"], { required: true });
  });

  it("shows the check icon when required is true", () => {
    render(
      <ParameterCard param={makeParam({ required: true })} path={[]} {...baseProps()} />,
    );
    // Required span present plus its checked button contains an svg check icon
    const requiredLabel = screen.getByText("Required");
    expect(requiredLabel.previousSibling?.firstChild).toBeTruthy();
  });

  it("hides the required checkbox when showRequired is false", () => {
    render(
      <ParameterCard
        param={makeParam()}
        path={[]}
        {...baseProps()}
        showRequired={false}
      />,
    );
    expect(screen.queryByText("Required")).not.toBeInTheDocument();
  });

  it("shows name-empty validation error when validationAttempted and name is blank", () => {
    render(
      <ParameterCard
        param={makeParam({ name: "" })}
        path={[]}
        {...baseProps()}
        validationAttempted={true}
      />,
    );
    expect(screen.getByText("Name cannot be empty")).toBeInTheDocument();
  });

  it("shows duplicate-name validation error", () => {
    render(
      <ParameterCard
        param={makeParam({ name: "dupe" })}
        path={[]}
        {...baseProps()}
        validationAttempted={true}
        siblingNames={["Dupe"]}
      />,
    );
    expect(
      screen.getByText("A parameter with this name already exists"),
    ).toBeInTheDocument();
  });

  it("shows description-required validation error", () => {
    render(
      <ParameterCard
        param={makeParam({ description: "" })}
        path={[]}
        {...baseProps()}
        validationAttempted={true}
      />,
    );
    expect(screen.getByText("Description cannot be empty")).toBeInTheDocument();
  });

  it("does not show description-required error when requireDescription is false", () => {
    render(
      <ParameterCard
        param={makeParam({ description: "" })}
        path={[]}
        {...baseProps()}
        validationAttempted={true}
        requireDescription={false}
      />,
    );
    expect(screen.queryByText("Description cannot be empty")).not.toBeInTheDocument();
    // The asterisk should also be gone (requireDescription controls it)
    expect(screen.getByText("Description", { exact: false })).toBeInTheDocument();
  });

  it("renders properties section and add-property button for object type", async () => {
    const user = setupUser();
    const props = baseProps();
    render(
      <ParameterCard
        param={makeParam({ dataType: "object", properties: [] })}
        path={["root"]}
        {...props}
      />,
    );
    expect(screen.getByText("Properties")).toBeInTheDocument();
    await user.click(screen.getByText("Add property"));
    expect(props.onAddProperty).toHaveBeenCalledWith(["root", "p1"]);
  });

  it("shows property validation error when object has no properties", () => {
    render(
      <ParameterCard
        param={makeParam({ dataType: "object", properties: [] })}
        path={[]}
        {...baseProps()}
        validationAttempted={true}
      />,
    );
    expect(screen.getByText("Add at least one property")).toBeInTheDocument();
  });

  it("recursively renders nested properties", () => {
    const nested: Parameter = {
      id: "child1",
      dataType: "string",
      name: "child_field",
      description: "child desc",
    };
    render(
      <ParameterCard
        param={makeParam({ dataType: "object", properties: [nested] })}
        path={[]}
        {...baseProps()}
      />,
    );
    expect(screen.getByDisplayValue("child_field")).toBeInTheDocument();
    expect(screen.getByDisplayValue("child desc")).toBeInTheDocument();
  });

  it("renders an array item card with a default string item when items is undefined", () => {
    render(
      <ParameterCard
        param={makeParam({ dataType: "array" })}
        path={[]}
        {...baseProps()}
      />,
    );
    expect(screen.getByText("Item")).toBeInTheDocument();
    // Array item card hides the Name field
    const comboboxes = screen.getAllByRole("combobox");
    expect(comboboxes.length).toBeGreaterThanOrEqual(2);
  });

  it("renders an array item card using the existing items schema", () => {
    const items: Parameter = {
      id: "item1",
      dataType: "number",
      name: "",
      description: "item desc",
    };
    render(
      <ParameterCard
        param={makeParam({ dataType: "array", items })}
        path={[]}
        {...baseProps()}
      />,
    );
    expect(screen.getByDisplayValue("item desc")).toBeInTheDocument();
  });

  it("updates the array item's data type via the items path", async () => {
    const user = setupUser();
    const props = baseProps();
    const items: Parameter = {
      id: "item1",
      dataType: "string",
      name: "",
      description: "",
    };
    render(
      <ParameterCard
        param={makeParam({ id: "arr", dataType: "array", items })}
        path={["root"]}
        {...props}
      />,
    );
    const comboboxes = screen.getAllByRole("combobox");
    // second combobox belongs to the nested array-item ParameterCard
    await user.selectOptions(comboboxes[1], "number");
    expect(props.onUpdate).toHaveBeenCalledWith(["root", "arr", "__items__"], {
      dataType: "number",
    });
  });

  it("updates the array item's description via the items path", async () => {
    const user = setupUser();
    const props = baseProps();
    const items: Parameter = {
      id: "item1",
      dataType: "string",
      name: "",
      description: "orig",
    };
    render(
      <ParameterCard
        param={makeParam({ id: "arr", dataType: "array", items })}
        path={["root"]}
        {...props}
      />,
    );
    const descInputs = screen.getAllByDisplayValue("orig");
    await user.type(descInputs[0], "!");
    expect(props.onUpdate).toHaveBeenCalled();
  });

  it("builds the nested items path for an array of arrays (isArrayItem branch)", () => {
    const innerItems: Parameter = {
      id: "inner",
      dataType: "string",
      name: "",
      description: "inner desc",
    };
    const outerItems: Parameter = {
      id: "outer",
      dataType: "array",
      name: "",
      description: "",
      items: innerItems,
    };
    render(
      <ParameterCard
        param={makeParam({ id: "arr", dataType: "array", items: outerItems })}
        path={["root"]}
        {...baseProps()}
      />,
    );
    // The innermost array-item card (for `innerItems`) renders its description.
    expect(screen.getByDisplayValue("inner desc")).toBeInTheDocument();
  });

  it("renders an object-type array item (array of objects) and adds a nested property via the isArrayItem path", async () => {
    const user = setupUser();
    const props = baseProps();
    const objectItems: Parameter = {
      id: "obj-item",
      dataType: "object",
      name: "",
      description: "",
      properties: [
        { id: "child1", dataType: "string", name: "child_field", description: "child desc" },
      ],
    };
    render(
      <ParameterCard
        param={makeParam({ id: "arr", dataType: "array", items: objectItems })}
        path={["root"]}
        {...props}
      />,
    );
    expect(screen.getByDisplayValue("child_field")).toBeInTheDocument();

    await user.click(screen.getByText("Add property"));
    expect(props.onAddProperty).toHaveBeenCalledWith(["root", "arr", "__items__"]);
  });

  it("calls onRemove with parent path and id when delete is clicked", async () => {
    const user = setupUser();
    const props = baseProps();
    render(
      <ParameterCard param={makeParam()} path={["parent"]} {...props} />,
    );
    await user.click(screen.getByText("Delete"));
    expect(props.onRemove).toHaveBeenCalledWith(["parent"], "p1");
  });

  it("hides the delete button when hideDelete is true", () => {
    render(
      <ParameterCard param={makeParam()} path={[]} {...baseProps()} hideDelete />,
    );
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
  });

  it("hides the delete button and name field for array items", () => {
    render(
      <ParameterCard
        param={makeParam()}
        path={[]}
        {...baseProps()}
        isArrayItem
      />,
    );
    expect(screen.queryByText("Delete")).not.toBeInTheDocument();
    expect(screen.queryByDisplayValue("field_one")).not.toBeInTheDocument();
  });
});
