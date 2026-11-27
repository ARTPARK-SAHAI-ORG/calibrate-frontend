import { buildSnippet, snippetFields } from "../ingestSnippets";

const values = {
  backendUrl: "https://api.example.com",
  agentUuid: "ag-1",
  apiKey: "YOUR_API_KEY",
};

describe("buildSnippet", () => {
  it("omits optional fields by default in every language", () => {
    for (const language of ["curl", "python", "javascript"] as const) {
      const snippet = buildSnippet(language, values);
      expect(snippet).not.toContain("message_id");
      expect(snippet).not.toContain("conversation_id");
      expect(snippet).not.toContain("labels");
      expect(snippet).not.toContain("metadata");
    }
  });

  it("includes optional fields when asked", () => {
    for (const language of ["curl", "python", "javascript"] as const) {
      const snippet = buildSnippet(language, {
        ...values,
        includeOptional: true,
      });
      expect(snippet).toContain("message_id");
      expect(snippet).toContain("conversation_id");
      expect(snippet).toContain("labels");
      expect(snippet).toContain('["production", "v2.1"]');
      expect(snippet).toContain("metadata");
    }
  });

  it("marks optional fields in python and javascript only", () => {
    expect(
      buildSnippet("python", { ...values, includeOptional: true }),
    ).toContain("# Optional");
    expect(
      buildSnippet("javascript", { ...values, includeOptional: true }),
    ).toContain("// Optional");
    expect(
      buildSnippet("curl", { ...values, includeOptional: true }),
    ).not.toContain("Optional");
  });

  it("sends the input as a conversation history by default", () => {
    for (const language of ["curl", "python", "javascript"] as const) {
      const snippet = buildSnippet(language, values);
      expect(snippet).toContain("role");
      expect(snippet).toContain("When is the next vaccination?");
    }
  });

  it("sends the input as a single piece of text for a general agent", () => {
    for (const language of ["curl", "python", "javascript"] as const) {
      const snippet = buildSnippet(language, {
        ...values,
        agentNature: "general",
      });
      expect(snippet).toContain('"When is the next vaccination?"');
      expect(snippet).not.toContain("role");
    }
  });

  it("shows only the shape, with the given metadata, when asked", () => {
    const metadata = [
      { key: "language", value: 'Says "hi"' },
      { key: "district", value: "..." },
    ];
    const expected = {
      curl: '    "metadata": [\n      {"key": "language", "value": "Says \\"hi\\""},\n      {"key": "district", "value": "..."}\n    ]\n  }\'',
      python: '        "metadata": [\n            {"key": "language", "value": "Says \\"hi\\""},\n            {"key": "district", "value": "..."}\n        ]\n    },',
      javascript: '    metadata: [\n      { key: "language", value: "Says \\"hi\\"" },\n      { key: "district", value: "..." }\n    ]\n  }),',
    };
    for (const language of ["curl", "python", "javascript"] as const) {
      const snippet = buildSnippet(language, {
        ...values,
        placeholders: true,
        metadata,
      });
      expect(snippet).not.toContain("When is the next vaccination?");
      expect(snippet).not.toContain("book_appointment");
      expect(snippet).toMatch(/"?content"?: "\.\.\."/);
      expect(snippet).toMatch(/"?response"?: "\.\.\."/);
      expect(snippet).toMatch(/"?tool_calls"?: \[\.\.\.\]/);
      expect(snippet).toContain(expected[language]);
    }
  });

  it("leaves metadata out when the list is empty", () => {
    expect(buildSnippet("curl", { ...values, metadata: [] })).not.toContain(
      "metadata",
    );
  });
});

describe("snippetFields", () => {
  function inputMeaning(agentNature: "conversation" | "general") {
    return snippetFields(agentNature).find((f) => f.name === "input")!.meaning;
  }

  it("explains the input as a conversation history by default", () => {
    expect(inputMeaning("conversation")).toContain("conversation history");
  });

  it("explains the input as one piece of text for a general agent", () => {
    expect(inputMeaning("general")).toBe(
      "The input given to the agent, as a single piece of text.",
    );
  });

  it("lists labels as an optional field between conversation_id and metadata", () => {
    const optional = snippetFields()
      .filter((f) => f.optional)
      .map((f) => f.name);
    expect(optional).toEqual([
      "message_id",
      "conversation_id",
      "labels",
      "metadata",
    ]);
  });
});
