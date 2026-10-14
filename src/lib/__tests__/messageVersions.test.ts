import {
  payloadHasVersions,
  readTextField,
  readTurnExtras,
  textOf,
  writeTextField,
} from "../messageVersions";

describe("readTurnExtras", () => {
  it("keeps a label and string versions, dropping anything else", () => {
    expect(
      readTurnExtras({
        role: "assistant",
        content: "hi",
        label: "AI draft",
        versions: { Nurse: "hello", bad: 3 },
      }),
    ).toEqual({ label: "AI draft", versions: { Nurse: "hello" } });
  });

  it("drops a version with a blank name", () => {
    expect(readTurnExtras({ versions: { "  ": "x", Hindi: "y" } })).toEqual({
      versions: { Hindi: "y" },
    });
  });

  it("returns nothing for a blank label, non-object versions, or a non-object", () => {
    expect(readTurnExtras({ label: "  ", versions: ["x"] })).toEqual({});
    expect(readTurnExtras({ versions: { a: 1 } })).toEqual({});
    expect(readTurnExtras("text")).toEqual({});
    expect(readTurnExtras(null)).toEqual({});
  });
});

describe("readTextField", () => {
  it("reads a plain string", () => {
    expect(readTextField("hello")).toEqual({ content: "hello" });
  });

  it("reads the object form with its extras", () => {
    expect(
      readTextField({ content: "hello", label: "AI draft", versions: { Nurse: "hi" } }),
    ).toEqual({ content: "hello", label: "AI draft", versions: { Nurse: "hi" } });
  });

  it("returns null when there is no text", () => {
    expect(readTextField({ label: "AI draft" })).toBeNull();
    expect(readTextField(undefined)).toBeNull();
    expect(readTextField(7)).toBeNull();
  });
});

describe("textOf", () => {
  it("returns the default text or an empty string", () => {
    expect(textOf("a")).toBe("a");
    expect(textOf({ content: "b", label: "x" })).toBe("b");
    expect(textOf(null)).toBe("");
  });
});

describe("writeTextField", () => {
  it("writes a plain string when there is no label and no versions", () => {
    expect(writeTextField("hello")).toBe("hello");
    expect(writeTextField("hello", { label: " ", versions: {} })).toBe("hello");
  });

  it("writes the object form when a label or versions are present", () => {
    expect(writeTextField("hello", { label: "AI draft" })).toEqual({
      content: "hello",
      label: "AI draft",
    });
    expect(writeTextField("hello", { versions: { Nurse: "hi" } })).toEqual({
      content: "hello",
      versions: { Nurse: "hi" },
    });
  });
});

describe("payloadHasVersions", () => {
  it("is true when a turn or a reply field carries versions", () => {
    expect(
      payloadHasVersions({ chat_history: [{ role: "user", content: "a", versions: { Hindi: "b" } }] }),
    ).toBe(true);
    expect(payloadHasVersions({ transcript: [{ role: "user", content: "a", versions: { Hindi: "b" } }] })).toBe(true);
    expect(payloadHasVersions({ agent_response: { content: "a", versions: { Nurse: "b" } } })).toBe(true);
    expect(payloadHasVersions({ input: { content: "a", versions: { Hindi: "b" } }, output: "c" })).toBe(true);
  });

  it("is false with only labels, plain strings, or no payload", () => {
    expect(payloadHasVersions({ chat_history: [{ role: "user", content: "a", label: "Caller" }], agent_response: "b" })).toBe(false);
    expect(payloadHasVersions(null)).toBe(false);
  });
});
