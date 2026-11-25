import {
  ineligibleReasonCopy,
  isTraceScoringInProgress,
  nothingCanScoreCopy,
  scoringRunErrorCopy,
  traceRowOutputFacts,
} from "../traceScoring";

describe("traceRowOutputFacts", () => {
  it("reads a blank preview as no reply and a zero count as no calls", () => {
    expect(
      traceRowOutputFacts({ response_preview: "  ", tool_call_count: 1 }),
    ).toEqual({ hasResponse: false, hasToolCalls: true });
    expect(
      traceRowOutputFacts({ response_preview: "Hi", tool_call_count: 0 }),
    ).toEqual({
      hasResponse: true,
      hasToolCalls: false,
    });
  });
});

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
      "Uses variables, which cannot be filled for a trace automatically",
    );
    expect(ineligibleReasonCopy("no_judge_prompt")).toBe(
      "Has no prompt, so only people can answer it",
    );
    expect(ineligibleReasonCopy("other")).toBe(
      "Cannot score traces for this agent",
    );
  });

  it("explains skip and failure reasons without averaging", () => {
    expect(scoringRunErrorCopy("no_usable_evaluators")).toBe(
      "No evaluator on this agent fits this trace",
    );
    expect(scoringRunErrorCopy("no_tool_call_evaluator")).toBe(
      "No tool call evaluator is added to this agent",
    );
    expect(scoringRunErrorCopy("unsupported_interaction_type")).toMatch(
      /cannot be scored yet/,
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
    expect(scoringRunErrorCopy("trace_deleted")).toBe("Scoring did not finish");
    expect(scoringRunErrorCopy("unknown-code")).toBe("Scoring did not finish");
  });
});

describe("nothingCanScoreCopy", () => {
  it("says what is wrong and what to add when every evaluator has the same problem", () => {
    expect(
      nothingCanScoreCopy([
        { reason: "declares_variables" },
        { reason: "declares_variables" },
      ]),
    ).toBe(
      "Every evaluator added to this agent uses variables, and variables cannot be filled for a trace automatically. Add an evaluator without variables in the",
    );
    expect(nothingCanScoreCopy([{ reason: "wrong_type_for_agent" }])).toBe(
      "None of the evaluators added to this agent are the kind that can score its traces. Add an evaluator that fits this agent in the",
    );
    expect(nothingCanScoreCopy([{ reason: "no_judge_prompt" }])).toBe(
      "None of the evaluators added to this agent have a prompt, so only people can answer them. Add an evaluator with a prompt in the",
    );
    expect(nothingCanScoreCopy([{ reason: "no_live_version" }])).toBe(
      "None of the evaluators added to this agent have a live version. Add an evaluator with a live version in the",
    );
  });

  it("says the agent has no evaluators when the list is empty", () => {
    expect(nothingCanScoreCopy([])).toBe(
      "This agent has no evaluators, so its traces are not scored. Add one in the",
    );
  });

  it("lists each problem when the reasons differ", () => {
    expect(
      nothingCanScoreCopy([
        { reason: "declares_variables" },
        { reason: "no_judge_prompt" },
        { reason: "declares_variables" },
      ]),
    ).toBe(
      "None of this agent's evaluators can score traces: some use variables, some have no prompt. Add an evaluator that can score traces in the",
    );
  });

  it("falls back to a general line for a reason it does not know", () => {
    expect(nothingCanScoreCopy([{ reason: "something_new" }])).toBe(
      "None of this agent's evaluators can score traces. Add an evaluator that can score traces in the",
    );
  });
});
