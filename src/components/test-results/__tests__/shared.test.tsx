import React from "react";
import { render, screen, setupUser, within } from "@/test-utils";
import {
  StatusIcon,
  LabellingRowCheckbox,
  SmallStatusBadge,
  normalizeToolCall,
  ToolCallCard,
  JudgeResultsList,
  formatTurnTimestamp,
  TestDetailView,
  EmptyStateView,
  EvaluationCriteriaPanel,
  scrollRowByPage,
  isTypingTarget,
  ResultPager,
  TestStats,
  type JudgeResult,
  type TestRunEvaluator,
  type TestCaseHistory,
} from "../shared";

// EvaluatorVerdictCard is a real, separately-tested component — render it
// for real here so JudgeResultsList / EvaluationCriteriaPanel exercise
// their actual prop wiring end to end.

// jsdom doesn't implement scrollIntoView; TestDetailView auto-scrolls to
// the bottom sentinel on mount/update.
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

describe("StatusIcon", () => {
  it.each([
    ["passed"],
    ["failed"],
    ["error"],
    ["queued"],
    ["pending"],
    ["running"],
  ] as const)("renders for status=%s", (status) => {
    const { container } = render(<StatusIcon status={status} />);
    expect(container.firstChild).toBeTruthy();
  });
});

describe("LabellingRowCheckbox", () => {
  it("renders unchecked by default", () => {
    const { container } = render(<LabellingRowCheckbox checked={false} />);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });

  it("renders the checkmark when checked and enabled", () => {
    const { container } = render(<LabellingRowCheckbox checked />);
    expect(container.querySelector("svg")).toBeInTheDocument();
  });

  it("hides the checkmark when disabled even if checked", () => {
    const { container } = render(<LabellingRowCheckbox checked disabled />);
    expect(container.querySelector("svg")).not.toBeInTheDocument();
  });
});

describe("SmallStatusBadge", () => {
  it("renders a check for passed=true", () => {
    const { container } = render(<SmallStatusBadge passed />);
    expect(container.querySelector(".bg-green-500\\/20")).toBeInTheDocument();
  });
  it("renders an x for passed=false", () => {
    const { container } = render(<SmallStatusBadge passed={false} />);
    expect(container.querySelector(".bg-red-500\\/20")).toBeInTheDocument();
  });
});

describe("normalizeToolCall", () => {
  it("returns a default shape for non-object input", () => {
    expect(normalizeToolCall(null)).toEqual({ toolName: "Unknown tool", args: {} });
    expect(normalizeToolCall(undefined)).toEqual({ toolName: "Unknown tool", args: {} });
    expect(normalizeToolCall("x")).toEqual({ toolName: "Unknown tool", args: {} });
  });

  it("reads `tool` as a plain string plus `arguments`", () => {
    expect(normalizeToolCall({ tool: "search", arguments: { q: "hi" } })).toEqual({
      toolName: "search",
      args: { q: "hi" },
      output: undefined,
    });
  });

  it("reads a nested `tool.name` / `tool.arguments`", () => {
    expect(
      normalizeToolCall({ tool: { name: "lookup", arguments: { id: 1 } } }),
    ).toEqual({ toolName: "lookup", args: { id: 1 }, output: undefined });
  });

  it("reads OpenAI-style `name` + `arguments`", () => {
    expect(normalizeToolCall({ name: "book", arguments: { x: 1 } })).toEqual({
      toolName: "book",
      args: { x: 1 },
      output: undefined,
    });
  });

  it("reads `function.name` / `function.arguments`", () => {
    expect(
      normalizeToolCall({ function: { name: "call", arguments: { a: 2 } } }),
    ).toEqual({ toolName: "call", args: { a: 2 }, output: undefined });
  });

  it("falls back to Unknown tool when no name shape matches", () => {
    expect(normalizeToolCall({})).toEqual({ toolName: "Unknown tool", args: {}, output: undefined });
  });

  it("parses a JSON-string `arguments` payload", () => {
    expect(
      normalizeToolCall({ tool: "search", arguments: JSON.stringify({ q: "hi" }) }),
    ).toEqual({ toolName: "search", args: { q: "hi" }, output: undefined });
  });

  it("falls back to empty args when the JSON string is invalid", () => {
    expect(
      normalizeToolCall({ tool: "search", arguments: "{not json" }),
    ).toEqual({ toolName: "search", args: {}, output: undefined });
  });

  it("ignores array-shaped arguments", () => {
    expect(
      normalizeToolCall({ tool: "search", arguments: [1, 2, 3] }),
    ).toEqual({ toolName: "search", args: {}, output: undefined });
  });

  it("carries through a defined, non-null output", () => {
    expect(
      normalizeToolCall({ tool: "search", arguments: {}, output: { ok: true } }),
    ).toEqual({ toolName: "search", args: {}, output: { ok: true } });
  });

  it("treats a null output as undefined", () => {
    expect(
      normalizeToolCall({ tool: "search", arguments: {}, output: null }),
    ).toEqual({ toolName: "search", args: {}, output: undefined });
  });
});

describe("ToolCallCard", () => {
  it("renders tool name, params, and a multi-line param as monospace", () => {
    render(
      <ToolCallCard
        toolName="search"
        args={{ query: "hello", body: "line1\nline2" }}
      />,
    );
    expect(screen.getByText("search")).toBeInTheDocument();
    expect(screen.getByText("query")).toBeInTheDocument();
    expect(screen.getByText("hello")).toBeInTheDocument();
    expect(
      screen.getByText((_, el) => el?.textContent === "line1\nline2"),
    ).toHaveClass("font-mono");
  });

  it("filters out the `headers` param", () => {
    render(<ToolCallCard toolName="search" args={{ headers: { a: 1 }, q: "x" }} />);
    expect(screen.queryByText("headers")).not.toBeInTheDocument();
    expect(screen.getByText("q")).toBeInTheDocument();
  });

  it("renders the tool response when output is present", () => {
    render(<ToolCallCard toolName="search" args={{}} output={{ result: 1 }} />);
    expect(screen.getByText("Tool Response")).toBeInTheDocument();
    expect(screen.getByText(/"result": 1/)).toBeInTheDocument();
  });

  it("renders a plain-string multi-line output as monospace", () => {
    render(<ToolCallCard toolName="search" args={{}} output={"a\nb"} />);
    expect(
      screen.getByText((_, el) => el?.textContent === "a\nb"),
    ).toHaveClass("font-mono");
  });

  it("renders no params/output section when args and output are both empty", () => {
    const { container } = render(<ToolCallCard toolName="search" args={{}} />);
    expect(screen.queryByText("Tool Response")).not.toBeInTheDocument();
    expect(container.querySelector(".mb-2")).not.toBeInTheDocument();
  });

  describe("expected mode", () => {
    it("is collapsible when there are params, and toggles open/closed", async () => {
      const user = setupUser();
      render(
        <ToolCallCard
          toolName="book_flight"
          args={{ destination: { match_type: "exact", value: "NYC" } }}
          expected
        />,
      );
      expect(screen.getByText("destination")).toBeInTheDocument();
      const toggle = screen.getByRole("button", { name: "Collapse parameters" });
      await user.click(toggle);
      expect(screen.getByText(/1 parameter hidden/)).toBeInTheDocument();
      await user.click(screen.getByRole("button", { name: "Expand parameters" }));
      expect(screen.getByText("destination")).toBeInTheDocument();
    });

    it("renders the wildcard 'Is any' chip with no value box", () => {
      render(
        <ToolCallCard
          toolName="t"
          args={{ p: { match_type: "any" } }}
          expected
        />,
      );
      expect(screen.getByText("Is any")).toBeInTheDocument();
    });

    it("renders 'Is null' for a null exact-match value", () => {
      render(
        <ToolCallCard
          toolName="t"
          args={{ p: { match_type: "exact", value: null } }}
          expected
        />,
      );
      expect(screen.getByText("Is null")).toBeInTheDocument();
    });

    it("renders 'Is exactly' with an object value formatted as JSON", () => {
      render(
        <ToolCallCard
          toolName="t"
          args={{ p: { match_type: "exact", value: { a: 1 } } }}
          expected
        />,
      );
      expect(screen.getByText("Is exactly")).toBeInTheDocument();
      expect(screen.getByText(/"a": 1/)).toBeInTheDocument();
    });

    it("renders 'satisfies the criteria' for an llm_judge spec with criteria text", () => {
      render(
        <ToolCallCard
          toolName="t"
          args={{ p: { match_type: "llm_judge", criteria: "must be polite" } }}
          expected
        />,
      );
      expect(screen.getByText("satisfies the criteria")).toBeInTheDocument();
      expect(screen.getByText("must be polite")).toBeInTheDocument();
    });

    it("renders an empty criteria box when llm_judge criteria is not a string", () => {
      const { container } = render(
        <ToolCallCard
          toolName="t"
          args={{ p: { match_type: "llm_judge" } }}
          expected
        />,
      );
      expect(screen.getByText("satisfies the criteria")).toBeInTheDocument();
      expect(container.textContent).not.toContain("undefined");
    });

    it("recurses into nested object params", () => {
      render(
        <ToolCallCard
          toolName="t"
          args={{ outer: { inner: { match_type: "exact", value: "x" } } }}
          expected
        />,
      );
      expect(screen.getByText("outer")).toBeInTheDocument();
      expect(screen.getByText("inner")).toBeInTheDocument();
    });

    it("renders a bare literal value box for a non-spec param", () => {
      render(<ToolCallCard toolName="t" args={{ p: 42 }} expected />);
      expect(screen.getByText("42")).toBeInTheDocument();
    });
  });

  it("falls back to String(value) when JSON.stringify throws on a circular object", () => {
    const circular: any = {};
    circular.self = circular;
    render(<ToolCallCard toolName="t" args={{ p: circular }} />);
    expect(
      screen.getByText((_, el) => el?.textContent === "[object Object]"),
    ).toBeInTheDocument();
  });
});

describe("JudgeResultsList", () => {
  it("renders nothing when results is empty/missing", () => {
    const { container: c1 } = render(<JudgeResultsList results={undefined} />);
    expect(c1).toBeEmptyDOMElement();
    const { container: c2 } = render(<JudgeResultsList results={[]} />);
    expect(c2).toBeEmptyDOMElement();
  });

  it("renders one card per result, resolving the evaluator by uuid", () => {
    const evaluatorsByUuid: Record<string, TestRunEvaluator> = {
      "ev-1": {
        uuid: "ev-1",
        name: "Correctness",
        output_type: "binary",
        version_number: 3,
        scale_min: 0,
        scale_max: 1,
      },
    };
    const results: JudgeResult[] = [
      {
        evaluator_uuid: "ev-1",
        match: true,
        reasoning: "good",
        value_name: "Great job",
      },
      { evaluator_uuid: "missing-uuid", match: false },
      // No evaluator_uuid at all -> hits the `ev = null` / key=`${i}` paths.
      { match: true },
    ];
    render(
      <JudgeResultsList results={results} evaluatorsByUuid={evaluatorsByUuid} />,
    );
    expect(screen.getByText("Correctness")).toBeInTheDocument();
    expect(screen.getByText("v3")).toBeInTheDocument();
    expect(screen.getByText("Great job")).toBeInTheDocument();
    // Unresolved evaluator uuid falls back to the generic "Evaluator" name.
    expect(screen.getAllByText("Evaluator").length).toBeGreaterThan(0);
  });
});

describe("formatTurnTimestamp", () => {
  it("returns null for nullish input", () => {
    expect(formatTurnTimestamp(null)).toBeNull();
    expect(formatTurnTimestamp(undefined)).toBeNull();
  });
  it("returns null for an empty/whitespace string", () => {
    expect(formatTurnTimestamp("   ")).toBeNull();
  });
  it("formats an epoch-millis numeric string", () => {
    const out = formatTurnTimestamp("1700000000000");
    expect(out).not.toBeNull();
    expect(out).not.toBe("1700000000000");
  });
  it("formats an ISO string", () => {
    const out = formatTurnTimestamp("2024-01-01T00:00:00.000Z");
    expect(out).not.toBeNull();
  });
  it("falls back to the raw string when parsing fails", () => {
    expect(formatTurnTimestamp("not-a-date")).toBe("not-a-date");
  });
  it("stringifies a non-string, non-nullish value", () => {
    expect(formatTurnTimestamp(1700000000000)).not.toBeNull();
  });
});

describe("EmptyStateView", () => {
  it("renders the given message", () => {
    render(<EmptyStateView message="Nothing here" />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
  });
});

describe("scrollRowByPage", () => {
  function makeRect(top: number, height: number) {
    return { top, height, bottom: top + height, left: 0, right: 0, width: 0, x: 0, y: 0, toJSON() {} } as DOMRect;
  }

  it("no-ops when container or row is null", () => {
    expect(() => scrollRowByPage(null, null)).not.toThrow();
    const div = document.createElement("div");
    expect(() => scrollRowByPage(div, null)).not.toThrow();
  });

  it("scrolls down when the row is below the viewport", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 100, configurable: true });
    container.scrollTop = 0;
    container.getBoundingClientRect = () => makeRect(0, 100);
    container.scrollTo = jest.fn();

    const row = document.createElement("div");
    row.getBoundingClientRect = () => makeRect(150, 20);

    scrollRowByPage(container, row);
    expect(container.scrollTo).toHaveBeenCalledWith({ top: 150, behavior: "smooth" });
  });

  it("scrolls up when the row is above the viewport", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 100, configurable: true });
    container.scrollTop = 200;
    container.getBoundingClientRect = () => makeRect(0, 100);
    container.scrollTo = jest.fn();

    const row = document.createElement("div");
    // rowTop relative to container = -50 (above viewTop=200)
    row.getBoundingClientRect = () => makeRect(-50, 20);

    scrollRowByPage(container, row);
    expect(container.scrollTo).toHaveBeenCalled();
  });

  it("does nothing when the row is already fully visible", () => {
    const container = document.createElement("div");
    Object.defineProperty(container, "clientHeight", { value: 100, configurable: true });
    container.scrollTop = 0;
    container.getBoundingClientRect = () => makeRect(0, 100);
    container.scrollTo = jest.fn();

    const row = document.createElement("div");
    row.getBoundingClientRect = () => makeRect(10, 20);

    scrollRowByPage(container, row);
    expect(container.scrollTo).not.toHaveBeenCalled();
  });
});

describe("isTypingTarget", () => {
  it("returns false for null target", () => {
    expect(isTypingTarget(null)).toBe(false);
  });
  it("returns false for an element with no tagName", () => {
    expect(isTypingTarget({} as any)).toBe(false);
  });
  it.each(["INPUT", "TEXTAREA", "SELECT"])("returns true for a %s element", (tag) => {
    const el = document.createElement(tag.toLowerCase());
    expect(isTypingTarget(el)).toBe(true);
  });
  it("returns true for a contentEditable element", () => {
    const el = document.createElement("div");
    Object.defineProperty(el, "isContentEditable", { value: true });
    expect(isTypingTarget(el)).toBe(true);
  });
  it("returns falsy for a plain div", () => {
    // jsdom leaves `isContentEditable` undefined on ordinary elements, so
    // the function's final `||` fallthrough yields `undefined`, not `false`.
    expect(isTypingTarget(document.createElement("div"))).toBeFalsy();
  });
});

describe("ResultPager", () => {
  it("renders nothing when total <= 1", () => {
    const { container } = render(
      <ResultPager currentIndex={0} total={1} onPrev={jest.fn()} onNext={jest.fn()} />,
    );
    expect(container).toBeEmptyDOMElement();
  });

  it("disables Previous at the start and Next at the end", async () => {
    const user = setupUser();
    const onPrev = jest.fn();
    const onNext = jest.fn();
    render(
      <ResultPager currentIndex={0} total={3} onPrev={onPrev} onNext={onNext} />,
    );
    expect(screen.getByText("1 of 3")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Previous/ })).toBeDisabled();
    expect(screen.getByRole("button", { name: /Next/ })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: /Next/ }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it("disables Next at the last index and enables Previous", async () => {
    const user = setupUser();
    const onPrev = jest.fn();
    render(
      <ResultPager currentIndex={2} total={3} onPrev={onPrev} onNext={jest.fn()} />,
    );
    expect(screen.getByRole("button", { name: /Next/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Previous/ }));
    expect(onPrev).toHaveBeenCalledTimes(1);
  });

  it("hides the counter when currentIndex is -1 (not part of the filtered view)", () => {
    render(<ResultPager currentIndex={-1} total={3} onPrev={jest.fn()} onNext={jest.fn()} />);
    expect(screen.queryByText(/of 3/)).not.toBeInTheDocument();
  });
});

describe("TestStats", () => {
  it("renders passed/failed counts and hides errored when 0", () => {
    render(<TestStats passedCount={3} failedCount={1} />);
    expect(screen.getByText("3 passed")).toBeInTheDocument();
    expect(screen.getByText("1 failed")).toBeInTheDocument();
    expect(screen.queryByText(/errored/)).not.toBeInTheDocument();
  });

  it("shows the errored count when > 0", () => {
    render(<TestStats passedCount={3} failedCount={1} erroredCount={2} />);
    expect(screen.getByText("2 errored")).toBeInTheDocument();
  });
});

describe("TestDetailView", () => {
  const baseHistory: TestCaseHistory[] = [
    { role: "user", content: "Hi there", created_at: "2024-01-01T00:00:00.000Z" },
    { role: "assistant", content: "Hello! How can I help?" },
  ];

  it("shows the empty state when there's no history, output, or judge results", () => {
    render(<TestDetailView history={[]} passed={true} />);
    expect(
      screen.getByText("No conversation history available for this test"),
    ).toBeInTheDocument();
  });

  it("renders user and assistant text turns with a timestamp on the user turn", () => {
    render(<TestDetailView history={baseHistory} passed={true} />);
    expect(screen.getByText("Hi there")).toBeInTheDocument();
    expect(screen.getByText("Hello! How can I help?")).toBeInTheDocument();
  });

  it("renders an assistant tool-call turn with its inline tool response", () => {
    const history: TestCaseHistory[] = [
      {
        role: "assistant",
        tool_calls: [
          {
            id: "call-1",
            type: "function",
            function: { name: "lookup", arguments: JSON.stringify({ id: 1 }) },
          },
        ],
      },
      { role: "tool", tool_call_id: "call-1", content: "42" },
    ];
    render(<TestDetailView history={history} passed={true} />);
    expect(screen.getByText("Agent Tool Call")).toBeInTheDocument();
    expect(screen.getByText("lookup")).toBeInTheDocument();
    expect(screen.getByText("Tool Response")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
  });

  it("highlights the last assistant turn as the evaluation target when enabled", () => {
    render(
      <TestDetailView
        history={baseHistory}
        passed={true}
        highlightEvalTarget
      />,
    );
    expect(screen.getByText("Evaluation target")).toBeInTheDocument();
  });

  it("does not highlight any turn when highlightEvalTarget is on but there's no assistant turn", () => {
    render(
      <TestDetailView
        history={[{ role: "user", content: "Hi" }]}
        passed={true}
        highlightEvalTarget
      />,
    );
    expect(screen.queryByText("Evaluation target")).not.toBeInTheDocument();
  });

  it("renders the output text response with a pass/fail border and no reasoning toggle by default", () => {
    render(
      <TestDetailView
        history={[]}
        passed={true}
        output={{ response: "Final answer" }}
      />,
    );
    expect(screen.getByText("Final answer")).toBeInTheDocument();
  });

  it("shows the legacy reasoning toggle when there's no judgeResults but reasoning text exists", async () => {
    const user = setupUser();
    render(
      <TestDetailView
        history={[]}
        passed={false}
        output={{ response: "Nope" }}
        reasoning="Because it was wrong"
      />,
    );
    const toggle = screen.getByRole("button", { name: /reasoning/i });
    await user.click(toggle);
    expect(screen.getByText("Because it was wrong")).toBeInTheDocument();
  });

  it("renders output tool calls with a pass/fail border", () => {
    render(
      <TestDetailView
        history={[]}
        passed={false}
        output={{
          tool_calls: [{ tool: "book", arguments: { id: 1 }, output: "done" }],
        }}
      />,
    );
    expect(screen.getByText("Agent Tool Call")).toBeInTheDocument();
    expect(screen.getByText("book")).toBeInTheDocument();
  });

  it("renders per-evaluator judge results on mobile when present", () => {
    const judgeResults: JudgeResult[] = [
      { evaluator_uuid: "ev-1", match: true, reasoning: "great" },
    ];
    render(
      <TestDetailView
        history={[]}
        passed={true}
        judgeResults={judgeResults}
        evaluatorsByUuid={{
          "ev-1": { uuid: "ev-1", name: "Helpfulness", output_type: "binary" },
        }}
      />,
    );
    expect(screen.getByText("Evaluators")).toBeInTheDocument();
    expect(screen.getByText("Helpfulness")).toBeInTheDocument();
  });

  it("synthesises a legacy evaluator entry from legacyDefaultEvaluator when no evaluatorsByUuid is given", () => {
    render(
      <TestDetailView
        history={[]}
        passed={true}
        reasoning="looks right"
        evaluation={{ type: "response", criteria: "must be polite" }}
        legacyDefaultEvaluator={{ uuid: "legacy-1", name: "Legacy Eval" }}
      />,
    );
    expect(screen.getByText("Legacy Eval")).toBeInTheDocument();
  });

  it("does not build legacy judge results for tool_call evaluation type", () => {
    render(
      <TestDetailView
        history={[]}
        passed={true}
        reasoning="n/a"
        evaluation={{ type: "tool_call", criteria: "ignored" }}
      />,
    );
    expect(screen.getByText("No conversation history available for this test")).toBeInTheDocument();
  });

  it("toggles between UI and JSON conversation views and copies the JSON", async () => {
    const user = setupUser();
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: jest.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    render(
      <TestDetailView
        history={baseHistory}
        passed={true}
        output={{
          response: "final",
          tool_calls: [{ tool: "book", arguments: { id: 1 }, output: "ok" }],
        }}
      />,
    );
    await user.click(screen.getByRole("button", { name: "JSON" }));
    expect(screen.getByRole("button", { name: /Copy/ })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Copy/ }));
    expect(await screen.findByText("Copied")).toBeInTheDocument();
    expect(navigator.clipboard.writeText).toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "UI" }));
    expect(screen.getByText("final")).toBeInTheDocument();
  });
});

describe("EvaluationCriteriaPanel", () => {
  it("renders the test name when given", () => {
    render(<EvaluationCriteriaPanel testName="My test name" />);
    expect(screen.getByText("My test name")).toBeInTheDocument();
  });

  it("renders per-evaluator cards for a response test with judgeResults", () => {
    const judgeResults: JudgeResult[] = [
      {
        evaluator_uuid: "ev-1",
        match: true,
        reasoning: "good",
        variable_values: { criteria: "be nice" },
        value_name: "Nice",
      },
      // No evaluator_uuid -> exercises the `ev = null` / key=`${i}` /
      // variableValues=undefined branches.
      { match: false },
    ];
    render(
      <EvaluationCriteriaPanel
        testType="response"
        judgeResults={judgeResults}
        evaluatorsByUuid={{
          "ev-1": {
            uuid: "ev-1",
            name: "Politeness",
            output_type: "binary",
            scale_min: 0,
            scale_max: 1,
          },
        }}
      />,
    );
    expect(screen.getByText("Politeness")).toBeInTheDocument();
    expect(screen.getByText("Nice")).toBeInTheDocument();
  });

  it("falls back to testCaseEvaluators variable_values when the judge result doesn't carry them inline", () => {
    const judgeResults: JudgeResult[] = [{ evaluator_uuid: "ev-1", match: true }];
    render(
      <EvaluationCriteriaPanel
        testType="response"
        judgeResults={judgeResults}
        evaluatorsByUuid={{
          "ev-1": { uuid: "ev-1", name: "Politeness", output_type: "binary" },
        }}
        testCaseEvaluators={[
          { evaluator_uuid: "ev-1", variable_values: { criteria: "from test case" } },
        ]}
      />,
    );
    expect(screen.getByText("Politeness")).toBeInTheDocument();
  });

  it("renders the legacy free-text criteria fallback when there are no judgeResults", () => {
    render(
      <EvaluationCriteriaPanel
        testType="response"
        evaluation={{ type: "response", criteria: "must say hi" }}
        legacyDefaultEvaluator={{ uuid: "legacy-1", name: "Legacy" }}
      />,
    );
    expect(screen.getByText("Legacy")).toBeInTheDocument();
  });

  it("renders the final empty state when there's no judgeResults and no legacy criteria", () => {
    render(<EvaluationCriteriaPanel testType="response" />);
    expect(screen.getByText("No evaluator details available")).toBeInTheDocument();
  });

  it("renders a tool-call test with a boolean passed verdict and expected tool calls", () => {
    render(
      <EvaluationCriteriaPanel
        testType="tool_call"
        passed={true}
        reasoning="matched"
        evaluation={{
          type: "tool_call",
          tool_calls: [{ tool: "book", arguments: { id: 1 } }],
        }}
      />,
    );
    expect(screen.getByText("Expected Tool Calls")).toBeInTheDocument();
    expect(screen.getByText("book")).toBeInTheDocument();
  });

  it("renders a tool-call test with passed=null via the neutral reasoning strip", () => {
    render(
      <EvaluationCriteriaPanel
        testType="tool_call"
        passed={null}
        reasoning="still running"
        evaluation={{ type: "tool_call" }}
      />,
    );
    expect(screen.getByText("No expected tool calls specified")).toBeInTheDocument();
  });

  it("infers tool_call type from evaluation.tool_calls when testType is absent", () => {
    render(
      <EvaluationCriteriaPanel
        evaluation={{ type: "", tool_calls: [{ tool: "x", arguments: {} }] } as any}
      />,
    );
    expect(screen.getByText("Expected Tool Calls")).toBeInTheDocument();
  });
});
