import { normaliseHex, pickColourVars, readableInk } from "../colour";

describe("normaliseHex", () => {
  it("accepts six hex digits with or without the hash, in any case", () => {
    expect(normaliseHex("#c7235e")).toBe("#C7235E");
    expect(normaliseHex("C7235E")).toBe("#C7235E");
    expect(normaliseHex("  #00805f ")).toBe("#00805F");
  });

  it("refuses anything else", () => {
    for (const v of ["#fff", "#12345", "#1234567", "red", "", "#GGGGGG", null, undefined, 12, {}]) {
      expect(normaliseHex(v)).toBeNull();
    }
  });
});

describe("readableInk", () => {
  it("writes white on the deep brand pink and green", () => {
    expect(readableInk("#C7235E")).toBe("#FFFFFF");
    expect(readableInk("#00805F")).toBe("#FFFFFF");
  });

  it("writes soft black on amber and on a light grey", () => {
    expect(readableInk("#FAA820")).toBe("#383838");
    expect(readableInk("#E6DFD7")).toBe("#383838");
  });

  it("writes white on black and soft black on white", () => {
    expect(readableInk("#000000")).toBe("#FFFFFF");
    expect(readableInk("#FFFFFF")).toBe("#383838");
  });
});

describe("pickColourVars", () => {
  it("gives the fill and the ink for a usable colour", () => {
    expect(pickColourVars("#c7235e")).toEqual({
      "--pick": "#C7235E",
      "--pick-ink": "#FFFFFF",
    });
    expect(pickColourVars("#FAA820")).toEqual({
      "--pick": "#FAA820",
      "--pick-ink": "#383838",
    });
  });

  it("gives nothing for a missing or unusable colour", () => {
    expect(pickColourVars(null)).toBeUndefined();
    expect(pickColourVars(undefined)).toBeUndefined();
    expect(pickColourVars("pink")).toBeUndefined();
  });
});
