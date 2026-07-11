import { extractVariableNames } from "../evaluatorVariables";

describe("extractVariableNames", () => {
  it("returns empty array when no placeholders present", () => {
    expect(extractVariableNames("no vars here")).toEqual([]);
  });

  it("extracts a single variable", () => {
    expect(extractVariableNames("Hello {{name}}")).toEqual(["name"]);
  });

  it("extracts multiple unique variables in order of first appearance", () => {
    expect(
      extractVariableNames("{{a}} and {{b}} and {{a}} again"),
    ).toEqual(["a", "b"]);
  });

  it("tolerates surrounding whitespace inside braces", () => {
    expect(extractVariableNames("{{  spaced_var  }}")).toEqual(["spaced_var"]);
  });

  it("ignores invalid identifiers like empty or spaced names", () => {
    expect(extractVariableNames("{{}} and {{ my var }}")).toEqual([]);
  });

  it("allows underscores and digits in names (not leading digit)", () => {
    expect(extractVariableNames("{{_var1}} {{var_2}}")).toEqual(["_var1", "var_2"]);
  });
});
