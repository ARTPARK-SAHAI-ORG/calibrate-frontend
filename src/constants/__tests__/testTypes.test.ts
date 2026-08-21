import { isCreatableTestType } from "../testTypes";

describe("isCreatableTestType", () => {
  it("hides the conversation type", () => {
    expect(isCreatableTestType("conversation")).toBe(false);
  });

  it("keeps every other type", () => {
    for (const type of [
      "next-reply",
      "tool-invocation",
      "response",
      "tool_call",
    ]) {
      expect(isCreatableTestType(type)).toBe(true);
    }
  });
});
