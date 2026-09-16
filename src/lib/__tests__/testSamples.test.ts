import { sampleTest } from "../testSamples";

describe("sampleTest", () => {
  it("gives a conversation agent's response test a name, three turns and criteria", () => {
    const sample = sampleTest("next-reply", false);
    expect(sample.name).toBe("Gives the correct opening hours");
    expect(sample.history.map((m) => m.role)).toEqual([
      "user",
      "agent",
      "user",
    ]);
    expect(sample.history.every((m) => m.content.trim().length > 0)).toBe(true);
    expect(sample.criteria).toContain("Saturday");
    expect(sample.input).toBe("");
  });

  it("gives a single response agent's test one input and no conversation", () => {
    const sample = sampleTest("next-reply", true);
    expect(sample.name).toBe("Advises seeing a clinician");
    expect(sample.history).toEqual([]);
    expect(sample.input).toContain("fever");
    expect(sample.criteria).toContain("clinician");
  });

  it("gives a tool call test one request, as a turn and as a plain input", () => {
    const sample = sampleTest("tool-invocation", false);
    expect(sample.history).toEqual([
      { role: "user", content: "Book my daughter's vaccination for Tuesday." },
    ]);
    expect(sample.input).toBe("Book my daughter's vaccination for Tuesday.");
    // The tool to expect depends on the agent's own tools, so there is
    // nothing to judge against here.
    expect(sample.criteria).toBe("");
  });

  it("gives a conversation test the same three turns with its own criteria", () => {
    const sample = sampleTest("conversation", false);
    expect(sample.name).toBe("Handles a rebooking politely");
    expect(sample.history).toHaveLength(3);
    expect(sample.criteria).toContain("polite");
  });
});
