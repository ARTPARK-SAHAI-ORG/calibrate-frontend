import {
  testTypeLabel,
  getUnitTestBreakdown,
  modelComparisonName,
  runDisplayName,
} from "../testTypes";

describe("testTypeLabel", () => {
  it("labels tool_call", () => {
    expect(testTypeLabel("tool_call")).toBe("Tool Call");
  });

  it("labels conversation", () => {
    expect(testTypeLabel("conversation")).toBe("Conversation");
  });

  it("labels response", () => {
    expect(testTypeLabel("response")).toBe("Agent Response");
  });

  it("labels general the same as response", () => {
    expect(testTypeLabel("general")).toBe("Agent Response");
  });

  it("uses default fallback for unknown type", () => {
    expect(testTypeLabel("mystery")).toBe("Agent Response");
  });

  it("uses default fallback for null/undefined", () => {
    expect(testTypeLabel(null)).toBe("Agent Response");
    expect(testTypeLabel(undefined)).toBe("Agent Response");
  });

  it("uses custom fallback when provided", () => {
    expect(testTypeLabel("mystery", "—")).toBe("—");
    expect(testTypeLabel(undefined, "—")).toBe("—");
  });
});

describe("getUnitTestBreakdown", () => {
  it("returns null for null/undefined/empty results", () => {
    expect(getUnitTestBreakdown(null)).toBeNull();
    expect(getUnitTestBreakdown(undefined)).toBeNull();
    expect(getUnitTestBreakdown([])).toBeNull();
  });

  it("counts passed via passed:true", () => {
    const result = getUnitTestBreakdown([{ passed: true }]);
    expect(result).toEqual({ passed: 1, failed: 0, errored: 0 });
  });

  it("counts passed via status: passed", () => {
    const result = getUnitTestBreakdown([{ passed: null, status: "passed" }]);
    expect(result).toEqual({ passed: 1, failed: 0, errored: 0 });
  });

  it("counts errored via error field", () => {
    const result = getUnitTestBreakdown([
      { passed: false, error: "boom" },
    ]);
    expect(result).toEqual({ passed: 0, failed: 0, errored: 1 });
  });

  it("counts errored via status: error", () => {
    const result = getUnitTestBreakdown([{ passed: false, status: "error" }]);
    expect(result).toEqual({ passed: 0, failed: 0, errored: 1 });
  });

  it("counts errored via passed: null", () => {
    const result = getUnitTestBreakdown([{ passed: null }]);
    expect(result).toEqual({ passed: 0, failed: 0, errored: 1 });
  });

  it("counts errored via passed: undefined", () => {
    const result = getUnitTestBreakdown([{ passed: undefined as unknown as boolean }]);
    expect(result).toEqual({ passed: 0, failed: 0, errored: 1 });
  });

  it("counts genuine failure (passed:false, no error signal)", () => {
    const result = getUnitTestBreakdown([{ passed: false, status: "failed" }]);
    expect(result).toEqual({ passed: 0, failed: 1, errored: 0 });
  });

  it("mixes passed, failed, and errored", () => {
    const result = getUnitTestBreakdown([
      { passed: true },
      { passed: false, status: "failed" },
      { passed: null },
      { passed: false, error: "oops" },
    ]);
    expect(result).toEqual({ passed: 1, failed: 1, errored: 2 });
  });
});

describe("modelComparisonName", () => {
  it("calls a backend-named benchmark a model comparison, keeping its number", () => {
    expect(modelComparisonName("Benchmark 3")).toBe("Model comparison 3");
  });

  it("names an unnamed run when the backend has not sent one yet", () => {
    expect(modelComparisonName(null)).toBe("Model comparison");
    expect(modelComparisonName("  ")).toBe("Model comparison");
  });

  it("leaves a name of its own alone", () => {
    expect(modelComparisonName("Nightly sweep")).toBe("Nightly sweep");
  });
});

describe("runDisplayName", () => {
  it("calls a plain run an evaluation run, keeping its number", () => {
    expect(runDisplayName("llm-unit-test", "Run 12")).toBe("Evaluation run 12");
  });

  it("calls a multi-model run a model comparison", () => {
    expect(runDisplayName("llm-benchmark", "Benchmark 3")).toBe(
      "Model comparison 3",
    );
  });

  it("names a run the backend has not named yet", () => {
    expect(runDisplayName("llm-unit-test", "")).toBe("Evaluation run");
    expect(runDisplayName("llm-benchmark", null)).toBe("Model comparison");
  });
});
