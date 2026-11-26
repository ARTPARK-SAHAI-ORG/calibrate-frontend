import { traceValue } from "../traceValue";
import type { TraceDetail } from "@/lib/tracesApi";

const trace = (over: Partial<TraceDetail> = {}): TraceDetail => ({
  uuid: "t1",
  agent_id: "a",
  message_id: "m-1",
  conversation_id: null,
  input: [
    { role: "user", content: "Hi" },
    { role: "assistant", content: "" },
    { role: "user", content: "Help" },
  ],
  output: { response: "Sure", tool_calls: [{ tool: "book", arguments: { d: 1 } }] },
  metadata: [{ key: "lang", value: "Hindi" }, { key: "blank", value: "  " }],
  labels: ["a", "b"],
  created_at: "",
  updated_at: "",
  ...over,
});

it("reads each part the way the backend does", () => {
  const t = trace();
  expect(traceValue(t, "input")).toBe("user: Hi\nuser: Help");
  expect(traceValue(trace({ input: "One input" }), "input")).toBe("One input");
  expect(traceValue(t, "output.response")).toBe("Sure");
  expect(traceValue(t, "output.tool_calls")).toBe(
    '[{"tool":"book","arguments":{"d":1}}]',
  );
  expect(traceValue(t, "labels")).toBe("a, b");
  expect(traceValue(t, "message_id")).toBe("m-1");
  expect(traceValue(t, "metadata.lang")).toBe("Hindi");
});

it("reads nothing where the trace has nothing", () => {
  const t = trace({ output: {}, labels: [], metadata: null });
  expect(traceValue(t, "output.response")).toBeNull();
  expect(traceValue(t, "output.tool_calls")).toBeNull();
  expect(traceValue(t, "labels")).toBeNull();
  expect(traceValue(t, "conversation_id")).toBeNull();
  expect(traceValue(t, "metadata.lang")).toBeNull();
  expect(traceValue(trace(), "metadata.blank")).toBeNull();
  expect(traceValue(trace(), "somewhere_new")).toBeNull();
});
