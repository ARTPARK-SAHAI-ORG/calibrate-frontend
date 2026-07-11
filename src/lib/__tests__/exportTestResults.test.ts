import {
  buildTestRunCsv,
  buildBenchmarkCsv,
  type ExportTestRow,
  type ExportBenchmarkRow,
} from "@/lib/exportTestResults";
import type { JudgeResult, TestRunEvaluator } from "@/components/test-results/shared";

function col(columns: { key: string; header: string }[], key: string) {
  return columns.find((c) => c.key === key);
}

describe("buildTestRunCsv", () => {
  it("filters out running/pending/queued rows, keeping passed/failed/error", () => {
    const results: ExportTestRow[] = [
      { name: "a", status: "passed" },
      { name: "b", status: "running" },
      { name: "c", status: "pending" },
      { name: "d", status: "queued" },
      { name: "e", status: "failed" },
      { name: "f", status: "error" },
    ];
    const { rows } = buildTestRunCsv(results);
    expect(rows.map((r) => r.name)).toEqual(["a", "e", "f"]);
  });

  it("has the base columns with no tool-call and no evaluator data", () => {
    const results: ExportTestRow[] = [{ name: "a", status: "passed" }];
    const { columns } = buildTestRunCsv(results);
    expect(columns).toEqual([
      { key: "name", header: "name" },
      { key: "status", header: "status" },
      { key: "history", header: "conversation_history" },
      { key: "agent_response", header: "agent_response" },
    ]);
  });

  it("defaults name to empty string when absent", () => {
    const results: ExportTestRow[] = [{ status: "passed" }];
    const { rows } = buildTestRunCsv(results);
    expect(rows[0].name).toBe("");
  });

  it("maps status through statusLabel, passing through unknown strings", () => {
    const results: ExportTestRow[] = [
      { status: "passed" },
      { status: "failed" },
      { status: "error" },
    ];
    const { rows } = buildTestRunCsv(results);
    expect(rows.map((r) => r.status)).toEqual(["passed", "failed", "error"]);
  });

  it("serializes conversation history to JSON, empty string when absent", () => {
    const results: ExportTestRow[] = [
      {
        status: "passed",
        testCase: {
          history: [{ role: "user", content: "hi" }],
        },
      },
      { status: "passed", testCase: { history: [] } },
      { status: "passed", testCase: null },
      { status: "passed" },
    ];
    const { rows } = buildTestRunCsv(results);
    expect(rows[0].history).toBe(
      JSON.stringify([{ role: "user", content: "hi" }]),
    );
    expect(rows[1].history).toBe("");
    expect(rows[2].history).toBe("");
    expect(rows[3].history).toBe("");
  });

  it("formats agent_response from response only", () => {
    const results: ExportTestRow[] = [
      { status: "passed", output: { response: "hello" } },
    ];
    const { rows } = buildTestRunCsv(results);
    expect(rows[0].agent_response).toBe("hello");
  });

  it("formats agent_response from tool_calls only as JSON", () => {
    const toolCalls = [{ id: "1", name: "foo", arguments: "{}" }];
    const results: ExportTestRow[] = [
      {
        status: "passed",
        output: { tool_calls: toolCalls as any },
      },
    ];
    const { rows } = buildTestRunCsv(results);
    expect(rows[0].agent_response).toBe(JSON.stringify(toolCalls));
  });

  it("formats agent_response as combined object when both response and tool_calls present", () => {
    const toolCalls = [{ id: "1", name: "foo", arguments: "{}" }];
    const results: ExportTestRow[] = [
      {
        status: "passed",
        output: { response: "hi", tool_calls: toolCalls as any },
      },
    ];
    const { rows } = buildTestRunCsv(results);
    expect(rows[0].agent_response).toBe(
      JSON.stringify({ response: "hi", tool_calls: toolCalls }),
    );
  });

  it("formats agent_response as empty string for empty response and empty tool_calls", () => {
    const results: ExportTestRow[] = [
      { status: "passed", output: { response: "", tool_calls: [] } },
      { status: "passed", output: {} },
      { status: "passed", output: null },
      { status: "passed" },
    ];
    const { rows } = buildTestRunCsv(results);
    expect(rows.map((r) => r.agent_response)).toEqual(["", "", "", ""]);
  });

  it("adds tool_call_result/reasoning columns only when at least one row is a tool-call test (via evaluation.type)", () => {
    const results: ExportTestRow[] = [
      {
        status: "passed",
        testCase: { evaluation: { type: "tool_call" } },
        reasoning: "matched",
      },
      { status: "failed", testCase: { evaluation: { type: "response" } } },
    ];
    const { columns, rows } = buildTestRunCsv(results);
    expect(col(columns, "tool_call_result")).toBeDefined();
    expect(col(columns, "tool_call_reasoning")).toBeDefined();
    expect(rows[0].tool_call_result).toBe("true");
    expect(rows[0].tool_call_reasoning).toBe("matched");
    expect(rows[1].tool_call_result).toBe("");
    expect(rows[1].tool_call_reasoning).toBe("");
  });

  it("marks tool_call_result false for a failed tool-call row", () => {
    const results: ExportTestRow[] = [
      { status: "failed", testCase: { evaluation: { type: "tool_call" } } },
    ];
    const { rows } = buildTestRunCsv(results);
    expect(rows[0].tool_call_result).toBe("false");
  });

  it("marks tool_call_result empty for an errored tool-call row", () => {
    const results: ExportTestRow[] = [
      { status: "error", testCase: { evaluation: { type: "tool_call" } } },
    ];
    const { rows } = buildTestRunCsv(results);
    expect(rows[0].tool_call_result).toBe("");
  });

  it("falls back to peeking at output.tool_calls when evaluation.type is absent", () => {
    const results: ExportTestRow[] = [
      {
        status: "passed",
        output: { tool_calls: [{ id: "1" } as any] },
      },
    ];
    const { columns, rows } = buildTestRunCsv(results);
    expect(col(columns, "tool_call_result")).toBeDefined();
    expect(rows[0].tool_call_result).toBe("true");
  });

  it("treats absent testCase/output as a non-tool-call (response) test", () => {
    const results: ExportTestRow[] = [{ status: "passed" }];
    const { columns } = buildTestRunCsv(results);
    expect(col(columns, "tool_call_result")).toBeUndefined();
  });

  it("does not add tool-call columns when no row is a tool-call test", () => {
    const results: ExportTestRow[] = [
      { status: "passed", testCase: { evaluation: { type: "response" } } },
    ];
    const { columns, rows } = buildTestRunCsv(results);
    expect(col(columns, "tool_call_result")).toBeUndefined();
    expect(rows[0].tool_call_result).toBeUndefined();
  });

  describe("evaluator columns", () => {
    const evaluatorsByUuid: Record<string, TestRunEvaluator> = {
      "uuid-1": {
        uuid: "uuid-1",
        name: "Correctness",
        output_type: "binary",
      },
      "uuid-2": {
        uuid: "uuid-2",
        name: "Helpfulness",
        output_type: "rating",
        scale_max: 5,
      },
    };

    it("builds value/reasoning columns for each distinct evaluator (by uuid)", () => {
      const results: ExportTestRow[] = [
        {
          status: "passed",
          judgeResults: [
            {
              evaluator_uuid: "uuid-1",
              match: true,
              reasoning: "good",
            } as JudgeResult,
          ],
        },
      ];
      const { columns, rows } = buildTestRunCsv(results, evaluatorsByUuid);
      const valueCol = columns.find((c) => c.header === "Correctness/value");
      const reasonCol = columns.find(
        (c) => c.header === "Correctness/reasoning",
      );
      expect(valueCol).toBeDefined();
      expect(reasonCol).toBeDefined();
      expect(rows[0][valueCol!.key]).toBe("true");
      expect(rows[0][reasonCol!.key]).toBe("good");
    });

    it("formats a false match", () => {
      const results: ExportTestRow[] = [
        {
          status: "passed",
          judgeResults: [
            { evaluator_uuid: "uuid-1", match: false } as JudgeResult,
          ],
        },
      ];
      const { columns, rows } = buildTestRunCsv(results, evaluatorsByUuid);
      const valueCol = columns.find((c) => c.header === "Correctness/value");
      expect(rows[0][valueCol!.key]).toBe("false");
    });

    it("formats a rating score with scale_max", () => {
      const results: ExportTestRow[] = [
        {
          status: "passed",
          judgeResults: [
            { evaluator_uuid: "uuid-2", score: 4 } as JudgeResult,
          ],
        },
      ];
      const { columns, rows } = buildTestRunCsv(results, evaluatorsByUuid);
      const valueCol = columns.find((c) => c.header === "Helpfulness/value");
      expect(rows[0][valueCol!.key]).toBe("4/5");
    });

    it("formats a rating score without a known scale_max", () => {
      const results: ExportTestRow[] = [
        {
          status: "passed",
          judgeResults: [
            { evaluator_uuid: "uuid-3", score: 7 } as JudgeResult,
          ],
        },
      ];
      const { columns, rows } = buildTestRunCsv(results, {});
      const valueCol = columns.find((c) => c.header === "Evaluator/value");
      expect(rows[0][valueCol!.key]).toBe("7");
    });

    it("returns empty string when a judge result has neither match nor score", () => {
      const results: ExportTestRow[] = [
        {
          status: "passed",
          judgeResults: [{ evaluator_uuid: "uuid-1" } as JudgeResult],
        },
      ];
      const { columns, rows } = buildTestRunCsv(results, evaluatorsByUuid);
      const valueCol = columns.find((c) => c.header === "Correctness/value");
      expect(rows[0][valueCol!.key]).toBe("");
    });

    it("leaves evaluator cells empty for rows missing that evaluator's verdict", () => {
      const results: ExportTestRow[] = [
        {
          status: "passed",
          judgeResults: [{ evaluator_uuid: "uuid-1", match: true } as JudgeResult],
        },
        { status: "failed" },
      ];
      const { columns, rows } = buildTestRunCsv(results, evaluatorsByUuid);
      const valueCol = columns.find((c) => c.header === "Correctness/value");
      expect(rows[1][valueCol!.key]).toBe("");
    });

    it("disambiguates evaluators sharing the same display name", () => {
      const dupEvaluators: Record<string, TestRunEvaluator> = {
        "uuid-a": { uuid: "uuid-a", name: "Same", output_type: "binary" },
        "uuid-b": { uuid: "uuid-b", name: "Same", output_type: "binary" },
      };
      const results: ExportTestRow[] = [
        {
          status: "passed",
          judgeResults: [
            { evaluator_uuid: "uuid-a", match: true } as JudgeResult,
            { evaluator_uuid: "uuid-b", match: false } as JudgeResult,
          ],
        },
      ];
      const { columns } = buildTestRunCsv(results, dupEvaluators);
      const headers = columns.map((c) => c.header);
      expect(headers).toContain("Same/value");
      expect(headers).toContain("Same (2)/value");
    });

    it("falls back to positional key and 'Evaluator' name when evaluator_uuid is absent", () => {
      const results: ExportTestRow[] = [
        {
          status: "passed",
          judgeResults: [
            { match: true } as JudgeResult,
            { match: false } as JudgeResult,
          ],
        },
      ];
      const { columns, rows } = buildTestRunCsv(results, {});
      // Two positional evaluators both named "Evaluator", disambiguated.
      const headers = columns.map((c) => c.header);
      expect(headers).toContain("Evaluator/value");
      expect(headers).toContain("Evaluator (2)/value");
    });

    it("builds a variable column per distinct variable name, unioned across rows, first-seen order", () => {
      const results: ExportTestRow[] = [
        {
          status: "passed",
          judgeResults: [
            {
              evaluator_uuid: "uuid-1",
              match: true,
              variable_values: { foo: "1" },
            } as JudgeResult,
          ],
        },
        {
          status: "failed",
          judgeResults: [
            {
              evaluator_uuid: "uuid-1",
              match: false,
              variable_values: { foo: "2", bar: "3" },
            } as JudgeResult,
          ],
        },
      ];
      const { columns, rows } = buildTestRunCsv(results, evaluatorsByUuid);
      const headers = columns.map((c) => c.header);
      expect(headers).toEqual([
        "name",
        "status",
        "conversation_history",
        "agent_response",
        "Correctness/value",
        "Correctness/foo",
        "Correctness/bar",
        "Correctness/reasoning",
      ]);
      const fooCol = columns.find((c) => c.header === "Correctness/foo")!;
      const barCol = columns.find((c) => c.header === "Correctness/bar")!;
      expect(rows[0][fooCol.key]).toBe("1");
      expect(rows[0][barCol.key]).toBe("");
      expect(rows[1][fooCol.key]).toBe("2");
      expect(rows[1][barCol.key]).toBe("3");
    });

    it("excludes evaluator columns for tool-call rows (judgeResults nulled out)", () => {
      const results: ExportTestRow[] = [
        {
          status: "passed",
          testCase: { evaluation: { type: "tool_call" } },
          judgeResults: [
            { evaluator_uuid: "uuid-1", match: true } as JudgeResult,
          ],
        },
      ];
      const { columns, rows } = buildTestRunCsv(results, evaluatorsByUuid);
      // Since the only row is a tool-call test, collectEvaluatorColumns still
      // scans raw judgeResults (unfiltered) to build columns...
      const valueCol = columns.find((c) => c.header === "Correctness/value");
      expect(valueCol).toBeDefined();
      // ...but the row's own cell is blanked because isToolCall nulls out judgeResults.
      expect(rows[0][valueCol!.key]).toBe("");
    });
  });
});

describe("buildBenchmarkCsv", () => {
  it("filters out rows with passed === null", () => {
    const rows: ExportBenchmarkRow[] = [
      { model: "gpt-4", name: "a", passed: true },
      { model: "gpt-4", name: "b", passed: null },
      { model: "gpt-4", name: "c", passed: false },
    ];
    const { rows: out } = buildBenchmarkCsv(rows);
    expect(out.map((r) => r.name)).toEqual(["a", "c"]);
  });

  it("includes model column and passed/failed status", () => {
    const rows: ExportBenchmarkRow[] = [
      { model: "gpt-4", name: "a", passed: true },
      { model: "claude", name: "b", passed: false },
    ];
    const { columns, rows: out } = buildBenchmarkCsv(rows);
    expect(columns[0]).toEqual({ key: "model", header: "model" });
    expect(out[0]).toMatchObject({ model: "gpt-4", status: "passed" });
    expect(out[1]).toMatchObject({ model: "claude", status: "failed" });
  });

  it("defaults name to empty string when absent", () => {
    const rows: ExportBenchmarkRow[] = [{ model: "gpt-4", passed: true }];
    const { rows: out } = buildBenchmarkCsv(rows);
    expect(out[0].name).toBe("");
  });

  it("serializes history and agent_response the same way as buildTestRunCsv", () => {
    const rows: ExportBenchmarkRow[] = [
      {
        model: "gpt-4",
        passed: true,
        testCase: { history: [{ role: "user", content: "hi" }] },
        output: { response: "hello" },
      },
    ];
    const { rows: out } = buildBenchmarkCsv(rows);
    expect(out[0].history).toBe(
      JSON.stringify([{ role: "user", content: "hi" }]),
    );
    expect(out[0].agent_response).toBe("hello");
  });

  it("adds tool-call columns when a row is a tool-call test and marks pass/fail", () => {
    const rows: ExportBenchmarkRow[] = [
      {
        model: "gpt-4",
        passed: true,
        testCase: { evaluation: { type: "tool_call" } },
        reasoning: "matched",
      },
      {
        model: "gpt-4",
        passed: false,
        testCase: { evaluation: { type: "tool_call" } },
      },
    ];
    const { columns, rows: out } = buildBenchmarkCsv(rows);
    expect(col(columns, "tool_call_result")).toBeDefined();
    expect(out[0].tool_call_result).toBe("true");
    expect(out[0].tool_call_reasoning).toBe("matched");
    expect(out[1].tool_call_result).toBe("false");
    expect(out[1].tool_call_reasoning).toBe("");
  });

  it("does not add tool-call columns when no row is a tool-call test", () => {
    const rows: ExportBenchmarkRow[] = [
      { model: "gpt-4", passed: true, testCase: { evaluation: { type: "response" } } },
    ];
    const { columns } = buildBenchmarkCsv(rows);
    expect(col(columns, "tool_call_result")).toBeUndefined();
  });

  it("builds evaluator columns and cells from judgeResults", () => {
    const evaluatorsByUuid: Record<string, TestRunEvaluator> = {
      "uuid-1": { uuid: "uuid-1", name: "Correctness", output_type: "binary" },
    };
    const rows: ExportBenchmarkRow[] = [
      {
        model: "gpt-4",
        passed: true,
        judgeResults: [
          { evaluator_uuid: "uuid-1", match: true, reasoning: "ok" } as JudgeResult,
        ],
      },
    ];
    const { columns, rows: out } = buildBenchmarkCsv(rows, evaluatorsByUuid);
    const valueCol = columns.find((c) => c.header === "Correctness/value")!;
    const reasonCol = columns.find(
      (c) => c.header === "Correctness/reasoning",
    )!;
    expect(out[0][valueCol.key]).toBe("true");
    expect(out[0][reasonCol.key]).toBe("ok");
  });

  it("nulls out judgeResults for tool-call rows when building cells", () => {
    const evaluatorsByUuid: Record<string, TestRunEvaluator> = {
      "uuid-1": { uuid: "uuid-1", name: "Correctness", output_type: "binary" },
    };
    const rows: ExportBenchmarkRow[] = [
      {
        model: "gpt-4",
        passed: true,
        testCase: { evaluation: { type: "tool_call" } },
        judgeResults: [
          { evaluator_uuid: "uuid-1", match: true } as JudgeResult,
        ],
      },
    ];
    const { columns, rows: out } = buildBenchmarkCsv(rows, evaluatorsByUuid);
    const valueCol = columns.find((c) => c.header === "Correctness/value")!;
    expect(out[0][valueCol.key]).toBe("");
  });
});
