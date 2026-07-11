import {
  DEFAULT_BINARY_TRUE_LABEL,
  DEFAULT_BINARY_FALSE_LABEL,
  defaultBinaryLabel,
  coerceBinaryValue,
  getBinaryLabel,
  toRatingScale,
} from "../binaryLabels";

describe("defaultBinaryLabel", () => {
  it("returns Correct for true", () => {
    expect(defaultBinaryLabel(true)).toBe(DEFAULT_BINARY_TRUE_LABEL);
  });

  it("returns Wrong for false", () => {
    expect(defaultBinaryLabel(false)).toBe(DEFAULT_BINARY_FALSE_LABEL);
  });
});

describe("coerceBinaryValue", () => {
  it("passes booleans through", () => {
    expect(coerceBinaryValue(true)).toBe(true);
    expect(coerceBinaryValue(false)).toBe(false);
  });

  it("coerces numbers", () => {
    expect(coerceBinaryValue(1)).toBe(true);
    expect(coerceBinaryValue(0)).toBe(false);
    expect(coerceBinaryValue(2)).toBeNull();
  });

  it("coerces strings", () => {
    expect(coerceBinaryValue("true")).toBe(true);
    expect(coerceBinaryValue("YES")).toBe(true);
    expect(coerceBinaryValue("1")).toBe(true);
    expect(coerceBinaryValue("false")).toBe(false);
    expect(coerceBinaryValue("no")).toBe(false);
    expect(coerceBinaryValue("0")).toBe(false);
    expect(coerceBinaryValue("  TRUE  ")).toBe(true);
    expect(coerceBinaryValue("maybe")).toBeNull();
  });

  it("returns null for other types", () => {
    expect(coerceBinaryValue(null)).toBeNull();
    expect(coerceBinaryValue(undefined)).toBeNull();
    expect(coerceBinaryValue({})).toBeNull();
  });
});

describe("getBinaryLabel", () => {
  it("returns default when scale is null/undefined", () => {
    expect(getBinaryLabel(null, true)).toBe(DEFAULT_BINARY_TRUE_LABEL);
    expect(getBinaryLabel(undefined, false)).toBe(DEFAULT_BINARY_FALSE_LABEL);
  });

  it("returns default when no matching entry found", () => {
    expect(getBinaryLabel([{ value: 1 }], true)).toBe(DEFAULT_BINARY_TRUE_LABEL);
  });

  it("returns default when matching entry has blank name", () => {
    expect(getBinaryLabel([{ value: true, name: "   " }], true)).toBe(
      DEFAULT_BINARY_TRUE_LABEL,
    );
    expect(getBinaryLabel([{ value: true, name: null }], true)).toBe(
      DEFAULT_BINARY_TRUE_LABEL,
    );
  });

  it("returns custom name when present", () => {
    expect(getBinaryLabel([{ value: true, name: "Yes!" }], true)).toBe("Yes!");
  });

  it("matches coerced values like 1/0", () => {
    expect(getBinaryLabel([{ value: 1, name: "Match" }], true)).toBe("Match");
    expect(getBinaryLabel([{ value: 0, name: "NoMatch" }], false)).toBe("NoMatch");
  });
});

describe("toRatingScale", () => {
  it("returns null when scale is null/undefined", () => {
    expect(toRatingScale(null)).toBeNull();
    expect(toRatingScale(undefined)).toBeNull();
  });

  it("filters to numeric entries and maps names", () => {
    const result = toRatingScale([
      { value: 1, name: "One" },
      { value: true },
      { value: "x" },
      { value: 2, name: null },
    ]);
    expect(result).toEqual([
      { value: 1, name: "One" },
      { value: 2, name: null },
    ]);
  });

  it("returns empty array when scale has no numeric entries", () => {
    expect(toRatingScale([{ value: true }, { value: "x" }])).toEqual([]);
  });
});
