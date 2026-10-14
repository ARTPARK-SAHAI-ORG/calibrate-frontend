import { renameSelectedTool, renameToolInMessages } from "../renameToolInForm";

const renamed = { uuid: "t1", previousName: "old", name: "new" };

it("renames picked tools by uuid, and loaded ones by their old name", () => {
  const tools = [
    { id: "t1", name: "old", isInbuilt: false },
    { id: "old", name: "old", isInbuilt: false },
    { id: "end_call", name: "End conversation", isInbuilt: true },
    { id: "t2", name: "other", isInbuilt: false },
  ];
  expect(renameSelectedTool(tools, renamed).map((t) => t.name)).toEqual([
    "new",
    "new",
    "End conversation",
    "other",
  ]);
});

it("renames a tool call and the tool response that belongs to it", () => {
  const messages = [
    { id: "m1", role: "user" },
    { id: "c1", role: "tool_call", toolId: "t1", toolName: "old" },
    { id: "r1", role: "tool_response", linkedToolCallId: "c1", toolName: "old" },
    { id: "c2", role: "tool_call", toolId: "call-9", toolName: "old" },
    {
      id: "r2",
      role: "tool_response",
      linkedToolCallId: "call-9",
      toolName: "old",
    },
    { id: "c3", role: "tool_call", toolId: "t2", toolName: "other" },
    { id: "r3", role: "tool_response", linkedToolCallId: "c3", toolName: "other" },
  ];
  expect(
    renameToolInMessages(messages, renamed).map((m) => m.toolName),
  ).toEqual([undefined, "new", "new", "new", "new", "other", "other"]);
});
