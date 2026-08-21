import React from "react";
import { render, screen, setupUser } from "@/test-utils";
import {
  CorrectedToolCallsEditor,
  callsToEditable,
  editableToStoredCalls,
} from "../CorrectedToolCallsEditor";

describe("callsToEditable", () => {
  it("collapses match specs to plain strings", () => {
    expect(
      callsToEditable([
        {
          tool: "book_flight",
          arguments: {
            city: { match_type: "llm_judge", criteria: "a valid city" },
            seat: { match_type: "exact", value: "12A" },
            note: { match_type: "any" },
            count: 3,
          },
        },
      ]),
    ).toEqual([
      {
        tool: "book_flight",
        args: [
          { key: "city", value: "a valid city" },
          { key: "seat", value: "12A" },
          { key: "note", value: "" },
          { key: "count", value: "3" },
        ],
      },
    ]);
  });
});

describe("editableToStoredCalls", () => {
  it("parses JSON values, drops empty tools/keys", () => {
    expect(
      editableToStoredCalls([
        {
          tool: "book_flight",
          args: [
            { key: "count", value: "3" },
            { key: "city", value: "NYC" },
            { key: "", value: "ignored" },
          ],
        },
        { tool: "  ", args: [{ key: "x", value: "1" }] },
      ]),
    ).toEqual([{ tool: "book_flight", arguments: { count: 3, city: "NYC" } }]);
  });
});

describe("CorrectedToolCallsEditor", () => {
  it("adds a tool call on click", async () => {
    const user = setupUser();
    const onChange = jest.fn();
    render(<CorrectedToolCallsEditor value={[]} onChange={onChange} />);
    await user.click(screen.getByText("+ Add tool call"));
    expect(onChange).toHaveBeenCalledWith([{ tool: "", args: [] }]);
  });
});
