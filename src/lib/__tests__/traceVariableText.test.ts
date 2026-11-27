import { missingValueSentence, missingValueText } from "../traceVariableText";

describe("missingValueText", () => {
  it("names the part of the trace that is empty", () => {
    expect(missingValueText("feedback.comment")).toBe("No user feedback comment");
    expect(missingValueText("metadata.city")).toBe("No city in the metadata");
    expect(missingValueText("output.tool_calls")).toBe("No tool calls");
    expect(missingValueText("labels")).toBe("No labels");
    expect(missingValueText("conversation_id")).toBe("No conversation ID");
    expect(missingValueText("message_id")).toBe("No message ID");
    expect(missingValueText("output.response", "general")).toBe("No output");
  });
});

describe("missingValueSentence", () => {
  it("says it as a sentence about one trace", () => {
    expect(missingValueSentence("feedback.comment")).toBe(
      "This trace has no user feedback comment",
    );
    expect(missingValueSentence("metadata.city")).toBe(
      "This trace's metadata has no city",
    );
    expect(missingValueSentence("labels")).toBe("This trace has no labels");
  });
});
