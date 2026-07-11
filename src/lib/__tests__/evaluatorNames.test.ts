import {
  RESERVED_EVALUATOR_NAMES,
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
