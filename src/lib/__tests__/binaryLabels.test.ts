import {
  DEFAULT_BINARY_TRUE_LABEL,
  DEFAULT_BINARY_FALSE_LABEL,
  defaultBinaryLabel,
  coerceBinaryValue,
  getBinaryDescription,
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
      { value: 1, name: "One", description: null },
      { value: 2, name: null, description: null },
    ]);
  });

  it("returns empty array when scale has no numeric entries", () => {
    expect(toRatingScale([{ value: true }, { value: "x" }])).toEqual([]);
  });

  it("carries the per-level description through, trimming blanks to null", () => {
    expect(
      toRatingScale([
        { value: 1, name: "One", description: "  Ignores the question.  " },
        { value: 2, name: "Two", description: "   " },
      ]),
    ).toEqual([
      { value: 1, name: "One", description: "Ignores the question." },
      { value: 2, name: "Two", description: null },
    ]);
  });
});

describe("getBinaryDescription", () => {
  it("returns null when there is no scale or no matching entry", () => {
    expect(getBinaryDescription(null, true)).toBeNull();
    expect(getBinaryDescription(undefined, false)).toBeNull();
    expect(getBinaryDescription([{ value: false, description: "x" }], true)).toBeNull();
  });

  it("returns null for a blank or missing description", () => {
    expect(getBinaryDescription([{ value: true }], true)).toBeNull();
    expect(getBinaryDescription([{ value: true, description: "  " }], true)).toBeNull();
    expect(getBinaryDescription([{ value: true, description: null }], true)).toBeNull();
  });

  it("returns the trimmed description, matching alternate value encodings", () => {
    expect(
      getBinaryDescription([{ value: true, description: "  Answers fully.  " }], true),
    ).toBe("Answers fully.");
    expect(getBinaryDescription([{ value: 0, description: "Wrong." }], false)).toBe(
      "Wrong.",
    );
    expect(getBinaryDescription([{ value: "yes", description: "Right." }], true)).toBe(
      "Right.",
    );
  });
});
