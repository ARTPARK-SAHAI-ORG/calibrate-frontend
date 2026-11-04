import type { EvaluatorData } from "../evaluatorApi";
import {
  emptyValueCopy,
  ineligibleReasonCopy,
  isMissingTraceValue,
  isTraceScoringInProgress,
  missingSourcePhrase,
  missingTraceValues,
  nothingCanScoreCopy,
  scoringRunErrorCopy,
  traceBodyExample,
  traceChoices,
  traceSourceLabel,
  traceSources,
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

describe("naming a part of a trace", () => {
  it("offers each kind of agent its own list", () => {
    expect(traceSources("conversation").map((s) => s.label)).toEqual([
      "Conversation",
      "Agent reply",
      "Tool calls",
      "Metadata",
      "Labels",
      "Conversation ID",
      "Message ID",
    ]);
    expect(traceSources("general").map((s) => s.label)).toEqual([
      "Input",
      "Output",
      "Tool calls",
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

  it("names a value this agent's list does not offer, or leaves it as it is", () => {
    expect(traceSourceLabel("message_id", "general")).toBe("Message ID");
    expect(traceSourceLabel("somewhere_new")).toBe("somewhere_new");
  });

  it("says what a trace lacks, in the dropdown's words", () => {
    expect(emptyValueCopy("metadata.expert_answer", "general")).toBe(
      "This trace has no metadata entry called expert_answer",
    );
    expect(emptyValueCopy("input", "conversation")).toBe(
      "This trace has no conversation",
    );
    expect(emptyValueCopy("output.response", "general")).toBe(
      "This trace has no output",
    );
    expect(emptyValueCopy("labels")).toBe("This trace has no labels");
  });

  it("says where a variable reads from", () => {
    expect(missingSourcePhrase("metadata.expert_answer")).toBe(
      "the metadata entry expert_answer",
    );
    expect(missingSourcePhrase("output.response")).toBe("the agent reply");
    expect(missingSourcePhrase("input", "conversation")).toBe(
      "the conversation",
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

describe("traceBodyExample", () => {
  it("is example text for a conversation agent when nothing is chosen", () => {
    expect(traceBodyExample("conversation", {})).toEqual({
      input: [{ role: "user", content: "The user's message" }],
      output: { response: "The agent's reply" },
    });
  });

  it("takes a plain string input for a general agent", () => {
    expect(traceBodyExample("general", {})).toEqual({
      input: "The user's message",
      output: { response: "The agent's reply" },
    });
    expect(traceBodyExample("general", { q: "input" }).input).toBe("<q>");
  });

  it("puts each chosen variable at its place", () => {
    expect(
      traceBodyExample("conversation", {
        a: "input",
        b: "output.response",
        c: "output.tool_calls",
        d: "labels",
        e: "conversation_id",
        f: "message_id",
        g: "metadata.expert_answer",
        h: "metadata.other",
      }),
    ).toEqual({
      input: [{ role: "user", content: "<a>" }],
      output: {
        response: "<b>",
        tool_calls: [{ tool: "<c>", arguments: { date: "2026-03-14" } }],
      },
      message_id: "<f>",
      conversation_id: "<e>",
      labels: ["<d>"],
      metadata: [
        { key: "expert_answer", value: "<g>" },
        { key: "other", value: "<h>" },
      ],
    });
  });

  it("adds nothing for a Metadata row with no key", () => {
    expect(
      traceBodyExample("conversation", { a: "metadata.", b: "" }),
    ).toEqual(traceBodyExample("conversation", {}));
  });

  it("names both variables when two read the same part", () => {
    expect(
      traceBodyExample("general", { a: "input", b: "input" }).input,
    ).toBe("<a> <b>");
  });
});

describe("naming a part of a trace in a sentence", () => {
  it("keeps ID in capitals", () => {
    expect(emptyValueCopy("conversation_id")).toBe(
      "This trace has no conversation ID",
    );
    expect(missingSourcePhrase("message_id")).toBe("the message ID");
  });
});
