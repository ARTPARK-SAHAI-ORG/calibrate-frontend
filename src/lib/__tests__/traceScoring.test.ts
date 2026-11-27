import type { EvaluatorData } from "../evaluatorApi";
import {
  ineligibleReasonCopy,
  isMissingTraceValue,
  isToolCallTraceRow,
  isTraceScoringInProgress,
  missingSourcePhrase,
  missingTraceValues,
  missingValueSentence,
  missingValueText,
  needsTraceValues,
  nothingCanScoreCopy,
  scoringFailedCopy,
  scoringRunErrorCopy,
  traceChoices,
  traceSourceHint,
  traceSourceLabel,
  traceSources,
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

describe("isToolCallTraceRow", () => {
  it("is true only for a row with calls and no reply", () => {
    expect(
      isToolCallTraceRow({ response_preview: " ", tool_call_count: 1 }),
    ).toBe(true);
    expect(
      isToolCallTraceRow({ response_preview: "Hi", tool_call_count: 1 }),
    ).toBe(false);
    expect(
      isToolCallTraceRow({ response_preview: null, tool_call_count: 0 }),
    ).toBe(false);
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
      "Has not been configured for traces. Set it up in the Evaluators tab",
    );
  });

  it("explains skip and failure reasons without averaging", () => {
    expect(scoringRunErrorCopy("no_usable_evaluators")).toBe(
      "No evaluator on this agent could score this trace",
    );
    expect(scoringRunErrorCopy("no_tool_call_evaluator")).toBe(
      "This trace was not scored because the agent made a tool call, but no tool call evaluators had been added to the agent",
    );
    expect(scoringRunErrorCopy("unsupported_interaction_type")).toMatch(
      /cannot be scored yet/,
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
      "None of the evaluators added to this agent have been configured for traces. Configure them in the",
    );
    expect(nothingCanScoreCopy([{ reason: "wrong_type_for_agent" }])).toBe(
      "None of the evaluators added to this agent are the kind that can score its traces. Add an evaluator that fits this agent in the",
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
        { reason: "no_live_version" },
        { reason: "declares_variables" },
      ]),
    ).toBe(
      "None of this agent's evaluators can score traces: some have not been configured for traces, some have no live version. Add an evaluator that can score traces in the",
    );
  });
});

describe("scoringFailedCopy", () => {
  it("puts the stored reason after the words scoring failed", () => {
    expect(scoringFailedCopy("Error code: 402 - out of credits")).toBe(
      "Scoring failed: Error code: 402 - out of credits",
    );
    expect(scoringFailedCopy(null)).toBe("Scoring failed");
    expect(scoringFailedCopy("")).toBe("Scoring failed");
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

describe("naming a part of a trace", () => {
  it("offers each kind of agent its own list", () => {
    expect(traceSources("conversation").map((s) => s.label)).toEqual([
      "Conversation",
      "Agent reply",
      "Tool calls",
      "User feedback comment",
      "Metadata",
      "Labels",
      "Conversation ID",
      "Message ID",
    ]);
    expect(traceSources("general").map((s) => s.label)).toEqual([
      "Input",
      "Output",
      "Tool calls",
      "User feedback comment",
      "Metadata",
      "Labels",
    ]);
  });

  it("names the input and reply by agent type, neutrally when it is not known", () => {
    expect(traceSourceLabel("input", "conversation")).toBe("Conversation");
    expect(traceSourceLabel("input", "general")).toBe("Input");
    expect(traceSourceLabel("input")).toBe("Input");
    expect(traceSourceLabel("output.response", "conversation")).toBe(
      "Agent reply",
    );
    expect(traceSourceLabel("output.response", "general")).toBe("Output");
    expect(traceSourceLabel("output.response")).toBe("Agent reply");
  });

  it("names the user's feedback comment and says what it holds", () => {
    expect(traceSourceLabel("feedback.comment")).toBe("User feedback comment");
    expect(traceSourceHint("feedback.comment")).toBe(
      "The comment given by the user along with the feedback for the trace",
    );
    expect(traceSourceHint("metadata.language")).toBe(
      "A field your code sent in the trace's metadata",
    );
    expect(traceSourceHint("input")).toBeNull();
  });

  it("names a value this agent's list does not offer, or leaves it as it is", () => {
    expect(traceSourceLabel("message_id", "general")).toBe("Message ID");
    expect(traceSourceLabel("somewhere_new")).toBe("somewhere_new");
  });

  it("says where a variable is mapped to", () => {
    expect(missingSourcePhrase("output.response")).toBe("the trace's agent reply");
    expect(missingSourcePhrase("input", "conversation")).toBe(
      "the trace's conversation",
    );
  });
});

describe("traceChoices", () => {
  it("trims a metadata key and drops rows that say nothing", () => {
    expect(
      traceChoices({
        a: "input",
        b: "",
        c: "metadata. k ",
        d: "metadata.",
        e: "metadata.  ",
      }),
    ).toEqual({ a: "input", c: "metadata.k" });
  });
});

describe("naming a part of a trace in a sentence", () => {
  it("keeps ID in capitals", () => {
    expect(missingSourcePhrase("message_id")).toBe("the trace's message ID");
  });
});

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
      "This trace has no metadata entry called city",
    );
    expect(missingValueSentence("labels")).toBe("This trace has no labels");
  });
});

describe("needsTraceValues", () => {
  const evaluator = (evaluator_type: string, trace_variables = {}) =>
    ({
      uuid: "e1",
      name: "Judge",
      evaluator_type,
      live_version: { variables: [{ name: "x" }] },
      trace_variables,
    }) as unknown as EvaluatorData;

  it("counts only an evaluator whose type can score the agent's traces", () => {
    expect(needsTraceValues(evaluator("llm"), "conversation")).toBe(true);
    expect(needsTraceValues(evaluator("llm-general"), "conversation")).toBe(false);
    expect(needsTraceValues(evaluator("llm-general"), "general")).toBe(true);
    expect(needsTraceValues(evaluator("llm"), "general")).toBe(false);
    expect(needsTraceValues(evaluator("tool-call"), "conversation")).toBe(true);
    expect(needsTraceValues(evaluator("tool-call"), "general")).toBe(true);
  });

  it("is false once every variable has a trace value", () => {
    expect(
      needsTraceValues(evaluator("llm", { x: "input" }), "conversation"),
    ).toBe(false);
  });
});

it("falls back to a plain sentence for a reason the app does not know", () => {
  expect(ineligibleReasonCopy("something_new" as never)).toBe(
    "Cannot score traces",
  );
  expect(
    nothingCanScoreCopy([
      { reason: "something_new" as never },
    ]),
  ).toBe(
    "None of the evaluators added to this agent can score its traces. Add an evaluator that can in the",
  );
});

it("says an unknown reason once, however many unknown reasons there are", () => {
  expect(
    nothingCanScoreCopy([
      { reason: "first_new" as never },
      { reason: "second_new" as never },
    ]),
  ).toBe(
    "None of the evaluators added to this agent can score its traces. Add an evaluator that can in the",
  );
});
