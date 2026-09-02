import { displayModelName } from "../modelName";

describe("displayModelName", () => {
  it("drops the company that makes the model", () => {
    expect(displayModelName("anthropic/claude-sonnet-4.6")).toBe(
      "claude-sonnet-4.6"
    );
  });

  it("handles the double-underscore form runs use", () => {
    expect(displayModelName("google__gemini-3-flash")).toBe("gemini-3-flash");
  });

  it("leaves a name with no company unchanged", () => {
    expect(displayModelName("gpt-4.1")).toBe("gpt-4.1");
  });

  it("returns the original string when there is nothing left to show", () => {
    expect(displayModelName("")).toBe("");
    expect(displayModelName("/")).toBe("/");
  });
});
