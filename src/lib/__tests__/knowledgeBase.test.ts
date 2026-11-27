import {
  characterCount,
  knowledgeBaseLength,
  knowledgeBaseOverBy,
  knowledgeBaseTooLongToDuplicate,
  knowledgeBaseTooLongToSave,
} from "../knowledgeBase";

describe("knowledgeBase", () => {
  it("counts an emoji as one character, as the backend does", () => {
    expect(knowledgeBaseLength("ab")).toBe(2);
    expect(knowledgeBaseLength("a😀")).toBe(2);
  });

  it("says how far over the backend's limit the text is, and zero when it is not", () => {
    expect(knowledgeBaseOverBy("a".repeat(5000), 5000)).toBe(0);
    expect(knowledgeBaseOverBy("a".repeat(5007), 5000)).toBe(7);
    expect(knowledgeBaseOverBy("", 5000)).toBe(0);
  });

  it("counts nothing as over while the limit is not known", () => {
    expect(knowledgeBaseOverBy("a".repeat(9000), null)).toBe(0);
  });

  it("says character for one and characters otherwise", () => {
    expect(characterCount(1)).toBe("1 character");
    expect(characterCount(0)).toBe("0 characters");
    expect(characterCount(1249)).toBe("1,249 characters");
    expect(knowledgeBaseTooLongToSave(1)).toBe(
      "The knowledge base is 1 character over the limit. Shorten it to save.",
    );
  });

  it("words the refusal for Save and for Duplicate", () => {
    expect(knowledgeBaseTooLongToSave(1249)).toBe(
      "The knowledge base is 1,249 characters over the limit. Shorten it to save.",
    );
    expect(knowledgeBaseTooLongToDuplicate(249)).toBe(
      "The knowledge base is 249 characters over the limit. Shorten it on the Knowledge base tab, then duplicate.",
    );
  });
});
