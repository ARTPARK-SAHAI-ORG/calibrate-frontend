import { useEffect } from "react";
import { act, render, screen, setupUser, waitFor } from "@/test-utils";
import {
  ToolCallExpectationsEditor,
  useToolCallExpectations,
  selectedToolsHaveInvalidParams,
  selectedToolsToCalls,
  toolCallsToSelectedTools,
} from "../ToolCallExpectationsEditor";
import type { AvailableTool } from "../ToolPicker";

const WEATHER = {
  uuid: "t-w",
  name: "get_weather",
  config: {
    parameters: {
      properties: { city: { type: "string" }, days: { type: "integer" } },
      required: ["city"],
    },
  },
} as unknown as AvailableTool;

describe("toolCallsToSelectedTools and selectedToolsToCalls", () => {
  it("round-trips calls with each kind of parameter check", () => {
    const calls = [
      {
        tool: "get_weather",
        arguments: {
          city: { match_type: "llm_judge", criteria: "A city in India" },
          days: { match_type: "exact", value: 3 },
        },
        accept_any_arguments: false,
      },
      { tool: "get_weather", arguments: {}, accept_any_arguments: true },
      {
        tool: "unknown_tool",
        arguments: { note: { match_type: "any" } },
        accept_any_arguments: false,
      },
    ];
    expect(
      selectedToolsToCalls(toolCallsToSelectedTools(calls, [WEATHER])),
    ).toEqual(calls);
  });

  it("reads a tool's schema when the tool is known", () => {
    const [row] = toolCallsToSelectedTools(
      [{ tool: "get_weather", arguments: { city: "Pune" } }],
      [WEATHER],
    );
    expect(row.allowCustomParameters).toBe(false);
    expect(row.expectedParameters.map((p) => [p.name, p.required])).toEqual([
      ["city", true],
    ]);
  });

  it("keeps a call that should not be made on a re-save", () => {
    const calls = [
      {
        tool: "get_weather",
        arguments: {},
        accept_any_arguments: true,
        is_called: false,
      },
    ];
    expect(
      selectedToolsToCalls(toolCallsToSelectedTools(calls, [WEATHER])),
    ).toEqual(calls);
  });

  it("gives back no rows for no calls", () => {
    expect(toolCallsToSelectedTools(undefined, [])).toEqual([]);
    expect(toolCallsToSelectedTools([], [])).toEqual([]);
  });
});

describe("selectedToolsHaveInvalidParams", () => {
  it("flags an empty required value unless any value is accepted", () => {
    const calls = [{ tool: "get_weather", arguments: { city: "" } }];
    const rows = toolCallsToSelectedTools(calls, [WEATHER]);
    expect(selectedToolsHaveInvalidParams(rows)).toBe(true);
    expect(
      selectedToolsHaveInvalidParams([
        { ...rows[0], acceptAnyParameterValues: true },
      ]),
    ).toBe(false);
    expect(
      selectedToolsHaveInvalidParams(
        toolCallsToSelectedTools(
          [{ tool: "get_weather", arguments: { city: "Pune" } }],
          [WEATHER],
        ),
      ),
    ).toBe(false);
  });
});

describe("a labelling item's stored expected calls", () => {
  const stored = [
    { tool: "get_weather", arguments: { city: "", days: "" } },
    { tool: "save", arguments: { months: 7 } },
  ];

  it("saves calls the person did not change exactly as stored", () => {
    const rows = toolCallsToSelectedTools(stored, [WEATHER], true);
    expect(JSON.stringify(selectedToolsToCalls(rows))).toBe(
      JSON.stringify(stored),
    );
    expect(selectedToolsHaveInvalidParams(rows)).toBe(false);
  });

  it("converts only the call the person edited", () => {
    const rows = toolCallsToSelectedTools(stored, [WEATHER], true);
    const edited = [
      rows[0],
      {
        ...rows[1],
        expectedParameters: [{ ...rows[1].expectedParameters[0], value: "8" }],
      },
    ];
    expect(selectedToolsToCalls(edited)).toEqual([
      stored[0],
      {
        tool: "save",
        arguments: { months: { match_type: "exact", value: 8 } },
        accept_any_arguments: false,
      },
    ]);
  });
});

describe("two expected calls to the same tool", () => {
  it("removes only the card the person removed", async () => {
    const user = setupUser();
    const calls = [
      { tool: "save", arguments: { months: 7 } },
      { tool: "save", arguments: { months: 9 } },
    ];
    let editor!: ReturnType<typeof useToolCallExpectations>;
    function Harness() {
      editor = useToolCallExpectations();
      useEffect(() => {
        editor.reset(toolCallsToSelectedTools(calls, [], true));
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return (
        <ToolCallExpectationsEditor
          editor={editor}
          heading="Expected tool calls"
          emptyText="No tools"
          availableTools={[]}
          availableToolsLoading={false}
          onToolSaved={() => {}}
          onCreateTool={() => {}}
          showErrors={false}
        />
      );
    }
    render(<Harness />);
    const removes = await screen.findAllByRole("button", { name: "Remove save" });
    await user.click(removes[0]);
    expect(selectedToolsToCalls(editor.selectedTools)).toEqual([calls[1]]);
  });
});

describe("card ids", () => {
  it("never repeat between stored cards and added ones, even for a tool named card", async () => {
    const calls = Array.from({ length: 50 }, () => ({
      tool: "card",
      arguments: {},
    }));
    let editor!: ReturnType<typeof useToolCallExpectations>;
    function Harness() {
      editor = useToolCallExpectations();
      useEffect(() => {
        editor.reset(toolCallsToSelectedTools(calls, [], true));
        // eslint-disable-next-line react-hooks/exhaustive-deps
      }, []);
      return null;
    }
    render(<Harness />);
    await waitFor(() => expect(editor.selectedTools).toHaveLength(50));
    act(() => editor.addToolFromSelection(WEATHER));
    const ids = editor.selectedTools.map((t) => t.cardId);
    expect(ids).toHaveLength(51);
    expect(new Set(ids).size).toBe(51);
  });
});
