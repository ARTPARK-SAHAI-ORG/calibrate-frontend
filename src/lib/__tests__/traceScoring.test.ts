import type { EvaluatorData } from "../evaluatorApi";
import {
  ineligibleReasonCopy,
  isMissingTraceValue,
  isTraceScoringInProgress,
  missingTraceValues,
  nothingCanScoreCopy,
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
    expect(ineligibleReasonCopy("no_live_version")).toBe("Has no live version");
    expect(ineligibleReasonCopy("declares_variables")).toBe(
      "A variable has no trace value chosen. Configure it in the Evaluators tab",
    );
    expect(ineligibleReasonCopy("other")).toBe(
      "Cannot score traces for this agent",
    );
  });

  it("explains skip and failure reasons without averaging", () => {
    expect(scoringRunErrorCopy("no_usable_evaluators")).toBe(
      "No evaluators could score this trace",
    );
    expect(scoringRunErrorCopy("unsupported_interaction_type")).toMatch(
      /cannot be scored yet/,
    );
    expect(scoringRunErrorCopy("no_reply")).toBe(
      "This turn has tool calls and no reply, so there was nothing to score",
    );
    expect(scoringRunErrorCopy("missing_trace_values")).toBe(
      "This trace is missing a value that its evaluators need",
    );
    expect(scoringRunErrorCopy("")).toBe("Scoring did not finish");
    expect(scoringRunErrorCopy(null)).toBe("Scoring did not finish");
    // One self-contained sentence, because this same line is the hover text on
    // the mark beside a trace row.
    expect(scoringRunErrorCopy("over_limit")).toBe(
      "This workspace has reached its limit for scoring traces",
    );
    expect(scoringRunErrorCopy("scoring_disabled")).toMatch(
      /Monitoring was turned off/,
    );
    // The backend's trace_deleted and agent_deleted cannot reach a reader, so
    // they take the general line.
    expect(scoringRunErrorCopy("trace_deleted")).toBe(
      "Scoring did not finish",
    );
    expect(scoringRunErrorCopy("unknown-code")).toBe("Scoring did not finish");
  });
});

describe("nothingCanScoreCopy", () => {
  it("names variables when that is the only thing in the way", () => {
    expect(
      nothingCanScoreCopy([
        { reason: "declares_variables" },
        { reason: "declares_variables" },
      ]),
    ).toBe(
      "Every evaluator added to this agent has a variable with no trace value chosen. Configure them in the Evaluators tab.",
    );
  });

  it("says the agent has no evaluators when the list is empty", () => {
    expect(nothingCanScoreCopy([])).toBe(
      "This agent has no evaluators, so its traces are not scored.",
    );
  });

  it("falls back to a general line when the reasons differ", () => {
    expect(
      nothingCanScoreCopy([
        { reason: "declares_variables" },
        { reason: "no_live_version" },
      ]),
    ).toBe("None of this agent's evaluators can score traces.");
    expect(nothingCanScoreCopy([{ reason: "wrong_type_for_agent" }])).toBe(
      "None of this agent's evaluators can score traces.",
    );
  });
});

describe("missing trace values", () => {
  const evaluator = (trace_variables?: Record<string, string> | null) =>
    ({
      uuid: "ev",
      live_version: { variables: [{ name: "a" }, { name: "b" }] },
      trace_variables,
    }) as EvaluatorData;

  it("names only the variables with nothing saved", () => {
    expect(
      missingTraceValues(evaluator({ a: "input" })).map((v) => v.name),
    ).toEqual(["b"]);
    expect(isMissingTraceValue(evaluator({ a: "input" }))).toBe(true);
    expect(isMissingTraceValue(evaluator(null))).toBe(true);
  });

  it("is not missing anything when every variable has a value", () => {
    expect(isMissingTraceValue(evaluator({ a: "input", b: "labels" }))).toBe(
      false,
    );
  });

  it("is not missing anything when the evaluator has no variables", () => {
    expect(isMissingTraceValue({ uuid: "ev" } as EvaluatorData)).toBe(false);
  });
});
