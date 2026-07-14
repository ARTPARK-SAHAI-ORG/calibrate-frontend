import {
  parseItemNameConflictFromError,
  perRowNameConflictMessage,
  rowNameErrorsFromConflict,
} from "../itemNameConflict";

describe("parseItemNameConflictFromError", () => {
  it("parses ITEM_NAME_CONFLICT with a single name", () => {
    const err = new Error(
      'Request failed: 400 - {"detail":{"code":"ITEM_NAME_CONFLICT","conflicting_names":["asd"]}}',
    );
    expect(parseItemNameConflictFromError(err)).toEqual({
      code: "ITEM_NAME_CONFLICT",
      conflictingNames: ["asd"],
      message: 'An item named "asd" already exists in this task',
    });
  });

  it("parses ITEM_NAME_DUPLICATE_IN_REQUEST", () => {
    const err = new Error(
      'Request failed: 400 - {"detail":{"code":"ITEM_NAME_DUPLICATE_IN_REQUEST","conflicting_names":["A","A"]}}',
    );
    expect(parseItemNameConflictFromError(err)?.code).toBe(
      "ITEM_NAME_DUPLICATE_IN_REQUEST",
    );
  });

  it("returns null for unrelated errors", () => {
    expect(
      parseItemNameConflictFromError(
        new Error('Request failed: 500 - {"detail":"boom"}'),
      ),
    ).toBeNull();
  });
});

describe("rowNameErrorsFromConflict", () => {
  it("maps conflicting names onto matching row ids", () => {
    const conflict = {
      code: "ITEM_NAME_CONFLICT" as const,
      conflictingNames: ["Clip 2"],
      message: 'An item named "Clip 2" already exists in this task',
    };
    expect(
      rowNameErrorsFromConflict(
        [
          { id: "r1", name: "Clip 1" },
          { id: "r2", name: "  Clip 2  " },
        ],
        conflict,
      ),
    ).toEqual({
      r2: 'An item named "Clip 2" already exists in this task',
    });
  });

  it("returns empty when no rows match", () => {
    expect(
      rowNameErrorsFromConflict(
        [{ id: "r1", name: "Other" }],
        {
          code: "ITEM_NAME_CONFLICT",
          conflictingNames: ["Missing"],
          message: "x",
        },
      ),
    ).toEqual({});
  });

  it("attaches a name-less conflict to the sole row", () => {
    expect(
      rowNameErrorsFromConflict([{ id: "r1", name: "Only" }], {
        code: "ITEM_NAME_CONFLICT",
        conflictingNames: [],
        message: "generic message",
      }),
    ).toEqual({ r1: "generic message" });
  });

  it("returns empty for a name-less conflict when there are multiple rows", () => {
    expect(
      rowNameErrorsFromConflict(
        [
          { id: "r1", name: "A" },
          { id: "r2", name: "B" },
        ],
        {
          code: "ITEM_NAME_CONFLICT",
          conflictingNames: [],
          message: "generic",
        },
      ),
    ).toEqual({});
  });
});

describe("perRowNameConflictMessage", () => {
  it("uses a singular conflict message for ITEM_NAME_CONFLICT", () => {
    expect(
      perRowNameConflictMessage("Foo", {
        code: "ITEM_NAME_CONFLICT",
        conflictingNames: ["Foo", "Bar"],
        message: "plural",
      }),
    ).toBe('An item named "Foo" already exists in this task');
  });

  it("uses a duplicate-in-request message for that code", () => {
    expect(
      perRowNameConflictMessage("Foo", {
        code: "ITEM_NAME_DUPLICATE_IN_REQUEST",
        conflictingNames: ["Foo"],
        message: "x",
      }),
    ).toBe('Duplicate name in your request: "Foo"');
  });
});
