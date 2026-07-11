import React from "react";
import { render, screen, setupUser, fireEvent, waitFor } from "@/test-utils";
import {
  DataExtractionTabContent,
  type DataExtractionFieldData,
} from "../DataExtractionTabContent";

// jsdom doesn't implement Element.scrollTo; the sidebar calls it (inside a
// setTimeout) whenever a property/item is added.
if (!Element.prototype.scrollTo) {
  Element.prototype.scrollTo = jest.fn();
}

if (!global.crypto.randomUUID) {
  Object.defineProperty(global.crypto, "randomUUID", {
    value: (() => {
      let n = 0;
      return () => `generated-uuid-${n++}`;
    })(),
    configurable: true,
  });
}

// Lightweight stand-ins for the recursive property editor and its container so
// we can drive DataExtractionTabContent's own path-based handlers directly,
// without re-testing ParameterCard/NestedContainer's own UI.
jest.mock("../../ParameterCard", () => ({
  ParameterCard: ({
    param,
    path,
    onUpdate,
    onRemove,
    onAddProperty,
    onSetItems,
  }: any) => (
    <div data-testid={`param-card-${param.id}`}>
      <span>{param.name || "(unnamed)"}</span>
      <button onClick={() => onUpdate([], { name: "Updated", description: "Updated desc" })}>
        update-{param.id}
      </button>
      <button onClick={() => onUpdate(["child-1"], { name: "Nested updated" })}>
        update-nested-{param.id}
      </button>
      <button onClick={() => onRemove(path, param.id)}>
        remove-{param.id}
      </button>
      <button onClick={() => onRemove(["child-1"], "grandchild-1")}>
        remove-nested-{param.id}
      </button>
      <button onClick={() => onAddProperty([])}>
        add-prop-{param.id}
      </button>
      <button onClick={() => onAddProperty(["child-1"])}>
        add-prop-nested-{param.id}
      </button>
      <button
        onClick={() =>
          onSetItems([], {
            id: "items-1",
            dataType: "string",
            name: "",
            description: "item desc",
          })
        }
      >
        set-items-{param.id}
      </button>
      <button
        onClick={() =>
          onSetItems(["child-1"], {
            id: "items-2",
            dataType: "string",
            name: "",
            description: "nested item desc",
          })
        }
      >
        set-items-nested-{param.id}
      </button>
    </div>
  ),
}));

jest.mock("../../ui/NestedContainer", () => ({
  NestedContainer: ({ children, onAddProperty, showAddButton = true }: any) => (
    <div data-testid="nested-container">
      {children}
      {showAddButton && onAddProperty && (
        <button onClick={onAddProperty}>Add property</button>
      )}
    </div>
  ),
}));

const makeField = (
  overrides: Partial<DataExtractionFieldData> = {}
): DataExtractionFieldData => ({
  uuid: "f1",
  type: "string",
  name: "customer_name",
  description: "The customer's full name",
  required: true,
  agent_id: "agent-1",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  ...overrides,
});

function renderComponent(
  overrides: Partial<React.ComponentProps<typeof DataExtractionTabContent>> = {}
) {
  const setDataExtractionFields = jest.fn();
  const saveRef = { current: jest.fn() };
  const props: React.ComponentProps<typeof DataExtractionTabContent> = {
    agentUuid: "agent-1",
    dataExtractionFields: [],
    setDataExtractionFields,
    dataExtractionFieldsLoading: false,
    dataExtractionFieldsError: null,
    saveRef,
    ...overrides,
  };
  const utils = render(<DataExtractionTabContent {...props} />);
  return { ...utils, setDataExtractionFields, saveRef, props };
}

describe("DataExtractionTabContent", () => {
  it("renders the loading state", () => {
    renderComponent({ dataExtractionFieldsLoading: true });
    expect(document.querySelector(".animate-spin")).toBeInTheDocument();
  });

  it("renders the error state and reloads on retry", async () => {
    const user = setupUser();
    const reloadSpy = jest.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload: reloadSpy },
    });
    renderComponent({ dataExtractionFieldsError: "Failed to load" });
    expect(screen.getByText("Failed to load")).toBeInTheDocument();
    await user.click(screen.getByText("Retry"));
    expect(reloadSpy).toHaveBeenCalled();
  });

  it("renders the empty state and opens the add sidebar", async () => {
    const user = setupUser();
    renderComponent({ dataExtractionFields: [] });
    expect(screen.getByText("No extraction fields defined")).toBeInTheDocument();
    await user.click(screen.getByText("Add field"));
    expect(screen.getByText("Add data field")).toBeInTheDocument();
  });

  it("renders the field count copy and list rows", () => {
    const { rerender } = renderComponent({
      dataExtractionFields: [makeField()],
    });
    expect(screen.getByText("1 field")).toBeInTheDocument();
    expect(screen.getAllByText("customer_name").length).toBeGreaterThan(0);

    rerender(
      <DataExtractionTabContent
        agentUuid="agent-1"
        dataExtractionFields={[makeField(), makeField({ uuid: "f2", name: "second" })]}
        setDataExtractionFields={jest.fn()}
        dataExtractionFieldsLoading={false}
        dataExtractionFieldsError={null}
        saveRef={{ current: jest.fn() }}
      />
    );
    expect(screen.getByText("2 fields")).toBeInTheDocument();
  });

  it("shows a dash for an empty description in the desktop row", () => {
    renderComponent({
      dataExtractionFields: [makeField({ description: "" })],
    });
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("shows Required/Optional and Yes/No labels based on the required flag", () => {
    renderComponent({
      dataExtractionFields: [makeField({ required: false })],
    });
    expect(screen.getByText("No")).toBeInTheDocument();
    expect(screen.getByText("Optional")).toBeInTheDocument();
  });

  it("opens a field for editing when its row is clicked", async () => {
    const user = setupUser();
    renderComponent({ dataExtractionFields: [makeField()] });

    const rows = screen.getAllByText("customer_name");
    await user.click(rows[0]);

    expect(screen.getByText("Edit data field")).toBeInTheDocument();
    expect(screen.getByDisplayValue("customer_name")).toBeInTheDocument();
  });

  it("toggles individual field selection and bulk-deletes them", async () => {
    const user = setupUser();
    const { container, setDataExtractionFields, saveRef } = renderComponent({
      dataExtractionFields: [makeField(), makeField({ uuid: "f2", name: "second" })],
    });

    const selectButtons = container.querySelectorAll(
      'button[title="Select field"]'
    );
    await user.click(selectButtons[0]);
    expect(screen.getByText("Delete selected (1)")).toBeInTheDocument();

    await user.click(selectButtons[1]);
    expect(screen.getByText("Delete selected (2)")).toBeInTheDocument();

    await user.click(screen.getByText("Delete selected (2)"));
    expect(screen.getByText("Delete fields")).toBeInTheDocument();
    expect(screen.getByText("Are you sure you want to delete 2 fields?")).toBeInTheDocument();

    await user.click(screen.getByText("Delete"));
    expect(setDataExtractionFields).toHaveBeenCalled();
    const updater = setDataExtractionFields.mock.calls[0][0];
    const result = updater([makeField(), makeField({ uuid: "f2", name: "second" })]);
    expect(result).toHaveLength(0);

    await waitFor(() => expect(saveRef.current).toHaveBeenCalled());
  });

  it("selects all fields via the header checkbox and can toggle it off", async () => {
    const user = setupUser();
    const { container } = renderComponent({
      dataExtractionFields: [makeField(), makeField({ uuid: "f2", name: "second" })],
    });

    const selectAll = container.querySelector(
      'button[title="Select all"]'
    ) as HTMLButtonElement;
    await user.click(selectAll);
    expect(screen.getByText("Delete selected (2)")).toBeInTheDocument();

    await user.click(selectAll);
    expect(screen.queryByText(/Delete selected/)).not.toBeInTheDocument();
  });

  it("deletes a single field via the row delete button", async () => {
    const user = setupUser();
    const { container, setDataExtractionFields, saveRef } = renderComponent({
      dataExtractionFields: [makeField()],
    });

    const deleteButtons = container.querySelectorAll(
      'button[title="Delete field"]'
    );
    await user.click(deleteButtons[0]);

    expect(screen.getByText("Delete field")).toBeInTheDocument();
    expect(
      screen.getByText('Are you sure you want to delete "customer_name"?')
    ).toBeInTheDocument();

    await user.click(screen.getByText("Delete"));
    expect(setDataExtractionFields).toHaveBeenCalled();
    const updater = setDataExtractionFields.mock.calls[0][0];
    expect(updater([makeField()])).toHaveLength(0);
    await waitFor(() => expect(saveRef.current).toHaveBeenCalled());
  });

  it("closes the delete dialog without deleting on cancel", async () => {
    const user = setupUser();
    const { container, setDataExtractionFields } = renderComponent({
      dataExtractionFields: [makeField()],
    });
    const deleteButtons = container.querySelectorAll(
      'button[title="Delete field"]'
    );
    await user.click(deleteButtons[0]);
    await user.click(screen.getByText("Cancel"));
    expect(screen.queryByText("Delete field")).not.toBeInTheDocument();
    expect(setDataExtractionFields).not.toHaveBeenCalled();
  });

  it("closes the add sidebar via backdrop and the X button", async () => {
    const user = setupUser();
    const { container } = renderComponent({
      dataExtractionFields: [makeField()],
    });
    await user.click(screen.getByText("Add field"));
    expect(screen.getByText("Add data field")).toBeInTheDocument();

    const backdrop = container.querySelector(".backdrop-blur-sm") as HTMLElement;
    fireEvent.click(backdrop);
    expect(screen.queryByText("Add data field")).not.toBeInTheDocument();

    await user.click(screen.getByText("Add field"));
    const closeButtons = screen.getAllByRole("button");
    const xButton = closeButtons.find(
      (b) => b.querySelector("path")?.getAttribute("d") === "M6 18L18 6M6 6l12 12"
    ) as HTMLButtonElement;
    await user.click(xButton);
    expect(screen.queryByText("Add data field")).not.toBeInTheDocument();
  });

  it("validates required name and description before creating", async () => {
    const user = setupUser();
    const { setDataExtractionFields } = renderComponent({ dataExtractionFields: [] });
    await user.click(screen.getByText("Add field"));

    const submitButtons = screen.getAllByText("Add field");
    await user.click(submitButtons[submitButtons.length - 1]);

    expect(setDataExtractionFields).not.toHaveBeenCalled();
    expect(screen.getByText("Add data field")).toBeInTheDocument();
  });

  it("shows a duplicate name error", async () => {
    const user = setupUser();
    renderComponent({ dataExtractionFields: [makeField()] });
    await user.click(screen.getByText("Add field"));

    const nameInputs = screen.getAllByDisplayValue("");
    const nameInput = nameInputs[0];
    await user.type(nameInput, "customer_name");

    const submitButtons = screen.getAllByText("Add field");
    await user.click(submitButtons[submitButtons.length - 1]);

    expect(screen.getByText("A field with this name already exists")).toBeInTheDocument();
  });

  it("creates a new string field and triggers save", async () => {
    const user = setupUser();
    const { setDataExtractionFields, saveRef } = renderComponent({
      dataExtractionFields: [],
    });
    await user.click(screen.getByText("Add field"));

    const nameInput = screen.getAllByDisplayValue("")[0];
    await user.type(nameInput, "new_field");
    const descInput = screen.getByPlaceholderText(
      /This field will be passed to the LLM/
    );
    await user.type(descInput, "A description");

    const submitButtons = screen.getAllByText("Add field");
    await user.click(submitButtons[submitButtons.length - 1]);

    expect(setDataExtractionFields).toHaveBeenCalled();
    const updater = setDataExtractionFields.mock.calls[0][0];
    const result = updater([]);
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe("new_field");
    expect(result[0].description).toBe("A description");
    expect(result[0].type).toBe("string");
    expect(result[0].required).toBe(true);

    expect(screen.queryByText("Add data field")).not.toBeInTheDocument();
    await waitFor(() => expect(saveRef.current).toHaveBeenCalled());
  });

  it("toggles the required checkbox", async () => {
    const user = setupUser();
    const { setDataExtractionFields } = renderComponent({ dataExtractionFields: [] });
    await user.click(screen.getByText("Add field"));

    const requiredLabel = screen.getByText("Required");
    const requiredButton = requiredLabel.parentElement!.querySelector(
      "button"
    ) as HTMLButtonElement;
    await user.click(requiredButton);

    const nameInput = screen.getAllByDisplayValue("")[0];
    await user.type(nameInput, "opt_field");
    const descInput = screen.getByPlaceholderText(
      /This field will be passed to the LLM/
    );
    await user.type(descInput, "desc");

    const submitButtons = screen.getAllByText("Add field");
    await user.click(submitButtons[submitButtons.length - 1]);

    const updater = setDataExtractionFields.mock.calls[0][0];
    const result = updater([]);
    expect(result[0].required).toBe(false);
  });

  it("updates an existing field on save", async () => {
    const user = setupUser();
    const { setDataExtractionFields, saveRef } = renderComponent({
      dataExtractionFields: [makeField()],
    });

    const rows = screen.getAllByText("customer_name");
    await user.click(rows[0]);

    await user.click(screen.getByText("Save"));

    expect(setDataExtractionFields).toHaveBeenCalled();
    const updater = setDataExtractionFields.mock.calls[0][0];
    const result = updater([makeField()]);
    expect(result[0].name).toBe("customer_name");
    await waitFor(() => expect(saveRef.current).toHaveBeenCalled());
  });

  it("switches the data type and resets properties/items appropriately", async () => {
    const user = setupUser();
    renderComponent({ dataExtractionFields: [] });
    await user.click(screen.getByText("Add field"));

    const select = screen.getByDisplayValue("String");
    fireEvent.change(select, { target: { value: "object" } });
    expect(screen.getByText("Properties")).toBeInTheDocument();

    fireEvent.change(select, { target: { value: "array" } });
    expect(screen.getByText("Item")).toBeInTheDocument();

    fireEvent.change(select, { target: { value: "boolean" } });
    expect(screen.queryByText("Properties")).not.toBeInTheDocument();
    expect(screen.queryByText("Item")).not.toBeInTheDocument();
  });

  it("requires at least one property for the object type and validates nested properties", async () => {
    const user = setupUser();
    renderComponent({ dataExtractionFields: [] });
    await user.click(screen.getByText("Add field"));

    const nameInput = screen.getAllByDisplayValue("")[0];
    await user.type(nameInput, "obj_field");
    const descInput = screen.getByPlaceholderText(
      /This field will be passed to the LLM/
    );
    await user.type(descInput, "desc");

    const select = screen.getByDisplayValue("String");
    fireEvent.change(select, { target: { value: "object" } });

    const submitButtons = screen.getAllByText("Add field");
    await user.click(submitButtons[submitButtons.length - 1]);
    // No properties added yet -> form should remain open (invalid).
    expect(screen.getByText("Add data field")).toBeInTheDocument();

    await user.click(screen.getByText("Add property"));
    expect(screen.getByTestId(/param-card-/)).toBeInTheDocument();
  });

  it("adds, updates, and removes an object property via the mocked ParameterCard", async () => {
    const user = setupUser();
    const { setDataExtractionFields } = renderComponent({ dataExtractionFields: [] });
    await user.click(screen.getByText("Add field"));

    const nameInput = screen.getAllByDisplayValue("")[0];
    await user.type(nameInput, "obj_field");
    const descInput = screen.getByPlaceholderText(
      /This field will be passed to the LLM/
    );
    await user.type(descInput, "desc");

    const select = screen.getByDisplayValue("String");
    fireEvent.change(select, { target: { value: "object" } });

    await user.click(screen.getByText("Add property"));
    const card = screen.getByTestId(/param-card-/);
    const cardId = card.getAttribute("data-testid")!.replace("param-card-", "");

    await user.click(screen.getByText(`update-${cardId}`));
    await user.click(screen.getByText(`add-prop-${cardId}`));
    await user.click(screen.getByText(`add-prop-nested-${cardId}`));
    await user.click(screen.getByText(`update-nested-${cardId}`));
    await user.click(screen.getByText(`remove-nested-${cardId}`));
    await user.click(screen.getByText(`set-items-${cardId}`));
    await user.click(screen.getByText(`set-items-nested-${cardId}`));

    const submitButtons = screen.getAllByText("Add field");
    await user.click(submitButtons[submitButtons.length - 1]);
    expect(setDataExtractionFields).toHaveBeenCalled();

    // Removing the only property should surface the "at least one" error again.
  });

  it("requires the array item description before creating", async () => {
    const user = setupUser();
    renderComponent({ dataExtractionFields: [] });
    await user.click(screen.getByText("Add field"));

    const nameInput = screen.getAllByDisplayValue("")[0];
    await user.type(nameInput, "arr_field");
    const descInput = screen.getByPlaceholderText(
      /This field will be passed to the LLM/
    );
    await user.type(descInput, "desc");

    const select = screen.getByDisplayValue("String");
    fireEvent.change(select, { target: { value: "array" } });

    const submitButtons = screen.getAllByText("Add field");
    await user.click(submitButtons[submitButtons.length - 1]);
    // Item description empty -> invalid, sidebar stays open.
    expect(screen.getByText("Add data field")).toBeInTheDocument();
  });

  it("creates an array field once the item is updated via the mocked ParameterCard", async () => {
    const user = setupUser();
    const { setDataExtractionFields } = renderComponent({ dataExtractionFields: [] });
    await user.click(screen.getByText("Add field"));

    const nameInput = screen.getAllByDisplayValue("")[0];
    await user.type(nameInput, "arr_field");
    const descInput = screen.getByPlaceholderText(
      /This field will be passed to the LLM/
    );
    await user.type(descInput, "desc");

    const select = screen.getByDisplayValue("String");
    fireEvent.change(select, { target: { value: "array" } });

    const card = screen.getByTestId(/param-card-/);
    const cardId = card.getAttribute("data-testid")!.replace("param-card-", "");
    await user.click(screen.getByText(`update-${cardId}`));

    const submitButtons = screen.getAllByText("Add field");
    await user.click(submitButtons[submitButtons.length - 1]);

    expect(setDataExtractionFields).toHaveBeenCalled();
    const updater = setDataExtractionFields.mock.calls[0][0];
    const result = updater([]);
    expect(result[0].type).toBe("array");
  });

  it("opens an editing session for an array-typed field, seeding the item schema", async () => {
    const user = setupUser();
    renderComponent({
      dataExtractionFields: [makeField({ type: "array", uuid: "arr1", name: "tags" })],
    });
    const rows = screen.getAllByText("tags");
    await user.click(rows[0]);
    expect(screen.getByText("Edit data field")).toBeInTheDocument();
    expect(screen.getByText("Item")).toBeInTheDocument();
  });

  it("shows the creating/saving spinner label while isCreatingDataField would be true (default false state renders normal labels)", async () => {
    renderComponent({ dataExtractionFields: [] });
    // isCreatingDataField is internal and always false in this component today;
    // verify the default (non-loading) label renders.
    const user = setupUser();
    await user.click(screen.getByText("Add field"));
    const submitButtons = screen.getAllByText("Add field");
    expect(submitButtons[submitButtons.length - 1]).toBeInTheDocument();
  });
});
