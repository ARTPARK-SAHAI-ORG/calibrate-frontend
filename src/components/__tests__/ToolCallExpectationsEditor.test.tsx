import {
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
