import {
  RESERVED_EVALUATOR_NAMES,
  defaultEvaluatorName,
  isReservedEvaluatorName,
  reservedEvaluatorNameError,
} from "../evaluatorNames";

describe("RESERVED_EVALUATOR_NAMES", () => {
  it("contains the expected reserved names", () => {
    expect(RESERVED_EVALUATOR_NAMES).toEqual(["name", "conversation_history"]);
  });
});

describe("isReservedEvaluatorName", () => {
  it("matches exact reserved names", () => {
    expect(isReservedEvaluatorName("name")).toBe(true);
    expect(isReservedEvaluatorName("conversation_history")).toBe(true);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(isReservedEvaluatorName("  NAME  ")).toBe(true);
    expect(isReservedEvaluatorName("Conversation_History")).toBe(true);
  });

  it("returns false for non-reserved names", () => {
    expect(isReservedEvaluatorName("Correctness")).toBe(false);
    expect(isReservedEvaluatorName("")).toBe(false);
  });
});

describe("reservedEvaluatorNameError", () => {
  it("formats the error message with the trimmed name", () => {
    expect(reservedEvaluatorNameError("  name  ")).toBe(
      `"name" is a reserved keyword and can't be used as an evaluator name`,
    );
  });
});

describe("defaultEvaluatorName", () => {
  it.each([
    ["llm", null, "New conversation reply evaluator"],
    ["conversation", null, "New whole conversation evaluator"],
    ["llm-general", null, "New basic output evaluator"],
    ["tool-call", "conversation", "New conversation tool call evaluator"],
    ["tool-call", "single", "New basic tool call evaluator"],
    ["tool-call", null, "New tool call evaluator"],
    ["stt", null, "New speech to text evaluator"],
    ["tts", null, "New text to speech evaluator"],
  ] as const)("names %s (%s) as %s", (type, textKind, expected) => {
    expect(defaultEvaluatorName(type, [], textKind)).toBe(expected);
  });

  it("only says the agent kind for tool call evaluators", () => {
    expect(defaultEvaluatorName("llm", [], "conversation")).toBe(
      "New conversation reply evaluator",
    );
  });

  it("adds the next free number when the name is taken, ignoring case and spaces", () => {
    expect(
      defaultEvaluatorName("stt", [
        " new speech to text evaluator ",
        "New speech to text evaluator 2",
      ]),
    ).toBe("New speech to text evaluator 3");
  });
});
