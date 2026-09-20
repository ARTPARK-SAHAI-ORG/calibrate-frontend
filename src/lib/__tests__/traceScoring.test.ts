import {
  ineligibleReasonCopy,
  isTraceScoringInProgress,
  scoringRunErrorCopy,
} from "../traceScoring";

describe("isTraceScoringInProgress", () => {
  it("treats waiting and in-flight runs as open", () => {
    expect(isTraceScoringInProgress("pending")).toBe(true);
    expect(isTraceScoringInProgress("processing")).toBe(true);
    expect(isTraceScoringInProgress("completed")).toBe(false);
    expect(isTraceScoringInProgress(null)).toBe(false);
  });
});


describe("copy", () => {
  it("explains ineligible evaluators in ordinary words", () => {
    expect(ineligibleReasonCopy("wrong_type_for_agent")).toBe(
      "Is not the kind of evaluator this agent uses",
    );
    expect(ineligibleReasonCopy("no_live_version")).toBe(
      "Has no live version",
    );
    expect(ineligibleReasonCopy("declares_variables")).toBe(
      "Uses variables, which cannot be filled in for a trace",
    );
    expect(ineligibleReasonCopy("other")).toBe(
      "Cannot score traces for this agent",
    );
  });

  it("explains skip and failure reasons without averaging", () => {
    expect(scoringRunErrorCopy("no_usable_evaluators")).toBe(
      "No evaluators could score this trace",
    );
    expect(scoringRunErrorCopy("trace_deleted")).toMatch(/deleted/);
    expect(scoringRunErrorCopy("agent_deleted")).toMatch(/agent was deleted/);
    expect(scoringRunErrorCopy("unsupported_interaction_type")).toMatch(
      /cannot be scored yet/,
    );
    expect(scoringRunErrorCopy("")).toBe("Scoring did not finish");
    expect(scoringRunErrorCopy(null)).toBe("Scoring did not finish");
    expect(scoringRunErrorCopy("over_limit")).toBe(
      "This workspace has scored as many traces as its limit allows",
    );
    expect(scoringRunErrorCopy("unknown-code")).toBe("Scoring did not finish");
  });

});
