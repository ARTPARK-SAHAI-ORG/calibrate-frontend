import React, { useState } from "react";
import { render, screen, setupUser } from "@/test-utils";
import {
  MAX_METADATA_ENTRIES,
  MetadataFieldsEditor,
  metadataRowErrors,
  metadataToRows,
  rowsToMetadata,
  type MetadataRow,
} from "../MetadataFieldsEditor";

function Harness({ initial }: { initial: MetadataRow[] }) {
  const [rows, setRows] = useState(initial);
  return <MetadataFieldsEditor rows={rows} onRowsChange={setRows} />;
}

describe("metadataRowErrors", () => {
  it("flags a value with no field name and a repeated field name", () => {
    expect(
      metadataRowErrors([
        { key: "", value: "x" },
        { key: "source", value: "a" },
        { key: " source ", value: "b" },
      ]),
    ).toEqual({ 0: "Enter a field name", 2: "Field names must be unique" });
  });

  it("ignores a row with nothing typed in it", () => {
    expect(metadataRowErrors([{ key: "", value: "" }])).toEqual({});
  });
});

describe("rowsToMetadata and metadataToRows", () => {
  it("trims the field name, keeps the value as typed, drops blank rows, and round-trips", () => {
    const rows: MetadataRow[] = [
      { key: " source ", value: " crm " },
      { key: "empty", value: "" },
      { key: "", value: "" },
    ];
    const entries = rowsToMetadata(rows);
    expect(entries).toEqual([
      { key: "source", value: " crm " },
      { key: "empty", value: "" },
    ]);
    expect(metadataToRows(entries)).toEqual(entries);
    expect(metadataToRows(null)).toEqual([]);
  });
});

describe("MetadataFieldsEditor", () => {
  it("adds, edits and removes rows and shows a row's error", async () => {
    const user = setupUser();
    render(<Harness initial={[{ key: "source", value: "crm" }]} />);

    await user.click(screen.getByRole("button", { name: "Add field" }));
    expect(screen.getAllByLabelText(/Metadata field name/)).toHaveLength(2);

    await user.type(screen.getByLabelText("Metadata value 2"), "x");
    expect(screen.getByText("Enter a field name")).toBeInTheDocument();

    await user.type(screen.getByLabelText("Metadata field name 2"), "source");
    expect(screen.getByText("Field names must be unique")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Remove metadata field 2" }));
    expect(screen.getAllByLabelText(/Metadata field name/)).toHaveLength(1);
    expect(screen.queryByText("Field names must be unique")).not.toBeInTheDocument();
  });

  it("caps field name and value length and stops adding rows at the limit", () => {
    const full = Array.from({ length: MAX_METADATA_ENTRIES }, (_, i) => ({ key: `k${i}`, value: "v" }));
    render(<Harness initial={full} />);
    expect(screen.queryByRole("button", { name: "Add field" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Metadata field name 1")).toHaveAttribute("maxlength", "256");
    expect(screen.getByLabelText("Metadata value 1")).toHaveAttribute("maxlength", "8192");
  });
});
