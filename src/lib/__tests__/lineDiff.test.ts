import { diffLines } from "../lineDiff";

describe("diffLines", () => {
  it("marks every line as unchanged when the text is identical", () => {
    expect(diffLines("a\nb", "a\nb")).toEqual([
      { type: "same", text: "a" },
      { type: "same", text: "b" },
    ]);
  });

  it("marks a new line as added", () => {
    expect(diffLines("a", "a\nb")).toEqual([
      { type: "same", text: "a" },
      { type: "added", text: "b" },
    ]);
  });

  it("marks a dropped line as removed", () => {
    expect(diffLines("a\nb", "b")).toEqual([
      { type: "removed", text: "a" },
      { type: "same", text: "b" },
    ]);
  });

  it("shows a changed line as a removal followed by an addition", () => {
    expect(diffLines("a\nold\nc", "a\nnew\nc")).toEqual([
      { type: "same", text: "a" },
      { type: "removed", text: "old" },
      { type: "added", text: "new" },
      { type: "same", text: "c" },
    ]);
  });

  it("keeps the shared lines when text is inserted in the middle", () => {
    const result = diffLines("a\nc", "a\nb\nc");
    expect(result.filter((l) => l.type === "same").map((l) => l.text)).toEqual([
      "a",
      "c",
    ]);
    expect(result.filter((l) => l.type === "added")).toEqual([
      { type: "added", text: "b" },
    ]);
  });

  it("handles empty text on either side", () => {
    expect(diffLines("", "a")).toEqual([
      { type: "removed", text: "" },
      { type: "added", text: "a" },
    ]);
    expect(diffLines("a", "")).toEqual([
      { type: "removed", text: "a" },
      { type: "added", text: "" },
    ]);
  });
});
