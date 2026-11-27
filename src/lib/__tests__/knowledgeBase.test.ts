import { LIMITS } from "@/constants/limits";
import { knowledgeBaseLength, knowledgeBaseOverBy } from "../knowledgeBase";

describe("knowledgeBase", () => {
  it("counts an emoji as one character, as the backend does", () => {
    expect(knowledgeBaseLength("ab")).toBe(2);
    expect(knowledgeBaseLength("a😀")).toBe(2);
  });

  it("says how far over the limit the text is, and zero when it is not", () => {
    const max = LIMITS.KNOWLEDGE_BASE_MAX_CHARS;
    expect(knowledgeBaseOverBy("a".repeat(max))).toBe(0);
    expect(knowledgeBaseOverBy("a".repeat(max + 7))).toBe(7);
    expect(knowledgeBaseOverBy("")).toBe(0);
  });
});
