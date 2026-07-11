import {
  INBUILT_TOOLS,
  getInbuiltToolIcon,
  type InbuiltTool,
} from "@/constants/inbuilt-tools";

describe("getInbuiltToolIcon", () => {
  it("returns a non-empty SVG path for the end-call icon", () => {
    const path = getInbuiltToolIcon("end-call");
    expect(typeof path).toBe("string");
    expect(path.length).toBeGreaterThan(0);
    expect(path.startsWith("M")).toBe(true);
  });

  it("returns a non-empty SVG path for the wrench icon", () => {
    const path = getInbuiltToolIcon("wrench");
    expect(typeof path).toBe("string");
    expect(path.length).toBeGreaterThan(0);
    expect(path.startsWith("M")).toBe(true);
  });

  it("falls back to the wrench path for an unknown icon", () => {
    // Exercise the default branch of the switch.
    const path = getInbuiltToolIcon("mystery" as InbuiltTool["icon"]);
    expect(path).toBe(getInbuiltToolIcon("wrench"));
  });
});

describe("INBUILT_TOOLS", () => {
  it("is a non-empty array of well-formed tool entries", () => {
    expect(Array.isArray(INBUILT_TOOLS)).toBe(true);
    expect(INBUILT_TOOLS.length).toBeGreaterThan(0);
    for (const tool of INBUILT_TOOLS) {
      expect(typeof tool.id).toBe("string");
      expect(tool.id.length).toBeGreaterThan(0);
      expect(typeof tool.name).toBe("string");
      expect(tool.name.length).toBeGreaterThan(0);
      expect(typeof tool.description).toBe("string");
      expect(tool.description.length).toBeGreaterThan(0);
      expect(["end-call", "wrench"]).toContain(tool.icon);
      // Every declared icon resolves to a usable path.
      expect(getInbuiltToolIcon(tool.icon).length).toBeGreaterThan(0);
    }
  });

  it("includes the end_call tool", () => {
    const endCall = INBUILT_TOOLS.find((t) => t.id === "end_call");
    expect(endCall).toBeDefined();
    expect(endCall!.icon).toBe("end-call");
    expect(endCall!.name).toBe("End conversation");
  });
});
