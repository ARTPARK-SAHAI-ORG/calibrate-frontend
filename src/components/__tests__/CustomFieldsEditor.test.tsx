import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import {
  CustomFieldsEditor,
  deriveInputs,
  seedInputRows,
  type InputRow,
} from "@/components/CustomFieldsEditor";

const rows: InputRow[] = [
  { key: "city", type: "text", value: "Pune" },
  { key: "age", type: "number", value: "3" },
];

describe("CustomFieldsEditor", () => {
  it("adds a row when 'Add field' is clicked", async () => {
    const user = setupUser();
    const onRowsChange = jest.fn();
    render(
      <CustomFieldsEditor rows={rows} errors={{}} onRowsChange={onRowsChange} />,
    );

    await user.click(screen.getByRole("button", { name: "Add field" }));

    expect(onRowsChange).toHaveBeenCalledWith([
      ...rows,
      { key: "", type: "text", value: "" },
    ]);
  });

  it("removes a row when its remove button is clicked", async () => {
    const user = setupUser();
    const onRowsChange = jest.fn();
    render(
      <CustomFieldsEditor rows={rows} errors={{}} onRowsChange={onRowsChange} />,
    );

    await user.click(screen.getAllByRole("button", { name: "Remove field" })[0]);

    expect(onRowsChange).toHaveBeenCalledWith([rows[1]]);
  });

  it("reports a field-name edit through onRowsChange", async () => {
    const user = setupUser();
    const onRowsChange = jest.fn();
    render(
      <CustomFieldsEditor rows={rows} errors={{}} onRowsChange={onRowsChange} />,
    );

    const nameInput = screen.getByDisplayValue("city");
    await user.type(nameInput, "X");

    // Controlled input: last change fires with the appended char on row 0.
    expect(onRowsChange).toHaveBeenLastCalledWith([
      { ...rows[0], key: "cityX" },
      rows[1],
    ]);
  });

  it("coerces the value when the type changes to boolean", async () => {
    const user = setupUser();
    const onRowsChange = jest.fn();
    render(
      <CustomFieldsEditor rows={rows} errors={{}} onRowsChange={onRowsChange} />,
    );

    const typeSelect = screen.getAllByLabelText("Field type")[0];
    await user.selectOptions(typeSelect, "boolean");

    expect(onRowsChange).toHaveBeenCalledWith([
      { key: "city", type: "boolean", value: false },
      rows[1],
    ]);
  });

  it("shows the per-row error text", () => {
    render(
      <CustomFieldsEditor
        rows={rows}
        errors={{ 0: "Reserved name" }}
        onRowsChange={jest.fn()}
      />,
    );
    expect(screen.getByText("Reserved name")).toBeInTheDocument();
  });

  it("disables inputs and buttons when disabled", () => {
    render(
      <CustomFieldsEditor
        rows={rows}
        errors={{}}
        onRowsChange={jest.fn()}
        disabled
      />,
    );
    expect(screen.getByDisplayValue("city")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Add field" })).toBeDisabled();
    expect(
      screen.getAllByRole("button", { name: "Remove field" })[0],
    ).toBeDisabled();
  });
});

describe("deriveInputs", () => {
  it("coerces number, boolean, and json values", () => {
    const { inputs, errors } = deriveInputs([
      { key: "n", type: "number", value: "42" },
      { key: "b", type: "boolean", value: true },
      { key: "j", type: "json", value: '{"a":1}' },
    ]);
    expect(errors).toEqual({});
    expect(inputs).toEqual({ n: 42, b: true, j: { a: 1 } });
  });

  it("uses null for empty text and number values", () => {
    const { inputs, errors } = deriveInputs([
      { key: "t", type: "text", value: "" },
      { key: "n", type: "number", value: "" },
    ]);
    expect(errors).toEqual({});
    expect(inputs).toEqual({ t: null, n: null });
  });

  it("flags reserved and duplicate names", () => {
    const { errors } = deriveInputs([
      { key: "messages", type: "text", value: "x" },
      { key: "dup", type: "text", value: "1" },
      { key: "dup", type: "text", value: "2" },
    ]);
    expect(errors[0]).toBe("Reserved name");
    expect(errors[2]).toBe("Duplicate name");
  });
});

describe("seedInputRows", () => {
  it("round-trips a typed map", () => {
    const rows = seedInputRows({ s: "hi", n: 5, b: false, o: { k: 1 } });
    expect(rows).toEqual([
      { key: "s", type: "text", value: "hi" },
      { key: "n", type: "number", value: "5" },
      { key: "b", type: "boolean", value: false },
      { key: "o", type: "json", value: JSON.stringify({ k: 1 }, null, 2) },
    ]);
  });
});
