import {
  blocksUse,
  formatRemovalDate,
  modelProblem,
  resolveSavedModel,
  type ModelAvailability,
} from "@/lib/modelAvailability";

const NOW = Date.parse("2026-11-25T00:00:00Z");

function availability(privacyAllowed: Set<string> | null = null): ModelAvailability {
  return {
    models: new Map([
      ["a/fine", { expiresOn: null }],
      ["a/past", { expiresOn: "2026-01-01" }],
      ["a/soon", { expiresOn: "2026-12-11" }],
    ]),
    privacyAllowed,
  };
}

describe("modelProblem", () => {
  it("is null while the list is not known or with no id", () => {
    expect(modelProblem("a/fine", null, NOW)).toBeNull();
    expect(modelProblem("", availability(), NOW)).toBeNull();
  });

  it("calls a missing model or one past its date retired", () => {
    expect(modelProblem("a/gone", availability(), NOW)).toEqual({ kind: "retired" });
    expect(modelProblem("a/past", availability(), NOW)).toEqual({ kind: "retired" });
  });

  it("calls a model outside the privacy list a privacy problem", () => {
    expect(modelProblem("a/fine", availability(new Set(["a/soon"])), NOW)).toEqual({
      kind: "privacy",
    });
  });

  it("warns about a date still to come", () => {
    expect(modelProblem("a/soon", availability(), NOW)).toEqual({
      kind: "soon",
      expiresOn: "2026-12-11",
    });
  });

  it("is null for a model that is fine", () => {
    expect(modelProblem("a/fine", availability(new Set(["a/fine"])), NOW)).toBeNull();
  });
});

describe("blocksUse", () => {
  it("blocks retired and privacy, not soon or none", () => {
    expect(blocksUse({ kind: "retired" })).toBe(true);
    expect(blocksUse({ kind: "privacy" })).toBe(true);
    expect(blocksUse({ kind: "soon", expiresOn: "2026-12-11" })).toBe(false);
    expect(blocksUse(null)).toBe(false);
  });
});

describe("formatRemovalDate", () => {
  it("writes the long and short forms", () => {
    expect(formatRemovalDate("2026-12-11")).toBe("11 December 2026");
    expect(formatRemovalDate("2026-12-11", true)).toBe("11 Dec");
  });
});

describe("resolveSavedModel", () => {
  it("uses the list's entry, else the id", () => {
    const providers = [{ slug: "a", name: "A", models: [{ id: "a/x", name: "X" }] }];
    expect(resolveSavedModel("a/x", providers)).toEqual({ id: "a/x", name: "X" });
    expect(resolveSavedModel("a/y", providers)).toEqual({ id: "a/y", name: "a/y" });
  });
});
